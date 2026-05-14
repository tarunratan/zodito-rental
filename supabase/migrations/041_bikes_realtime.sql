-- 041: Enable Supabase Realtime broadcasts for the `bikes` table.
--
-- WHY
-- Admin clicks Freeze / Hide / Unfreeze → bikes row updates → every open
-- customer tab needs to see the change immediately. Without this, the
-- home page only refreshes on the next 30-second poll (or on tab focus),
-- which made the recently-reported "I froze it but it's still on home"
-- symptom — for up to half a minute.
--
-- HOW
-- Supabase Realtime listens to the `supabase_realtime` Postgres
-- publication. Adding `bikes` to the publication causes Postgres
-- logical-replication events on the table to be broadcast over the
-- Realtime WebSocket gateway. Clients that subscribe to
-- `channel('bikes:state').on('postgres_changes', {table: 'bikes'}, …)`
-- receive an event for every INSERT / UPDATE / DELETE.
--
-- The customer-facing client doesn't care about the changed row's
-- contents — the event is just a trigger to re-fetch
-- `/api/bikes/available`, which runs `bike_states` and returns the
-- canonical state for the requested window. Latency: sub-second.
--
-- SCOPE
-- Just `bikes` for now. Bookings (status flips) are a noisier source
-- and not the primary live-sync issue today; they can be added later
-- by appending to the publication.
--
-- IDEMPOTENT
-- Drops the table from the publication first if it's already there,
-- then re-adds it — safe to re-run.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE bikes;
EXCEPTION
  WHEN undefined_object THEN NULL; -- publication doesn't have bikes yet — fine
  WHEN undefined_table  THEN NULL; -- publication itself missing on this project — fine
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE bikes;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'supabase_realtime publication not found — Realtime may not be configured for this project. Skipping.';
END $$;

DO $$ BEGIN RAISE NOTICE 'bikes table is now broadcast via supabase_realtime. Subscribe with channel("bikes:state").on("postgres_changes", { table: "bikes" }, …) to receive UPDATE events on freeze / hide / approve.'; END $$;
