-- seed-categories.sql
-- The 12-slug taxonomy every listing's FK points at (listings.category_slug →
-- categories.slug). Nothing else creates these rows: drizzle only builds the
-- empty table, so a fresh database rejects every extracted listing with
-- "violates foreign key constraint listings_category_slug_categories_slug_fk"
-- until this runs.
--
-- Run with: psql $DATABASE_URL -f scripts/seed-categories.sql
-- Safe to re-run.
--
-- The slugs are the contract shared by ingest/extract/gemini_client.py
-- (EXTRACTION_SYSTEM_PROMPT) and lib/search-gemini.ts — changing one here
-- without changing both there silently drops listings into 'other'.
-- Labels come from fixtures/listings.json, which is what the UI was designed
-- against; 'electronics' and 'other' are absent there but reachable from the
-- extractor, and lib/search-lexicon.ts already assumes they exist.

INSERT INTO categories (slug, name_en, name_am, created_at) VALUES
  ('phones',      'Phones & Tablets', 'ስልክና ታብሌት',      NOW()),
  ('computers',   'Computers',        'ኮምፒውተር',          NOW()),
  ('furniture',   'Furniture',        'የቤት እቃ',          NOW()),
  ('appliances',  'Home Appliances',  'የቤት መገልገያ',       NOW()),
  ('tv-audio',    'TV & Audio',       'ቴሌቪዥንና ድምጽ',     NOW()),
  ('vehicles',    'Vehicles',         'ተሽከርካሪ',          NOW()),
  ('fashion',     'Fashion',          'አልባሳት',           NOW()),
  ('kids',        'Baby & Kids',      'የሕፃናት እቃ',        NOW()),
  ('books',       'Books & Hobbies',  'መጽሐፍትና መዝናኛ',    NOW()),
  ('tools',       'Tools',            'የስራ መሳሪያ',        NOW()),
  ('electronics', 'Electronics',      'ኤሌክትሮኒክስ',        NOW()),
  ('other',       'Other',            'ሌላ',              NOW())
ON CONFLICT (slug) DO UPDATE
  SET name_en = EXCLUDED.name_en,
      name_am = EXCLUDED.name_am;

SELECT slug, name_en, name_am FROM categories ORDER BY slug;
