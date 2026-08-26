"""Synthetic corpus generator for demo and statistics work.

Writes realistic Telegram-style posts into raw_messages and then lets the normal
pipeline do the rest — regex price extraction, classification, dedup, canonical
listings. Nothing here writes to `listings` directly, which matters for two
reasons: the generated corpus exercises the same code path as real ingestion (so
a classifier bug shows up here rather than on demo day), and every generated
listing gets genuine channel attribution and dedup behaviour.

Why we need it: price fairness is only meaningful with enough comparables per
bucket, and the real Telegram sample we hold is 89 messages. See MIN_SAMPLE in
lib/price-stats-config.ts — below 8 comparables the product deliberately shows
no range at all, which is correct but leaves most of the catalogue blank.

Prices are drawn log-normally around a researched Addis median rather than
uniformly: a uniform spread produces an interquartile range that looks obviously
synthetic to anyone who knows the market, which defeats the point of a fairness
signal.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence

from ingest.db import Database


@dataclass(frozen=True)
class Item:
    """One product archetype and what it typically goes for in Addis."""

    title_en: str
    title_am: str
    median_etb: int
    #: Multiplicative spread. 0.25 means most asking prices land within ~+/-25%.
    spread: float = 0.28
    #: Condition weights: brand_new, lightly_used, fair.
    weights: tuple = (0.2, 0.55, 0.25)


AREAS = [
    ("Bole", "ቦሌ"), ("Piassa", "ፒያሳ"), ("Megenagna", "መገናኛ"), ("CMC", "ሲኤምሲ"),
    ("Sarbet", "ሳርቤት"), ("Kazanchis", "ካዛንቺስ"), ("Gerji", "ገርጂ"), ("Ayat", "አያት"),
    ("Summit", "ሰሚት"), ("Lebu", "ለቡ"), ("Saris", "ሳሪስ"), ("Jemo", "ጀሞ"),
    ("Kolfe", "ኮልፌ"), ("Merkato", "መርካቶ"), ("Gurd Shola", "ጉርድ ሾላ"),
    ("Hayahulet", "ሃያሁለት"), ("Kality", "ቃሊቲ"), ("Old Airport", "ኦልድ ኤርፖርት"),
]

#: Condition wording, per condition, in both languages. These are the exact
#: phrases classify_condition() in gemini_client.py keys on — generating text it
#: cannot read back would silently produce a corpus with no conditions.
CONDITION_PHRASES = {
    "brand_new": [
        "Brand new, sealed in box with full warranty.",
        "አዲስ ያልተከፈተ በካርቶኑ ያለ።",
        "Brand new and unused, receipt available.",
    ],
    "lightly_used": [
        "Lightly used, excellent condition with no scratches.",
        "በጣም ንፁህ ትንሽ የተሰራበት ምንም ችግር የለውም።",
        "Gently used for a few months, like new.",
    ],
    "fair": [
        "Fair condition, some visible scratches but fully working.",
        "ያገለገለ መካከለኛ ሁኔታ ላይ ያለ ግን ስራው ጥሩ ነው።",
        "Well used with cosmetic wear, everything functions.",
    ],
}

CATALOGUE: dict[str, List[Item]] = {
    "phones": [
        Item("Apple iPhone 11 64GB", "አይፎን 11 64GB", 28000),
        Item("Apple iPhone 12 128GB", "አይፎን 12 128GB", 38000),
        Item("Apple iPhone 12 Pro 256GB", "አይፎን 12 ፕሮ 256GB", 46000),
        Item("Apple iPhone 13 128GB", "አይፎን 13 128GB", 55000),
        Item("Apple iPhone 13 Pro Max 256GB", "አይፎን 13 ፕሮ ማክስ 256GB", 78000),
        Item("Apple iPhone 14 128GB", "አይፎን 14 128GB", 72000),
        Item("Samsung Galaxy A54 5G 128GB", "ሳምሱንግ ጋላክሲ A54 128GB", 24500),
        Item("Samsung Galaxy S22 Ultra 256GB", "ሳምሱንግ ጋላክሲ S22 አልትራ", 52000),
        Item("Samsung Galaxy A14 64GB", "ሳምሱንግ ጋላክሲ A14", 13500),
        Item("Redmi Note 12 128GB", "ሬድሚ ኖት 12 128GB", 15500),
        Item("Tecno Camon 20 Pro 256GB", "ቴክኖ ካሞን 20 ፕሮ", 13800),
        Item("Infinix Hot 30i 128GB", "ኢንፊኒክስ ሆት 30i", 9500),
        Item("Apple iPad 9th Gen 64GB", "አፕል አይፓድ 9ኛ ትውልድ", 29500),
        Item("Apple AirPods Pro 2nd Gen", "አፕል ኤርፖድስ ፕሮ", 14000),
    ],
    "computers": [
        Item("Apple MacBook Air M1 8GB 256GB", "ማክቡክ ኤር M1", 65000),
        Item("Apple MacBook Pro 14 M2", "ማክቡክ ፕሮ 14", 125000),
        Item("HP EliteBook 840 G7 Core i5", "ኤችፒ ኤሊትቡክ 840", 38500),
        Item("Dell Latitude 5420 Core i7", "ዴል ላቲቲዩድ 5420", 42000),
        Item("Lenovo ThinkPad T480 Core i5", "ሌኖቮ ቲንክፓድ T480", 27000),
        Item("Lenovo IdeaPad 3 Core i3", "ሌኖቮ አይዲያፓድ 3", 22000),
        Item("Custom Gaming PC Core i7 RTX 3060", "ጌሚንግ ኮምፒውተር RTX 3060", 115000),
        Item("Dell 24 inch IPS Monitor", "ዴል 24 ኢንች ሞኒተር", 9500),
        Item("HP LaserJet Pro M404dn Printer", "ኤችፒ ሌዘርጄት ፕሪንተር", 19500),
    ],
    "furniture": [
        Item("L-Shape Fabric Sofa with Table", "ኤል ቅርጽ ሶፋ ከነ ጠረጴዛው", 24000),
        Item("Three Seater Leather Sofa", "ባለ ሶስት ሰው የቆዳ ሶፋ", 19500),
        Item("King Size Bed with Medicated Mattress", "ኪንግ ሳይዝ አልጋ ከነ ፍራሹ", 18500),
        Item("Six Seater Wooden Dining Table", "ባለ 6 ወንበር የመመገቢያ ጠረጴዛ", 21000),
        Item("Three Door Wardrobe with Mirror", "ባለ ሶስት በር ቁም ሳጥን", 11500),
        Item("Ergonomic Mesh Office Chair", "የቢሮ ወንበር", 6500),
        Item("Five Tier Wooden Bookshelf", "ባለ አምስት ደረጃ መደርደሪያ", 4800),
        Item("Glass Top Coffee Table", "የመስታወት ጠረጴዛ", 5200),
    ],
    "appliances": [
        Item("LG Double Door Refrigerator 340L", "ኤልጂ ባለ ሁለት በር ፍሪጅ", 36000),
        Item("Samsung Front Load Washing Machine 8kg", "ሳምሱንግ የልብስ ማጠቢያ", 28000),
        Item("Digital Microwave Oven 25L", "ማይክሮዌቭ 25 ሊትር", 9000),
        Item("Four Burner Gas Stove with Oven", "ባለ አራት ምድጃ ጋዝ ምድጃ", 14500),
        Item("Philips Air Fryer 4.1L Digital", "ፊሊፕስ ኤር ፍራየር", 7500),
        Item("Electric Injera Mitad 60cm", "የኤሌክትሪክ የእንጀራ ምጣድ", 5800),
        Item("Hot and Cold Water Dispenser", "የውሃ ማቀዝቀዣ", 8200),
    ],
    "tv-audio": [
        Item("Samsung 55 inch Crystal UHD Smart TV", "ሳምሱንግ 55 ኢንች ስማርት ቲቪ", 38000),
        Item("Hisense 43 inch Smart TV", "ሂሴንስ 43 ኢንች ስማርት ቲቪ", 22000),
        Item("LG 65 inch OLED Smart TV", "ኤልጂ 65 ኢንች ቲቪ", 78000),
        Item("Sony PlayStation 5 Disc Edition", "ሶኒ ፕሌይስቴሽን 5", 58000),
        Item("JBL PartyBox 110 Bluetooth Speaker", "ጄቢኤል ስፒከር", 28000),
        Item("Sony 5.1 Home Theatre System", "ሶኒ ሆም ቲያትር", 24000),
        Item("Samsung Soundbar 2.1 Channel", "ሳምሱንግ ሳውንድባር", 12000),
    ],
    "vehicles": [
        Item("Toyota Vitz 2008 Automatic", "ቶዮታ ቪትዝ 2008", 1180000, spread=0.18),
        Item("Toyota RAV4 2018 Automatic", "ቶዮታ ራቭ4 2018", 3850000, spread=0.18),
        Item("Suzuki Alto 2016 Manual", "ሱዙኪ አልቶ 2016", 920000, spread=0.18),
        Item("Hyundai Grand i10 2017 Automatic", "ሁንዳይ ግራንድ i10", 1350000, spread=0.18),
        Item("Bajaj 2019 Model Four Stroke", "ባጃጅ 2019 ሞዴል", 440000, spread=0.2),
        Item("Motorcycle 150cc Street Bike", "ሞተር ሳይክል 150cc", 85000, spread=0.22),
    ],
    "fashion": [
        Item("Nike Air Jordan 1 Retro High OG", "ናይክ ኤር ጆርዳን 1", 4500),
        Item("Adidas Ultraboost Running Shoes", "አዲዳስ ጫማ", 3800),
        Item("Samsonite Hard Shell Luggage 24 inch", "ሳምሶናይት ሻንጣ", 5600),
        Item("Genuine Leather Jacket Men", "የቆዳ ጃኬት", 6500),
        Item("Ethiopian Cotton Netela Hand Woven", "የኢትዮጵያ ነጠላ", 2200),
        Item("Habesha Kemis Hand Embroidered", "ሀበሻ ቀሚስ", 7500),
        Item("Casio Edifice Wristwatch", "ካሲዮ ሰዓት", 3500),
        Item("Women's Leather Handbag", "የሴቶች የቆዳ ቦርሳ", 2800),
    ],
    "kids": [
        Item("Chicco Foldable Baby Stroller", "ቺኮ የሕፃናት ጋሪ", 6800),
        Item("Wooden Baby Cot with Mattress", "የሕፃናት የእንጨት አልጋ", 8200),
        Item("Montessori Wooden Learning Toys 40pcs", "የእንጨት ሞንቴሶሪ መጫወቻ", 1600),
        Item("Kids Bicycle 16 Inch with Training Wheels", "የልጆች ብስክሌት 16 ኢንች", 3800),
        Item("Electric Baby Swing with Music", "የኤሌክትሪክ የሕፃናት ዥዋዥዌ", 4900),
        Item("Infantino Baby Carrier Three Position", "የሕፃናት ማዘያ", 3300),
        Item("Baby High Chair Adjustable", "የሕፃናት ወንበር", 3900),
    ],
    "tools": [
        Item("Generator 3.5kVA Petrol Silent", "ጀነሬተር 3.5kVA", 46000),
        Item("Bosch Professional Cordless Hammer Drill", "ቦሽ መሰርሰሪያ", 9800),
        Item("Mechanic Hand Tool Set 150 Pieces", "የስራ መሳሪያ ስብስብ 150", 12500),
        Item("Inverter Welding Machine 200A", "የብየዳ ማሽን 200A", 18000),
        Item("Angle Grinder 900W", "አንግል ግራይንደር", 4200),
    ],
    "electronics": [
        Item("Canon EOS 2000D DSLR Camera", "ካኖን DSLR ካሜራ", 32000),
        Item("Epson Full HD Projector 3600 Lumens", "ኤፕሰን ፕሮጀክተር", 18500),
        Item("Digital Blood Pressure Monitor", "የህክምና እቃ የደም ግፊት መለኪያ", 3200),
        Item("300W Solar Panel Kit with Inverter", "ሶላር ፓናል 300W", 22000),
        Item("TP-Link Dual Band WiFi Router", "ራውተር", 2600),
    ],
    # books is deliberately left thin. The product is supposed to show no price
    # range below MIN_SAMPLE comparables, and demonstrating that needs a real
    # category that genuinely has too few listings.
    "books": [
        Item("University Engineering Textbooks Set", "የዩኒቨርስቲ መጽሐፍት", 3200),
        Item("Ethiopian History Book Collection", "የኢትዮጵያ ታሪክ መጽሐፍት", 2800),
    ],
}

#: How many listings to generate per category at the default corpus size. books
#: is capped low on purpose (see above).
DEFAULT_MIX = {
    "phones": 0.20, "computers": 0.11, "furniture": 0.12, "appliances": 0.10,
    "tv-audio": 0.10, "vehicles": 0.07, "fashion": 0.11, "kids": 0.09,
    "tools": 0.06, "electronics": 0.04,
}

BOOKS_CAP = 4


def _price_for(item: Item, rng: random.Random) -> int:
    """Log-normal around the archetype's median, rounded the way sellers round."""
    value = item.median_etb * rng.lognormvariate(0, item.spread)
    if value >= 500_000:
        step = 10_000
    elif value >= 50_000:
        step = 500
    elif value >= 5_000:
        step = 100
    else:
        step = 50
    return max(50, int(round(value / step) * step))


