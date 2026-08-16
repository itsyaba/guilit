#!/usr/bin/env python3
"""Generate fixtures/listings.json and the placeholder imagery it references.

Fixtures are deterministic: running this twice produces byte-identical output,
so the JSON can be committed and diffed. Swap the whole file for real API data
when the ingestion pipeline lands -- the shape is the contract, not the values.

Usage:  python3 scripts/generate-fixtures.py
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"
IMAGES = ROOT / "public" / "img" / "items"

IMG_W, IMG_H = 800, 600

# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------

CATEGORIES = [
    ("phones", "Phones & Tablets", "ስልክና ታብሌት"),
    ("computers", "Computers", "ኮምፒውተር"),
    ("furniture", "Furniture", "የቤት እቃ"),
    ("appliances", "Home Appliances", "የቤት መገልገያ"),
    ("tv-audio", "TV & Audio", "ቴሌቪዥንና ድምጽ"),
    ("vehicles", "Vehicles", "ተሽከርካሪ"),
    ("fashion", "Fashion", "አልባሳት"),
    ("kids", "Baby & Kids", "የሕፃናት እቃ"),
    ("books", "Books & Hobbies", "መጽሐፍትና መዝናኛ"),
    ("tools", "Tools", "የስራ መሳሪያ"),
]

# Median / p25 / p75 price per category, in ETB. Rough Addis market figures --
# replace with computed stats once we have real listing volume.
CATEGORY_STATS = {
    "phones": (18000, 11000, 32000),
    "computers": (34000, 22000, 58000),
    "furniture": (9500, 5000, 18000),
    "appliances": (14000, 8000, 26000),
    "tv-audio": (16000, 9000, 30000),
    "vehicles": (950000, 620000, 1650000),
    "fashion": (1800, 900, 3400),
    "kids": (3200, 1600, 6500),
    "books": (900, 400, 2200),
    "tools": (5200, 2600, 11000),
}

AREAS = [
    ("Bole", "ቦሌ"),
    ("Piassa", "ፒያሳ"),
    ("Megenagna", "መገናኛ"),
    ("CMC", "ሲኤምሲ"),
    ("Kazanchis", "ካዛንቺስ"),
    ("Sarbet", "ሳርቤት"),
    ("Gerji", "ገርጂ"),
    ("Ayat", "አያት"),
    ("Summit", "ሰሚት"),
    ("Lebu", "ለቡ"),
    ("Saris", "ሳሪስ"),
    ("Jemo", "ጀሞ"),
    ("Kolfe", "ኮልፌ"),
    ("Shiro Meda", "ሽሮ ሜዳ"),
    ("Merkato", "መርካቶ"),
    ("Arat Kilo", "አራት ኪሎ"),
    ("Gurd Shola", "ጉርድ ሾላ"),
    ("Hayahulet", "ሃያሁለት"),
    ("Kality", "ቃሊቲ"),
    ("Old Airport", "ኦልድ ኤርፖርት"),
    ("Ayer Tena", "አየር ጤና"),
    ("Torhailoch", "ቶር ሃይሎች"),
]

# Fictional placeholder channels. The real allowlist lives in the ingestion
# service config -- these exist only so the UI has plausible attribution to render.
CHANNELS = [
    ("addis_used_market", "Addis Used Market"),
    ("ethio_second_hand", "Ethio Second Hand"),
    ("bole_market_et", "Bole Market ET"),
    ("gebeya_online_et", "Gebeya Online"),
    ("merkato_deals", "Merkato Deals"),
    ("addis_electronics_hub", "Addis Electronics Hub"),
    ("ethio_furniture_market", "Ethio Furniture Market"),
    ("kal_mobile_addis", "Kal Mobile Addis"),
    ("addis_auto_bazaar", "Addis Auto Bazaar"),
    ("ethio_home_appliance", "Ethio Home Appliance"),
    ("addis_kids_corner", "Addis Kids Corner"),
    ("tikur_sew_gebeya", "Tikur Sew Gebeya"),
]

CONDITIONS = ["brand_new", "lightly_used", "fair"]

SELLER_NAMES = [
    "Selam T.", "Dawit A.", "Hanna G.", "Yonas B.", "Meron K.", "Abel M.",
    "Rahel S.", "Bereket H.", "Tigist W.", "Nahom D.", "Eden F.", "Samuel L.",
    "Kalkidan Y.", "Henok Z.", "Feven R.", "Getachew N.", "Sara A.", "Mikiyas P.",
]

# (category, english title, amharic title | None, price | None, condition)
ITEMS: list[tuple[str, str, str | None, int | None, str]] = [
    ("phones", "Samsung Galaxy A54 5G, 128GB", "ሳምሱንግ ጋላክሲ A54 5G ፻፳፰ጊጋ", 24500, "lightly_used"),
    ("phones", "iPhone 12 Pro 256GB, battery 89%", "አይፎን ፲፪ ፕሮ ፪፻፶፮ጊጋ", 47000, "lightly_used"),
    ("phones", "Tecno Camon 20, dual SIM", "ቴክኖ ካሞን ፳ ባለ ሁለት ሲም", 12800, "brand_new"),
    ("phones", "Infinix Hot 30i, screen has a hairline crack", "ኢንፊኒክስ ሆት ፴i", 7200, "fair"),
    ("phones", "iPad 9th gen 64GB with case", None, 29500, "lightly_used"),
    ("phones", "Redmi Note 12, sealed box", "ሬድሚ ኖት ፲፪ ያልተከፈተ", 16900, "brand_new"),
    ("phones", "Samsung Galaxy S21 Ultra", None, 38000, "fair"),

    ("computers", "MacBook Air M1 2020, 8GB / 256GB", "ማክቡክ ኤር M1 ፪ሺ፳", 62000, "lightly_used"),
    ("computers", "HP EliteBook 840 G6, i5 8th gen", "ኤችፒ ኤሊትቡክ ላፕቶፕ", 31000, "fair"),
    ("computers", "Dell Latitude 5420, i7 16GB RAM", None, 44500, "lightly_used"),
    ("computers", "Lenovo ThinkPad T480, new battery", "ሌኖቮ ቲንክፓድ T480", 27000, "fair"),
    ("computers", "Gaming desktop, RTX 3060 + 32GB RAM", None, 118000, "lightly_used"),
    ("computers", "HP LaserJet Pro M404dn printer", "ኤችፒ ሌዘር ጄት ማተሚያ", 19500, "lightly_used"),

    ("furniture", "Three-seater sofa with matching coffee table",
     "ባለ ሶስት ሰው ሶፋ ከነ ጠረጴዛው በጣም ጥሩ ሁኔታ ላይ የሚገኝ ከውጭ ሀገር የመጣ ኦርጅናል ጨርቅ ያለው ለሽያጭ ቀርቧል ቦሌ አካባቢ",
     14500, "lightly_used"),
    ("furniture", "L-shaped sofa, grey fabric", "ኤል ቅርጽ ያለው ሶፋ", 22000, "lightly_used"),
    ("furniture", "Solid wood dining table, seats six", "ባለ ስድስት ወንበር የእንጨት ጠረጴዛ", 18000, "fair"),
    ("furniture", "Queen bed frame with mattress", "የአልጋ ፍሬም ከነ ፍራሽ", 16500, "lightly_used"),
    ("furniture", "Two-door wardrobe", "ባለ ሁለት በር ቁም ሳጥን", 8900, "fair"),
    ("furniture", "Office desk and swivel chair", None, 6800, "lightly_used"),
    ("furniture", "Bookshelf, five shelves", "ባለ አምስት ደረጃ የመጽሐፍ መደርደሪያ", 4200, "fair"),
    ("furniture", "Handmade traditional mesob", "በእጅ የተሰራ መሶብ", 3500, "brand_new"),

    ("appliances", "LG double-door refrigerator, 340L", "ኤልጂ ባለ ሁለት በር ማቀዝቀዣ", 42000, "lightly_used"),
    ("appliances", "Samsung front-load washing machine 7kg", "ሳምሱንግ ማጠቢያ ማሽን ፯ኪሎ", 34000, "lightly_used"),
    ("appliances", "Four-burner gas stove with oven", "ባለ አራት ምድጃ ከነ ምጣድ", 12500, "fair"),
    ("appliances", "Microwave oven 25L", "ማይክሮዌቭ ፳፭ ሊትር", 6500, "lightly_used"),
    ("appliances", "Water dispenser, hot and cold", "የውሃ ማቀዝቀዣ ትኩስና ቀዝቃዛ", 7800, "brand_new"),
    ("appliances", "Electric injera mitad, 60cm", "የኤሌክትሪክ ምጣድ ፷ሳ.ሜ", 5400, "brand_new"),

    ("tv-audio", "Sony Bravia 55 inch 4K smart TV", "ሶኒ ብራቪያ ፶፭ ኢንች", 48000, "lightly_used"),
    ("tv-audio", "Hisense 43 inch LED TV", "ሂሴንስ ፵፫ ኢንች ቴሌቪዥን", 21000, "fair"),
    ("tv-audio", "JBL Charge 5 bluetooth speaker", None, 9500, "lightly_used"),
    ("tv-audio", "Home theatre 5.1 with subwoofer", "ሆም ቲያትር ባለ ፭.፩", 15800, "fair"),
    ("tv-audio", "Yamaha acoustic guitar F310", "ያማሃ ጊታር", 11000, "lightly_used"),

    ("vehicles", "Toyota Vitz 2007, well maintained", "ቶዮታ ቪትዝ ፪ሺ፯ ሞዴል", 1150000, "fair"),
    ("vehicles", "Suzuki Alto 2015, single owner", "ሱዙኪ አልቶ ፪ሺ፲፭", 890000, "lightly_used"),
    ("vehicles", "Bajaj three-wheeler, 2019", "ባጃጅ ፪ሺ፲፱ ሞዴል", 420000, "fair"),
    ("vehicles", "Mountain bike, 21 speed", "የተራራ ብስክሌት ፳፩ ጊር", 14000, "lightly_used"),
    ("vehicles", "Motorcycle helmet and jacket set", None, 5600, "lightly_used"),

    ("fashion", "Habesha kemis, hand-woven", "የሐበሻ ቀሚስ በእጅ የተሰራ", 6500, "brand_new"),
    ("fashion", "Leather jacket, size L", "የቆዳ ጃኬት", 3800, "lightly_used"),
    ("fashion", "Nike Air Force 1, size 42", "ናይክ ኤር ፎርስ ፩ ቁጥር ፵፪", 4200, "lightly_used"),
    ("fashion", "Wedding suit, worn once", "የሰርግ ልብስ አንድ ጊዜ የተለበሰ", 5500, "lightly_used"),
    ("fashion", "Netela, cotton with tilet border", "ነጠላ ከጥለት ጋር", 1900, "brand_new"),

    ("kids", "Baby cot with mattress", "የሕፃናት አልጋ ከነ ፍራሽ", 7500, "lightly_used"),
    ("kids", "Chicco stroller, folds flat", "ቺኮ የሕፃናት ጋሪ", 6200, "fair"),
    ("kids", "Kids bicycle, ages 5 to 8", "የልጆች ብስክሌት ከ፭-፰ ዓመት", 3400, "fair"),
    ("kids", "Wooden toy set, 40 pieces", None, 1200, "brand_new"),

    ("books", "Ethiopian history collection, 12 volumes", "የኢትዮጵያ ታሪክ መጽሐፍት ፲፪ ጥራዝ", 2800, "fair"),
    ("books", "Chess set, weighted pieces", "የቼዝ ጨዋታ", 1600, "lightly_used"),
    ("books", "Canon EOS 700D with 18-55mm lens", "ካኖን EOS 700D ካሜራ", 28000, "lightly_used"),
    ("books", "University engineering textbooks, lot of 9", None, None, "fair"),

    ("tools", "Bosch cordless drill, two batteries", "ቦሽ የእጅ መሰርሰሪያ", 8900, "lightly_used"),
    ("tools", "Generator 3.5kVA, petrol", "ጀነሬተር ፫.፭ኪቫ", 42000, "fair"),
    ("tools", "Welding machine, 200A inverter", "የብየዳ ማሽን ፪፻ አምፔር", 16500, "lightly_used"),
    ("tools", "Full mechanic tool box, 120 pieces", None, 11500, "brand_new"),
]

DESCRIPTIONS = {
    "brand_new": [
        "Bought last month and never used. Box, charger and receipt all included. Price is slightly negotiable for a serious buyer.",
        "Sealed and unopened. I ordered two by mistake and only need one. Can meet anywhere around the area during the day.",
        "Brand new, still under warranty. Happy to let you inspect everything before you pay.",
    ],
    "lightly_used": [
        "Used for about eight months. No dents, no scratches worth mentioning. Everything works exactly as it should.",
        "Second owner, kept in very good condition. Selling because I am moving out of Addis at the end of the month.",
        "Light use only, mostly kept in storage. You are welcome to test it before buying.",
    ],
    "fair": [
        "Works fine but shows its age. A few marks on the body which I have photographed honestly. Priced accordingly.",
        "Fully functional with some cosmetic wear. Serviced two months ago and running well since.",
        "Old but reliable. Selling as-is, no returns, but nothing is hidden from you.",
    ],
}

AMHARIC_DESCRIPTIONS = [
    "በጣም ጥሩ ሁኔታ ላይ ይገኛል። ዋጋው ትንሽ ማስተካከያ አለው። ለበለጠ መረጃ ይደውሉ።",
    "ምንም አይነት ችግር የለበትም። መጥተው አይተው መግዛት ይችላሉ።",
    "ለረጅም ጊዜ የተጠቀምኩበት ቢሆንም ሙሉ በሙሉ ይሰራል። ዋጋው የማይቀያየር ነው።",
]

SAFETY_TIP_COUNT = 3


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum() and ch.isascii():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-")[:60] or "listing"


def iso(day_offset: int, hour: int, minute: int) -> str:
    """Dates relative to a fixed 'now' so fixtures stay deterministic."""
    from datetime import datetime, timedelta, timezone

    base = datetime(2026, 8, 16, 9, 0, tzinfo=timezone.utc)
    stamp = base - timedelta(days=day_offset, hours=hour, minutes=minute)
    return stamp.isoformat().replace("+00:00", "Z")


def price_verdict(price: int | None, stats: tuple[int, int, int]) -> str:
    if price is None:
        return "unknown"
    median, p25, p75 = stats
    if price < median * 0.3:
        return "suspicious"
    if price < p25:
        return "below"
    if price > p75:
        return "above"
    return "fair"


# --------------------------------------------------------------------------
# Placeholder imagery
# --------------------------------------------------------------------------

# Cool zinc + tarpaulin blues. Deliberately inside the product palette so a grid
# of placeholders reads as a designed system rather than broken photography.
# (ground, object, shadow)
IMAGE_TONES = [
    ((226, 230, 235), (86, 112, 148), (150, 162, 176)),
    ((214, 222, 232), (44, 74, 112), (128, 144, 164)),
    ((233, 235, 238), (120, 132, 146), (176, 184, 194)),
    ((208, 219, 232), (32, 86, 150), (112, 134, 160)),
    ((222, 226, 231), (72, 84, 98), (156, 166, 178)),
    ((236, 238, 241), (140, 156, 176), (186, 194, 204)),
    ((216, 224, 233), (58, 96, 138), (134, 150, 170)),
    ((228, 234, 240), (96, 126, 164), (162, 176, 192)),
]


def make_image(seed: int, path: Path) -> None:
    rng = random.Random(seed)
    ground, obj, shadow = IMAGE_TONES[seed % len(IMAGE_TONES)]

    img = Image.new("RGB", (IMG_W, IMG_H), ground)
    draw = ImageDraw.Draw(img)

    # Vertical wash, like a stall backdrop catching daylight from above.
    for y in range(IMG_H):
        t = (y / IMG_H) ** 1.2
        draw.line(
            [(0, y), (IMG_W, y)],
            fill=tuple(int(ground[i] + (shadow[i] - ground[i]) * t * 0.75) for i in range(3)),
        )

    def blob(colour, cx, cy, w, h, shape, blur, alpha):
        overlay = Image.new("RGB", img.size, colour)
        mask = Image.new("L", img.size, 0)
        md = ImageDraw.Draw(mask)
        if shape == 0:
            md.rounded_rectangle([cx - w, cy - h, cx + w, cy + h], radius=42, fill=alpha)
        elif shape == 1:
            md.ellipse([cx - w, cy - h, cx + w, cy + h], fill=alpha)
        else:
            pts = []
            for i in range(6):
                a = math.tau * i / 6 + rng.random() * 0.35
                pts.append((cx + math.cos(a) * w, cy + math.sin(a) * h))
            md.polygon(pts, fill=alpha)
        return Image.composite(overlay, img, mask.filter(ImageFilter.GaussianBlur(blur)))

    cx = IMG_W // 2 + rng.randint(-70, 70)
    cy = IMG_H // 2 + rng.randint(-30, 50)
    w = rng.randint(160, 240)
    h = rng.randint(130, 200)
    shape = seed % 3

    # Contact shadow first, then the object mass sitting on top of it.
    img = blob(shadow, cx + 26, cy + 46, int(w * 1.05), int(h * 0.9), shape, 46, 170)
    img = blob(obj, cx, cy, w, h, shape, 14, 235)
    # A second, smaller mass so tiles do not all read as one centred lump.
    img = blob(
        obj,
        cx + rng.choice([-1, 1]) * rng.randint(120, 190),
        cy + rng.randint(-40, 60),
        rng.randint(60, 110),
        rng.randint(50, 95),
        (shape + 1) % 3,
        18,
        200,
    )

    # Tarpaulin weave: fine diagonal ribs across the whole frame.
    rib = Image.new("RGB", img.size, (255, 255, 255))
    rib_draw = ImageDraw.Draw(rib)
    for x in range(-IMG_H, IMG_W + IMG_H, 11):
        rib_draw.line([(x, 0), (x + IMG_H, IMG_H)], fill=(0, 0, 0), width=4)
    img = Image.blend(img, rib, 0.035)

    # Vignette so cards have a settled edge instead of a flat colour bleed.
    vign = Image.new("L", img.size, 0)
    ImageDraw.Draw(vign).ellipse(
        [-IMG_W * 0.2, -IMG_H * 0.2, IMG_W * 1.2, IMG_H * 1.2], fill=255
    )
    vign = vign.filter(ImageFilter.GaussianBlur(110))
    img = Image.composite(img, Image.new("RGB", img.size, shadow), vign)

    img = img.filter(ImageFilter.GaussianBlur(1.6))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=62, optimize=True, progressive=True)


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build() -> None:
    rng = random.Random(20260816)
    cat_lookup = {slug: (en, am) for slug, en, am in CATEGORIES}

    listings = []
    image_seed = 0

    for index, (cat, title_en, title_am, price, condition) in enumerate(ITEMS):
        listing_id = f"lst_{index + 1:03d}"
        area_en, area_am = AREAS[(index * 7 + 3) % len(AREAS)]
        stats = CATEGORY_STATS[cat]

        # Tier mix: mostly scraped, a minority claimed, a handful native.
        if index % 11 == 4:
            tier = "native"
        elif index % 7 == 2:
            tier = "claimed"
        else:
            tier = "indexed"

        # Dedup fan-out. Most items appear once; a meaningful slice are
        # cross-posted, which is the whole reason this product exists.
        if tier == "native":
            channel_count = 0
        elif index % 9 == 0:
            channel_count = rng.choice([5, 6])
        elif index % 3 == 0:
            channel_count = rng.choice([2, 3, 4])
        else:
            channel_count = 1

        sources = []
        for n in range(channel_count):
            handle, name = CHANNELS[(index * 5 + n * 3) % len(CHANNELS)]
            if price is None:
                source_price = None
            else:
                # Cross-posts drift a little; the first one is the cheapest sighting.
                drift = 1.0 if n == 0 else 1 + (n * rng.uniform(0.02, 0.09))
                source_price = int(round(price * drift / 50) * 50)
            sources.append(
                {
                    "channelHandle": handle,
                    "channelTitle": name,
                    "messageUrl": f"https://t.me/{handle}/{4000 + index * 13 + n}",
                    "postedAt": iso(index % 12, n * 5, (index * 7 + n * 11) % 60),
                    "priceEtb": source_price,
                }
            )

        source_prices = [s["priceEtb"] for s in sources if s["priceEtb"] is not None]
        lowest = min(source_prices) if source_prices else price

        # One listing per fixture set exercises the missing-image path.
        has_image = index != 3
        images = []
        if has_image:
            image_count = 1 if index % 4 else rng.choice([2, 3, 4])
            for n in range(image_count):
                image_seed += 1
                name = f"{listing_id}-{n + 1}.jpg"
                img_dest = IMAGES / name
                if not img_dest.exists():
                    make_image(image_seed, img_dest)
                images.append(
                    {
                        "url": f"/img/items/{name}",
                        "width": IMG_W,
                        "height": IMG_H,
                        "alt": f"{title_en}, photo {n + 1}",
                    }
                )

        seller_name = SELLER_NAMES[index % len(SELLER_NAMES)]
        seller = {
            "displayName": seller_name if tier != "indexed" else None,
            "telegramHandle": sources[0]["channelHandle"] if sources else f"gulit_{slugify(seller_name)}",
            "phoneMasked": f"+251 9{(index * 37) % 10} *** ** {(index * 17) % 90 + 10}",
            "phoneVerified": tier != "indexed",
            "ratingAvg": round(3.8 + ((index * 13) % 12) / 10, 1) if tier != "indexed" else None,
            "ratingCount": (index * 7) % 41 + 3 if tier != "indexed" else None,
            "memberSince": iso(120 + index * 3, 0, 0) if tier != "indexed" else None,
        }

        listings.append(
            {
                "id": listing_id,
                "slug": slugify(title_en),
                "title": title_en,
                "titleAm": title_am,
                "description": DESCRIPTIONS[condition][index % 3],
                "descriptionAm": AMHARIC_DESCRIPTIONS[index % 3] if title_am else None,
                "priceEtb": price,
                "currency": "ETB",
                "negotiable": index % 3 != 1,
                "categorySlug": cat,
                "categoryLabel": cat_lookup[cat][0],
                "categoryLabelAm": cat_lookup[cat][1],
                "condition": condition,
                "location": {"area": area_en, "areaAm": area_am, "city": "Addis Ababa"},
                "tier": tier,
                "images": images,
                "seller": seller,
                "sources": sources,
                "seenInChannels": channel_count,
                "lowestPriceEtb": lowest,
                "priceStats": {
                    "categoryMedianEtb": stats[0],
                    "p25Etb": stats[1],
                    "p75Etb": stats[2],
                    "verdict": price_verdict(price, stats),
                    "sampleSize": 40 + (index * 11) % 260,
                },
                "extractionConfidence": round(0.62 + ((index * 23) % 37) / 100, 2),
                "postedAt": iso(index % 12, (index * 3) % 20, (index * 7) % 60),
                "updatedAt": iso(index % 12, (index * 3) % 20, (index * 7) % 60),
            }
        )

    payload = {
        "_note": (
            "Fixture data for UI development. Channel handles, sellers and phone "
            "numbers are invented. Replace this file wholesale with the API "
            "response once ingestion lands -- the field shape is the contract."
        ),
        "generatedAt": iso(0, 0, 0),
        "categories": [
            {"slug": s, "label": en, "labelAm": am} for s, en, am in CATEGORIES
        ],
        "conditions": [
            {"value": "brand_new", "label": "Brand New", "labelAm": "አዲስ"},
            {"value": "lightly_used", "label": "Lightly Used", "labelAm": "ትንሽ የተሰራበት"},
            {"value": "fair", "label": "Fair Condition", "labelAm": "መካከለኛ"},
        ],
        "tiers": [
            {"value": "indexed", "label": "Indexed", "labelAm": "የተሰበሰበ"},
            {"value": "claimed", "label": "Claimed", "labelAm": "የተረጋገጠ"},
            {"value": "native", "label": "On Gulit", "labelAm": "በጉሊት የተለጠፈ"},
        ],
        "areas": [{"area": en, "areaAm": am} for en, am in AREAS],
        "channelCount": len(CHANNELS),
        "listings": listings,
    }

    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "listings.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(listings)} listings, {image_seed} images")


if __name__ == "__main__":
    build()
