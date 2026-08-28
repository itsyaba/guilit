-- seed-native-market.sql
-- Native listings from mock sellers, so the reserve and message flows have
-- something to run against while logged in as yourself.
--
-- Run with: psql $DATABASE_URL -f scripts/seed-native-market.sql
--
-- Everything here is tier='native' status='live'. Native means "posted on
-- Gulit", which is what gives a listing a seller you can message and an item
-- you can put a deposit on -- an 'indexed' row has no user behind it, so the
-- composer and the hold panel correctly render nothing. Sellers are
-- trust_level='established' because app/api/listings/route.ts:135 publishes a
-- native post immediately only for established users and queues everyone
-- else; a 'new' seller here would seed an invisible market.
--
-- Photos are the committed files under public/img/items. lib/media.ts returns
-- an r2_key beginning with "/" verbatim, so these serve from the app itself
-- and need no bucket object and no next/image allowlist entry.
--
-- Titles, prices, conditions, areas and photos are lifted intact from
-- fixtures/listings.json, so the picture matches the words.
--
-- Idempotent: sellers and listings are keyed on username and slug, images on
-- r2_key. Re-running changes nothing.

DO $$
DECLARE
  v_listing UUID;
  v_buyer   UUID;
  v_seller  UUID;
  v_convo   UUID;
  v_price   INT;
  v_s0 UUID;
  v_s1 UUID;
  v_s2 UUID;
  v_s3 UUID;
  v_s4 UUID;
  v_s5 UUID;