def _phone(rng: random.Random) -> str:
    return f"09{rng.choice(['1', '2', '3', '4', '7'])}{rng.randint(1000000, 9999999)}"


def compose_message(
    item: Item,
    category: str,
    rng: random.Random,
) -> tuple[str, int]:
    """Builds one plausible channel post. Returns (text, price)."""
    price = _price_for(item, rng)
    condition = rng.choices(
        ["brand_new", "lightly_used", "fair"], weights=item.weights, k=1
    )[0]
    area_en, area_am = rng.choice(AREAS)
    negotiable = rng.random() < 0.45

    title = item.title_en if rng.random() < 0.6 else item.title_am
    body = rng.choice(CONDITION_PHRASES[condition])
    price_line = (
        f"ዋጋ {price:,} ብር" if rng.random() < 0.5 else f"Price {price:,} ETB"
    )
    if negotiable:
        price_line += rng.choice([" ድርድር አለው", " negotiable", " ትንሽ ይደራደራል"])

    lines = [
        title,
        body,
        price_line,
        rng.choice([f"{area_en} አካባቢ", f"Location: {area_en}", f"{area_am} አካባቢ"]),
        f"ስልክ {_phone(rng)}",
    ]
    return "\n".join(lines), price


def build_corpus(count: int, seed: int = 20260819) -> List[dict]:
    """Plans `count` messages across the catalogue without touching the DB."""
    rng = random.Random(seed)
    plan: List[tuple[str, Item]] = []

    for category, share in DEFAULT_MIX.items():
        items = CATALOGUE[category]
        target = max(len(items), int(round(count * share)))
        for i in range(target):
            plan.append((category, items[i % len(items)]))

    for i in range(min(BOOKS_CAP, count)):
        plan.append(("books", CATALOGUE["books"][i % len(CATALOGUE["books"])]))

    rng.shuffle(plan)

    messages: List[dict] = []
    now = datetime.now(timezone.utc)
    for offset, (category, item) in enumerate(plan):
        text, price = compose_message(item, category, rng)
        messages.append(
            {
                "text": text,
                "price": price,
                "category": category,
                "posted_at": now - timedelta(hours=rng.randint(1, 24 * 45)),
            }
        )
    return messages


async def seed_corpus(
    db: Database,
    count: int,
    channel_ids: Sequence[int],
    start_message_id: int = 500_000,
    seed: int = 20260819,
) -> int:
    """Writes generated messages into raw_messages. Returns the number inserted."""
    rng = random.Random(seed)
    messages = build_corpus(count, seed=seed)

    inserted = 0
    for index, message in enumerate(messages):
        await db.upsert_raw_message(
            channel_id=rng.choice(list(channel_ids)),
            message_id=start_message_id + index,
            grouped_id=None,
            raw_text=message["text"],
            media_refs=None,
            posted_at=message["posted_at"],
        )
        inserted += 1
    return inserted
