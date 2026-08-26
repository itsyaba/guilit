-- seed-demo-market.sql
-- Gives the messaging and reservation flows something to run against.
-- Run with: docker exec -i guilit-postgres psql -U guilit -d guilit -f - < scripts/seed-demo-market.sql
--         or: psql $DATABASE_URL -f scripts/seed-demo-market.sql
--
-- Why this exists: both features need a listing with a *registered seller*.
-- A freshly ingested database is entirely `indexed` listings — scraped, nobody
-- signed up — so the message composer and the hold panel correctly render
-- nothing anywhere, and a demo has no surface to show. This promotes a handful
-- of scraped listings to `claimed`, which is exactly what the OTP claim flow
-- does in production, and attaches them to a demo seller.
--
-- Deliberately does NOT fabricate `native` listings. Native means "posted on
-- Gulit", and the honest way to get one is to post one — which is a better demo
-- beat than a seeded row anyway.
--
-- Non-destructive and idempotent: no listing_sources are deleted, so
-- provenance and the "seen in N channels" ledger stay intact, and re-running
-- promotes the same rows.

DO $$
DECLARE
  v_seller UUID;
  v_buyer UUID;
  v_promoted INT;
  v_owned INT;
  v_listing UUID;
  v_convo UUID;
  v_price INT;
  v_demo_listings CONSTANT INT := 6;
BEGIN
  /*
   * Demo seller. Select-then-insert rather than ON CONFLICT: the only unique
   * column on users is telegram_id, these accounts have none, and NULL never
   * conflicts in Postgres — an upsert on that target silently inserts a fresh
   * duplicate on every run.
   *
   * phone_verified is TRUE because in production a claimed listing means an OTP
   * was answered on the number already in the post.
   */
  SELECT id INTO v_seller FROM users WHERE username = 'demo_seller' LIMIT 1;
  IF v_seller IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('demo_seller', '+251911223344', TRUE, 'established', NOW() - INTERVAL '8 months', NOW())
    RETURNING id INTO v_seller;
  END IF;

  -- Demo buyer, so the seller side of a thread can be shown without two
  -- browsers and two Telegram accounts.
  SELECT id INTO v_buyer FROM users WHERE username = 'demo_buyer' LIMIT 1;
  IF v_buyer IS NULL THEN
    INSERT INTO users (username, phone, phone_verified, trust_level, created_at, updated_at)
    VALUES ('demo_buyer', '+251911556677', TRUE, 'established', NOW() - INTERVAL '3 months', NOW())
    RETURNING id INTO v_buyer;
  END IF;

  /*
   * Promote live, priced listings that already have a photo — an item with no
   * price cannot carry a deposit (see depositForPrice) and one with no photo
   * makes a poor thread header. Ordered by id for a stable set across runs
   * rather than ORDER BY random(), so a rehearsed demo hits the same items.
   */
  SELECT count(*) INTO v_owned FROM listings WHERE seller_id = v_seller;

  WITH candidates AS (
    SELECT l.id
    FROM listings l
    WHERE l.status = 'live'
      AND l.tier = 'indexed'
      AND l.price_etb IS NOT NULL
      AND EXISTS (SELECT 1 FROM images i WHERE i.listing_id = l.id)
    ORDER BY l.id
    -- Top up to DEMO_LISTINGS rather than promoting a fresh batch every run.
    -- The `tier = 'indexed'` filter above means an unguarded LIMIT would take
    -- six *more* listings each time this is run.
    LIMIT GREATEST(v_demo_listings - v_owned, 0)
  )
  UPDATE listings l
  SET tier = 'claimed', seller_id = v_seller, updated_at = NOW()
  FROM candidates c
  WHERE l.id = c.id;

  GET DIAGNOSTICS v_promoted = ROW_COUNT;

  -- A rating or two, so the seller block is not a blank where a score should be.
  INSERT INTO ratings (seller_id, rater_id, listing_id, score, comment, created_at)
  SELECT v_seller, v_buyer, l.id, 5, 'Item was exactly as described. Met in Bole, no fuss.', NOW() - INTERVAL '2 weeks'
  FROM listings l
  WHERE l.seller_id = v_seller
  ORDER BY l.id
  LIMIT 1
  ON CONFLICT (seller_id, rater_id, listing_id) DO NOTHING;

  /*
   * One conversation with a short exchange, so the inbox and the seller side of
   * a thread can both be shown without typing both halves live on camera. The
   * hold is deliberately NOT seeded — that one is worth doing live, and mock
   * mode makes it work with no Chapa account.
   */
  SELECT id INTO v_listing FROM listings WHERE seller_id = v_seller ORDER BY id LIMIT 1;

  IF v_listing IS NOT NULL THEN
    INSERT INTO conversations (listing_id, buyer_id, seller_id, last_message_at, created_at)
    VALUES (v_listing, v_buyer, v_seller, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '2 hours')
    ON CONFLICT (listing_id, buyer_id) DO NOTHING
    RETURNING id INTO v_convo;

    IF v_convo IS NULL THEN
      SELECT id INTO v_convo FROM conversations
      WHERE listing_id = v_listing AND buyer_id = v_buyer;
    END IF;

    -- Only seed the exchange once, or re-running doubles every line.
    IF NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_convo) THEN
      SELECT price_etb INTO v_price FROM listings WHERE id = v_listing;

      INSERT INTO messages (conversation_id, sender_id, kind, body, read_at, created_at) VALUES
        (v_convo, v_buyer,  'text', 'Selam. Is this still available?', NOW() - INTERVAL '110 minutes', NOW() - INTERVAL '2 hours'),
        (v_convo, v_seller, 'text', 'Yes, still here. I am in Gerji, you can come and see it.', NOW() - INTERVAL '100 minutes', NOW() - INTERVAL '105 minutes'),
        (v_convo, v_buyer,  'text', 'ዋጋው ሊቀነስ ይችላል? Saturday morning would work for me.', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '35 minutes'),
        (v_convo, v_seller, 'text', 'Saturday is fine. Send a deposit and I will hold it for you.', NULL, NOW() - INTERVAL '25 minutes');

      /*
       * An open payment request, left unpaid on purpose: it is the one thing in
       * this seed that is worth doing live. Logged in as the buyer, the card in
       * the thread has a Pay button, and in mock mode the whole checkout round
       * trip completes with no Chapa account.
       *
       * The figure is a round 2,500 rather than the computed 5% — the entire
       * point of an in-thread request is that the agreed number is usually not
       * the derived one.
       */
      INSERT INTO messages (conversation_id, sender_id, kind, amount_etb, body, read_at, created_at)
      VALUES (
        v_convo, v_seller, 'payment_request',
        LEAST(2500, COALESCE(v_price, 2500)),
        'Deposit to hold it until Saturday noon. The rest on collection.',
        NULL, NOW() - INTERVAL '20 minutes'
      );
    END IF;
  END IF;

  RAISE NOTICE 'demo seller %  demo buyer %  listings promoted to claimed: %  thread %',
    v_seller, v_buyer, v_promoted, v_convo;
END $$;