BEGIN

  ---- sellers ----------------------------------------------------------------
  -- Select-then-insert, not ON CONFLICT: the only unique column on users is
  -- telegram_id, these accounts have none, and NULL never conflicts -- an
  -- upsert on that target inserts a fresh duplicate on every run.

  SELECT id INTO v_s0 FROM users WHERE username = 'dawit_a' LIMIT 1;
  IF v_s0 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('dawit_a', '+251911220000', TRUE, 'established', NOW() - INTERVAL '4 months', NOW())
    RETURNING id INTO v_s0;
  END IF;

  SELECT id INTO v_s1 FROM users WHERE username = 'hanna_g' LIMIT 1;
  IF v_s1 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('hanna_g', '+251911221111', TRUE, 'established', NOW() - INTERVAL '7 months', NOW())
    RETURNING id INTO v_s1;
  END IF;

  SELECT id INTO v_s2 FROM users WHERE username = 'bereket_h' LIMIT 1;
  IF v_s2 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('bereket_h', '+251911222222', TRUE, 'established', NOW() - INTERVAL '10 months', NOW())
    RETURNING id INTO v_s2;
  END IF;

  SELECT id INTO v_s3 FROM users WHERE username = 'eden_f' LIMIT 1;
  IF v_s3 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('eden_f', '+251911223333', TRUE, 'established', NOW() - INTERVAL '13 months', NOW())
    RETURNING id INTO v_s3;
  END IF;

  SELECT id INTO v_s4 FROM users WHERE username = 'kalkidan_y' LIMIT 1;
  IF v_s4 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('kalkidan_y', '+251911224444', TRUE, 'established', NOW() - INTERVAL '16 months', NOW())
    RETURNING id INTO v_s4;
  END IF;

  SELECT id INTO v_s5 FROM users WHERE username = 'feven_r' LIMIT 1;
  IF v_s5 IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('feven_r', '+251911225555', TRUE, 'established', NOW() - INTERVAL '19 months', NOW())
    RETURNING id INTO v_s5;
  END IF;

  ---- listings ---------------------------------------------------------------

  -- Samsung Galaxy A54 5G 128GB Awesome Graphite
  SELECT id INTO v_listing FROM listings WHERE slug = 'samsung-galaxy-a54-5g-128gb-awesome-graphite-mk01';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'samsung-galaxy-a54-5g-128gb-awesome-graphite-mk01', 'Samsung Galaxy A54 5G 128GB Awesome Graphite', 'ሳምሱንግ ጋላክሲ A54 5G ፻፳፰ ጊጋ', 'Samsung Galaxy A54 5G 128GB. Used for 8 months. ስክሪኑ ላይ tempered glass አለው ምንም ጭረት የሌለበት። Battery health በጣም አሪፍ ነው። Comes with original fast charger. ዋጋ 24,500 ብር ድርድር አለው። CMC አካባቢ።', 'ለ8 ወር ያህል የተጠቀምኩበት በጣም ንፁህ ስልክ። ስክሪን ፕሮቴክተር አለው። ዋጋ 24,500 ብር ትንሽ ድርድር አለው።',
      24500, 24500, TRUE, 'phones', 'lightly_used',
      'CMC', 'ሲኤምሲ', 'Addis Ababa',
      'native', 'live', v_s0, 1,
      NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_001-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_001-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_001-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- iPhone 12 Pro 256GB Pacific Blue Battery 88%
  SELECT id INTO v_listing FROM listings WHERE slug = 'iphone-12-pro-256gb-pacific-blue-battery-88-mk02';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'iphone-12-pro-256gb-pacific-blue-battery-88-mk02', 'iPhone 12 Pro 256GB Pacific Blue Battery 88%', 'አይፎን ፲፪ ፕሮ ፪፻፶፮ ጊጋ ፓሲፊክ ብሉ', 'Factory unlocked iPhone 12 Pro 256GB. Battery health at 88%. No cracks, Face ID and cameras working 100%. Comes with original cable.', 'ኦርጅናል አይፎን 12 ፕሮ 256GB ባትሪ 88% ንፁህ ስልክ።',
      46000, 46000, TRUE, 'phones', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s1, 1,
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_002-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_002-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_002-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Apple MacBook Air M1 2020 8GB RAM 256GB SSD Space Grey
  SELECT id INTO v_listing FROM listings WHERE slug = 'apple-macbook-air-m1-2020-8gb-ram-256gb-ssd-space-grey-mk03';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'apple-macbook-air-m1-2020-8gb-ram-256gb-ssd-space-grey-mk03', 'Apple MacBook Air M1 2020 8GB RAM 256GB SSD Space Grey', 'አፕል ማክቡክ ኤር M1 ፪ሺ፳ ፰ ጊጋ ፪፻፶፮ ጊጋ', 'MacBook Air M1 in pristine shape. Battery cycle count only 84, capacity 96%. Comes with original 30W USB-C brick and cable. Clean keyboard.', 'ማክቡክ ኤር M1 በጣም ንፁህ ባትሪው 96% ጤናማ። ከነ ኦርጅናል ቻርጀሩ።',
      58000, 58000, TRUE, 'computers', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s2, 1,
      NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_009-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_009-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_009-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- HP EliteBook 840 G7 Core i5 10th Gen 16GB RAM 512GB SSD
  SELECT id INTO v_listing FROM listings WHERE slug = 'hp-elitebook-840-g7-core-i5-10th-gen-16gb-ram-512gb-ssd-mk04';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'hp-elitebook-840-g7-core-i5-10th-gen-16gb-ram-512gb-ssd-mk04', 'HP EliteBook 840 G7 Core i5 10th Gen 16GB RAM 512GB SSD', 'ኤችፒ ኤሊትቡክ 840 G7 ኮር i5 ፲፮ ጊጋ ራም', 'HP EliteBook 840 G7 Core i5 10th Gen 16GB RAM 512GB SSD. Backlit keyboard, fingerprint sensor, FHD display. ለስራና ለኮዲንግ የሚሆን አሪፍ ላፕቶፕ። Battery backup 4+ hours. ዋጋ 38,500 ETB. ገርጂ።', 'ኤችፒ ኤሊትቡክ ላፕቶፕ ለስራና ለኮዲንግ የሚሆን አሪፍ አቅም ያለው። ባትሪው ከ4 ሰዓት በላይ ይቆያል።',
      38500, 38500, TRUE, 'computers', 'lightly_used',
      'Gerji', 'ገርጂ', 'Addis Ababa',
      'native', 'live', v_s3, 1,
      NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_010-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_010-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_010-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- ባለ ሶስት ሰው L-ቅርፅ ያለው ዘመናዊ የሳሎን ሶፋ ከነ ጠረጴዛው እና ከነ ትራሱ በጣም ፅዱ የሆነ ለሽያጭ 
  SELECT id INTO v_listing FROM listings WHERE slug = 'l-mk05';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'l-mk05', 'ባለ ሶስት ሰው L-ቅርፅ ያለው ዘመናዊ የሳሎን ሶፋ ከነ ጠረጴዛው እና ከነ ትራሱ በጣም ፅዱ የሆነ ለሽያጭ ቀርቧል ቦሌ አካባቢ', 'ባለ ሶስት ሰው L-ቅርፅ ያለው ዘመናዊ የሳሎን ሶፋ ከነ ጠረጴዛው እና ከነ ትራሱ በጣም ፅዱ የሆነ ለሽያጭ ቀርቧል ቦሌ አካባቢ', 'ከውጭ ሀገር የመጣ ኦርጅናል የሳሎን ሶፋ። ጨርቁ የማይቆሽሽና በቀላሉ የሚፀዳ ነው። ጠንካራ የእንጨት ፍሬም አለው። ዋጋ 23,500 ብር ድርድር አለው።', 'ከውጭ ሀገር የመጣ ኦርጅናል የሳሎን ሶፋ። ጨርቁ የማይቆሽሽና በቀላሉ የሚፀዳ ነው። ጠንካራ የእንጨት ፍሬም አለው። ዋጋ 23,500 ብር ድርድር አለው።',
      23500, 23500, TRUE, 'furniture', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s4, 1,
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_015-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_015-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_015-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Three-seater Italian Leather Sofa Brown with Matching Table
  SELECT id INTO v_listing FROM listings WHERE slug = 'three-seater-italian-leather-sofa-brown-with-matching-table-mk06';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'three-seater-italian-leather-sofa-brown-with-matching-table-mk06', 'Three-seater Italian Leather Sofa Brown with Matching Table', 'ባለ ሶስት ሰው የጣሊያን ቆዳ ሶፋ ከነ ጠረጴዛው', 'Three-seater Italian Leather Sofa in rich brown with matching table. ከጣሊያን የመጣ እውነተኛ የቆዳ ሶፋ። Solid wood frame, በጣም ምቹ foam. ዋጋ 18,500 ETB ድርድር አለው። ሳርቤት።', 'ከጣሊያን የመጣ እውነተኛ የቆዳ ሶፋ። በጣም ምቹ እና ጥንካሬ ያለው። ዋጋ ድርድር አለው።',
      18500, 18500, TRUE, 'furniture', 'lightly_used',
      'Sarbet', 'ሳርቤት', 'Addis Ababa',
      'native', 'live', v_s5, 1,
      NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_016-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_016-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_016-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- LG Double Door Inverter Refrigerator 340 Litres No Frost
  SELECT id INTO v_listing FROM listings WHERE slug = 'lg-double-door-inverter-refrigerator-340-litres-no-frost-mk07';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'lg-double-door-inverter-refrigerator-340-litres-no-frost-mk07', 'LG Double Door Inverter Refrigerator 340 Litres No Frost', 'ኤልጂ ባለ ሁለት በር ማቀዝቀዣ ፫፻፵ ሊትር', 'Energy-efficient LG Smart Inverter fridge. Multi airflow cooling, tempered glass shelves, deodorizer filter. Perfect working condition, no noise.', 'ኤልጂ ባለ ሁለት በር ፍሪጅ ምንም እንከን የሌለበት። ዋጋ 44,000 ብር።',
      44000, 44000, TRUE, 'appliances', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s0, 1,
      NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_023-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_023-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_023-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- ሳምሱንግ ማጠቢያ ማሽን 7 ኪሎ ፍሮንት ሎድ ዲጂታል ኢንቨርተር
  SELECT id INTO v_listing FROM listings WHERE slug = '7-mk08';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      '7-mk08', 'ሳምሱንግ ማጠቢያ ማሽን 7 ኪሎ ፍሮንት ሎድ ዲጂታል ኢንቨርተር', 'ሳምሱንግ ማጠቢያ ማሽን ፯ ኪሎ ፍሮንት ሎድ', 'ሳምሱንግ ኦርጅናል የልብስ ማጠቢያ ማሽን። 15 ደቂቃ ፈጣን እጥበት አለው። ውሃና መብራት ቆጣቢ ነው። ዋጋ 36,000 ብር ድርድር አለው። መገናኛ።', 'ሳምሱንግ ኦርጅናል የልብስ ማጠቢያ ማሽን። 15 ደቂቃ ፈጣን እጥበት አለው። ውሃና መብራት ቆጣቢ ነው። ዋጋ 36,000 ብር ድርድር አለው። መገናኛ።',
      36000, 36000, TRUE, 'appliances', 'lightly_used',
      'Megenagna', 'መገናኛ', 'Addis Ababa',
      'native', 'live', v_s1, 1,
      NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_024-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_024-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_024-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Sony Bravia 55 Inch 4K HDR Google Smart TV with Remote
  SELECT id INTO v_listing FROM listings WHERE slug = 'sony-bravia-55-inch-4k-hdr-google-smart-tv-with-remote-mk09';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'sony-bravia-55-inch-4k-hdr-google-smart-tv-with-remote-mk09', 'Sony Bravia 55 Inch 4K HDR Google Smart TV with Remote', 'ሶኒ ብራቪያ ፶፭ ኢንች 4K ስማርት ቴሌቪዥን', 'Original Sony Bravia 55" UHD smart television. Built-in Netflix, YouTube, Chromecast, Dolby Audio. Crisp display with no dead pixels. 49,000 ETB.', 'ሶኒ ብራቪያ 55 ኢንች ስማርት ቲቪ ኦርጅናል የጃፓን። ዋጋ 49,000 ብር።',
      49000, 49000, TRUE, 'tv-audio', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s2, 1,
      NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_030-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_030-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_030-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- ሂሴንስ 43 ኢንች ስማርት ቴሌቪዥን ፍሬምለስ ዲዛይን
  SELECT id INTO v_listing FROM listings WHERE slug = '43-mk10';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      '43-mk10', 'ሂሴንስ 43 ኢንች ስማርት ቴሌቪዥን ፍሬምለስ ዲዛይን', 'ሂሴንስ ፵፫ ኢንች ስማርት ቴሌቪዥን', 'ሂሴንስ 43 ኢንች ባለ ሙሉ HD ስማርት ቲቪ። ዋይፋይና ዩቲዩብ የሚሰራ። ከነ ሪሞቱና እግሩ። ዋጋ 22,500 ብር። መገናኛ አካባቢ።', 'ሂሴንስ 43 ኢንች ባለ ሙሉ HD ስማርት ቲቪ። ዋይፋይና ዩቲዩብ የሚሰራ። ከነ ሪሞቱና እግሩ። ዋጋ 22,500 ብር። መገናኛ አካባቢ።',
      22500, 22500, TRUE, 'tv-audio', 'lightly_used',
      'Megenagna', 'መገናኛ', 'Addis Ababa',
      'native', 'live', v_s3, 1,
      NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_031-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_031-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_031-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Toyota Vitz 2008 Automatic Transmission 1.0L Engine Well Maintained
  SELECT id INTO v_listing FROM listings WHERE slug = 'toyota-vitz-2008-automatic-transmission-1-0l-engine-well-mai-mk11';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'toyota-vitz-2008-automatic-transmission-1-0l-engine-well-mai-mk11', 'Toyota Vitz 2008 Automatic Transmission 1.0L Engine Well Maintained', 'ቶዮታ ቪትዝ ፪ሺ፰ ሞዴል አውቶማቲክ', 'Toyota Vitz 2008 Automatic Transmission 1.0L engine. Silver color, accident free, original engine & transmission, cold AC. Mileage 135,000 km. ዋጋ 1,180,000 ብር ድርድር አለው። ቦሌ።', 'ቶዮታ ቪትዝ 2008 ሞዴል በጣም ንፁህ መኪና። አደጋ የሌለበት። ዋጋ 1,180,000 ብር። ቦሌ አካባቢ።',
      1180000, 1180000, TRUE, 'vehicles', 'fair',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s4, 1,
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_036-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_036-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_036-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_036-4.jpg', 1000, 750, 3, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Suzuki Alto 2016 Single Owner Low Mileage Excellent Condition
  SELECT id INTO v_listing FROM listings WHERE slug = 'suzuki-alto-2016-single-owner-low-mileage-excellent-conditio-mk12';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'suzuki-alto-2016-single-owner-low-mileage-excellent-conditio-mk12', 'Suzuki Alto 2016 Single Owner Low Mileage Excellent Condition', 'ሱዙኪ አልቶ ፪ሺ፲፮ ሞዴል', 'Single owner Suzuki Alto 2016. High fuel efficiency (20+ km/l), serviced regularly at authorized dealership, clean interior. 920,000 ETB negotiable.', 'ሱዙኪ አልቶ 2016 ነዳጅ ቆጣቢ መኪና። ዋጋ 920,000 ብር።',
      920000, 920000, TRUE, 'vehicles', 'lightly_used',
      'Sarbet', 'ሳርቤት', 'Addis Ababa',
      'native', 'live', v_s5, 1,
      NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_037-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_037-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_037-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_037-4.jpg', 1000, 750, 3, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- የሐበሻ ጥልፍ ቀሚስ በእጅ የተሰራ ጥራት ካለው ጥጥ
  SELECT id INTO v_listing FROM listings WHERE slug = 'listing-mk13';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'listing-mk13', 'የሐበሻ ጥልፍ ቀሚስ በእጅ የተሰራ ጥራት ካለው ጥጥ', 'የሐበሻ ጥልፍ ቀሚስ በእጅ የተሰራ ጥራት ካለው ጥጥ', 'ለሰርግ ወይም ለበዓል የሚሆን ያማረ የሐበሻ ቀሚስ። ከነ ሙሉ ነጠላውና ቀበቶው። ዋጋ 8,500 ብር ድርድር አለው። ሽሮ ሜዳ።', 'ለሰርግ ወይም ለበዓል የሚሆን ያማረ የሐበሻ ቀሚስ። ከነ ሙሉ ነጠላውና ቀበቶው። ዋጋ 8,500 ብር ድርድር አለው። ሽሮ ሜዳ።',
      8500, 8500, TRUE, 'fashion', 'brand_new',
      'Shiro Meda', 'ሽሮ ሜዳ', 'Addis Ababa',
      'native', 'live', v_s0, 1,
      NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_042-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_042-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_042-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Genuine Cowhide Leather Jacket Men Size L Dark Brown
  SELECT id INTO v_listing FROM listings WHERE slug = 'genuine-cowhide-leather-jacket-men-size-l-dark-brown-mk14';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'genuine-cowhide-leather-jacket-men-size-l-dark-brown-mk14', 'Genuine Cowhide Leather Jacket Men Size L Dark Brown', 'የቆዳ ጃኬት የወንዶች ሳይዝ L', 'Authentic heavy leather jacket made in Ethiopia. YKK brass zippers, quilted inner lining, 4 pockets. Kept in excellent condition.', 'የወንዶች እውነተኛ የቆዳ ጃኬት። ዋጋ 4,800 ብር። ፒያሳ።',
      4800, 4800, TRUE, 'fashion', 'lightly_used',
      'Piassa', 'ፒያሳ', 'Addis Ababa',
      'native', 'live', v_s1, 1,
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_043-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_043-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- የሕፃናት የእንጨት አልጋ ከነ ሜዲካል ፍራሹ እና ከነ መጋረጃው
  SELECT id INTO v_listing FROM listings WHERE slug = 'listing-mk15';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'listing-mk15', 'የሕፃናት የእንጨት አልጋ ከነ ሜዲካል ፍራሹ እና ከነ መጋረጃው', 'የሕፃናት የእንጨት አልጋ ከነ ሜዲካል ፍራሹ', 'ለህፃናት የሚሆን ጠንካራ የእንጨት አልጋ። ከነ ፍራሹ እና ከነ አልጋ ልብሱ። ዋጋ 8,200 ብር ድርድር አለው። ሰሚት አካባቢ።', 'ለህፃናት የሚሆን ጠንካራ የእንጨት አልጋ። ከነ ፍራሹ እና ከነ አልጋ ልብሱ። ዋጋ 8,200 ብር ድርድር አለው። ሰሚት አካባቢ።',
      8200, 8200, TRUE, 'kids', 'lightly_used',
      'Summit', 'ሰሚት', 'Addis Ababa',
      'native', 'live', v_s2, 1,
      NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_048-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_048-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_048-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Chicco Foldable Baby Stroller with Sun Canopy and Storage Basket
  SELECT id INTO v_listing FROM listings WHERE slug = 'chicco-foldable-baby-stroller-with-sun-canopy-and-storage-ba-mk16';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'chicco-foldable-baby-stroller-with-sun-canopy-and-storage-ba-mk16', 'Chicco Foldable Baby Stroller with Sun Canopy and Storage Basket', 'ቺኮ የሕፃናት ጋሪ የሚታጠፍ', 'Lightweight Chicco stroller. One-hand quick fold mechanism, reclining seat, rear wheel brakes, 5-point safety harness. 6,800 ETB.', 'ቺኮ የሕፃናት ጋሪ የሚታጠፍ ንፁህ። ዋጋ 6,800 ብር። ቦሌ።',
      6800, 6800, TRUE, 'kids', 'fair',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s3, 1,
      NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_049-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_049-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_049-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- የኢትዮጵያ የታሪክ መጽሐፍት ስብስብ 12 ጥራዞች በፕሮፌሰር ባህሩ ዘውዴ እና ተክለፃዲቅ መኩሪያ
  SELECT id INTO v_listing FROM listings WHERE slug = '12-mk17';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      '12-mk17', 'የኢትዮጵያ የታሪክ መጽሐፍት ስብስብ 12 ጥራዞች በፕሮፌሰር ባህሩ ዘውዴ እና ተክለፃዲቅ መኩሪያ', 'የኢትዮጵያ የታሪክ መጽሐፍት ስብስብ ፲፪ ጥራዞች', 'የኢትዮጵያ ታሪክ ጥልቅ ጥናት የያዙ 12 ጥራዝ ጠንካራ ሽፋን ያላቸው መጽሐፍት። ዋጋ 3,200 ብር። አራት ኪሎ።', 'የኢትዮጵያ የታሪክ መጽሐፍት ስብስብ 12 ጥራዞች በፕሮፌሰር ባህሩ ዘውዴ እና ተክለፃዲቅ መኩሪያ። ዋጋ 3,200 ብር።',
      3200, 3200, FALSE, 'books', 'fair',
      'Arat Kilo', 'አራት ኪሎ', 'Addis Ababa',
      'native', 'live', v_s4, 1,
      NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_055-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_055-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Canon EOS 700D DSLR Camera with 18-55mm IS STM Lens Bag and 32GB SD 
  SELECT id INTO v_listing FROM listings WHERE slug = 'canon-eos-700d-dslr-camera-with-18-55mm-is-stm-lens-bag-and--mk18';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'canon-eos-700d-dslr-camera-with-18-55mm-is-stm-lens-bag-and--mk18', 'Canon EOS 700D DSLR Camera with 18-55mm IS STM Lens Bag and 32GB SD Card', 'ካኖን EOS 700D ካሜራ ከነ ሌንሱ', 'Clean Canon EOS 700D DSLR camera. 18MP sensor, touch articulating screen, full HD video, battery, charger, neck strap and camera bag. 31,000 ETB.', 'ካኖን 700D ካሜራ ለፎቶ እና ለቪዲዮ ስራ የሚሆን። ዋጋ 31,000 ብር። ቦሌ።',
      31000, 31000, TRUE, 'books', 'lightly_used',
      'Bole', 'ቦሌ', 'Addis Ababa',
      'native', 'live', v_s5, 1,
      NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_056-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_056-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_056-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- Bosch Professional Cordless Hammer Drill GSB 18V-50 with 2x 2.0Ah Ba
  SELECT id INTO v_listing FROM listings WHERE slug = 'bosch-professional-cordless-hammer-drill-gsb-18v-50-with-2x--mk19';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      'bosch-professional-cordless-hammer-drill-gsb-18v-50-with-2x--mk19', 'Bosch Professional Cordless Hammer Drill GSB 18V-50 with 2x 2.0Ah Batteries & L-BOXX', 'ቦሽ ፕሮፌሽናል መሰርሰሪያ 18V', 'Bosch Professional Cordless Hammer Drill GSB 18V-50 with 2x batteries & L-BOXX. ቦሽ ብሩሽለስ የእጅ መሰርሰሪያ ከ 2 ሊቲየም ባትሪ እና ቻርጀር ጋር። ዋጋ 9,800 ETB. መርካቶ።', 'ቦሽ ኦርጅናል የእጅ መሰርሰሪያ ባለ ሁለት ባትሪ። ዋጋ 9,800 ብር። መርካቶ።',
      9800, 9800, TRUE, 'tools', 'lightly_used',
      'Merkato', 'መርካቶ', 'Addis Ababa',
      'native', 'live', v_s0, 1,
      NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_057-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_057-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_057-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  -- ጀነሬተር 3.5kVA ቤንዚን በቁልፍ እና በእጅ የሚነሳ ፀጥተኛ ሞተር
  SELECT id INTO v_listing FROM listings WHERE slug = '3-5kva-mk20';
  IF v_listing IS NULL THEN
    INSERT INTO listings (
      slug, title_en, title_am, description_en, description_am,
      price_etb, lowest_price_etb, negotiable, category_slug, condition,
      location_area, location_area_am, location_city,
      tier, status, seller_id, seen_in_channels, posted_at, created_at, updated_at
    ) VALUES (
      '3-5kva-mk20', 'ጀነሬተር 3.5kVA ቤንዚን በቁልፍ እና በእጅ የሚነሳ ፀጥተኛ ሞተር', 'ጀነሬተር ፫.፭ ኪቫ ቤንዚን', 'ለቤት ወይም ለሱቅ መብራት የሚሆን 3.5kVA ጀነሬተር። ቤንዚን ቆጣቢና ፀጥ ያለ ድምፅ ያለው። ዋጋ 46,000 ብር ድርድር አለው። ኮልፌ።', 'ለቤት ወይም ለሱቅ መብራት የሚሆን 3.5kVA ጀነሬተር። ቤንዚን ቆጣቢና ፀጥ ያለ ድምፅ ያለው። ዋጋ 46,000 ብር ድርድር አለው። ኮልፌ።',
      46000, 46000, TRUE, 'tools', 'fair',
      'Kolfe', 'ኮልፌ', 'Addis Ababa',
      'native', 'live', v_s1, 1,
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW()
    ) RETURNING id INTO v_listing;

    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_058-1.jpg', 1000, 750, 0, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_058-2.jpg', 1000, 750, 1, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
    INSERT INTO images (listing_id, r2_key, width, height, sort_order, created_at)
    VALUES (v_listing, '/img/items/lst_058-3.jpg', 1000, 750, 2, NOW())
    ON CONFLICT (r2_key) DO NOTHING;
  END IF;

  ---- a thread you can pay in -------------------------------------------------
  -- Attached to whoever last signed in with Telegram, so the inbox is not
  -- empty on first look and the in-thread Pay button has something to act on.
  -- Skipped entirely when nobody has logged in yet.
  SELECT id INTO v_buyer FROM users
   WHERE telegram_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;

  IF v_buyer IS NOT NULL THEN
    SELECT id, seller_id, price_etb INTO v_listing, v_seller, v_price
      FROM listings
     WHERE tier = 'native' AND status = 'live'
       AND seller_id IS NOT NULL AND seller_id <> v_buyer
     ORDER BY price_etb ASC LIMIT 1;

    IF v_listing IS NOT NULL THEN
      INSERT INTO conversations (listing_id, buyer_id, seller_id, last_message_at, created_at)
      VALUES (v_listing, v_buyer, v_seller, NOW() - INTERVAL '18 minutes', NOW() - INTERVAL '3 hours')
      ON CONFLICT (listing_id, buyer_id) DO NOTHING
      RETURNING id INTO v_convo;

      IF v_convo IS NULL THEN
        SELECT id INTO v_convo FROM conversations
         WHERE listing_id = v_listing AND buyer_id = v_buyer;
      END IF;

      -- Guarded, or a second run doubles every line in the thread.
      IF NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_convo) THEN
        INSERT INTO messages (conversation_id, sender_id, kind, body, read_at, created_at) VALUES
          (v_convo, v_buyer,  'text', 'Selam, is this still available?', NOW() - INTERVAL '170 minutes', NOW() - INTERVAL '3 hours'),
          (v_convo, v_seller, 'text', 'Yes it is. I am around Gerji, you can come and look at it.', NOW() - INTERVAL '160 minutes', NOW() - INTERVAL '165 minutes'),
          (v_convo, v_buyer,  'text', 'ዋጋው ትንሽ ሊቀነስ ይችላል? Saturday morning suits me.', NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '45 minutes'),
          (v_convo, v_seller, 'text', 'Saturday works. Put a deposit down and I will hold it for you.', NULL, NOW() - INTERVAL '22 minutes');

        -- Left unpaid on purpose: this is the row that puts a Pay button in
        -- the thread. With CHAPA_SECRET_KEY unset the whole checkout round
        -- trip completes against our own verify route, no Chapa account.
        INSERT INTO messages (conversation_id, sender_id, kind, amount_etb, body, read_at, created_at)
        VALUES (v_convo, v_seller, 'payment_request',
                GREATEST(50, LEAST(1000, COALESCE(v_price, 1000))),
                'Deposit to hold it until Saturday noon, rest on collection.',
                NULL, NOW() - INTERVAL '18 minutes');
      END IF;
    END IF;
  END IF;

  RAISE NOTICE 'native listings now: %',
    (SELECT count(*) FROM listings WHERE tier = 'native' AND status = 'live');
END $$;
