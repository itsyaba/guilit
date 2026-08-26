-- seed-demo-queue.sql
-- Ensures the moderation queue is never empty on demo day.
-- Run with: psql $DATABASE_URL -f scripts/seed-demo-queue.sql
--
-- Creates 10 queued listings sourced from existing raw_messages (if any),
-- or fabricates minimal placeholder rows. Safe to re-run (idempotent).

DO $$
DECLARE
  v_channel_id BIGINT;
  v_category_slug TEXT := 'electronics';
  v_msg_id BIGINT;
  v_listing_id UUID;
  v_extraction_id BIGINT;
  i INT;
BEGIN
  -- Use the first active channel, or skip if none exists
  SELECT id INTO v_channel_id FROM channels WHERE active = TRUE ORDER BY id LIMIT 1;
  IF v_channel_id IS NULL THEN
    RAISE NOTICE 'No active channels found. Add a channel first, then re-run this seed.';
    RETURN;
  END IF;

  -- Ensure category exists
  INSERT INTO categories (slug, name_en, name_am, created_at)
  VALUES ('electronics', 'Electronics', 'ኤሌክትሮኒክስ', NOW())
  ON CONFLICT (slug) DO NOTHING;

  FOR i IN 1..10 LOOP
    -- Synthetic raw message
    INSERT INTO raw_messages (channel_id, message_id, raw_text, posted_at, created_at)
    VALUES (
      v_channel_id,
      9000000 + i,
      format('Demo seed item %s: ለሽያጭ ያለ ስልክ Samsung Galaxy ጥሩ ሁኔታ ላይ ያለ። ዋጋ %s ብር። ለበለጠ መረጃ ይደውሉ።', i, (5000 + i * 1000)::text),
      NOW() - (i || ' hours')::INTERVAL,
      NOW()
    )
    ON CONFLICT (channel_id, message_id) DO UPDATE SET raw_text = EXCLUDED.raw_text
    RETURNING id INTO v_msg_id;

    -- Synthetic extraction with low confidence to guarantee queue entry
    INSERT INTO extractions (
      raw_message_id, prompt_version, title_en, title_am,
      description_en, price_etb, negotiable, category_slug,
      condition, location_area, location_city, phone_raw, phone_normalized,
      confidence_score, created_at
    ) VALUES (
      v_msg_id, 'v1-seed',
      format('Samsung Galaxy (Demo %s)', i),
      format('ሳምሱንግ ጋላክሲ (ናሙና %s)', i),
      format('Demo listing %s for queue testing purposes.', i),
      5000 + i * 1000,
      TRUE,
      'electronics',
      'lightly_used',
      'Bole',
      'Addis Ababa',
      '0911' || lpad((100000 + i)::text, 6, '0'),
      '+25191' || lpad((100000 + i)::text, 7, '0'),
      0.45 + (i::numeric * 0.03),  -- confidence 0.48-0.72, all below 0.80 threshold
      NOW()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_extraction_id;

    -- Listing with status = 'queued'
    INSERT INTO listings (
      id, slug, title_en, title_am, description_en,
      price_etb, negotiable, category_slug, condition,
      location_area, location_city, tier, status,
      extraction_confidence, seen_in_channels,
      posted_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      format('demo-seed-%s-%s', i, extract(epoch from now())::bigint),
      format('Samsung Galaxy (Demo %s)', i),
      format('ሳምሱንግ ጋላክሲ (ናሙና %s)', i),
      format('Demo listing %s inserted for queue testing. Not a real listing.', i),
      5000 + i * 1000,
      TRUE,
      'electronics',
      'lightly_used',
      'Bole',
      'Addis Ababa',
      'indexed',
      'queued',
      0.45 + (i::numeric * 0.03),
      1,
      NOW() - (i || ' hours')::INTERVAL,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_listing_id;

    -- Link listing → raw_message via listing_sources
    INSERT INTO listing_sources (listing_id, raw_message_id, price_etb, created_at)
    VALUES (v_listing_id, v_msg_id, 5000 + i * 1000, NOW())
    ON CONFLICT DO NOTHING;

  END LOOP;

  RAISE NOTICE 'Seeded 10 queued demo listings successfully.';
END;
$$;
