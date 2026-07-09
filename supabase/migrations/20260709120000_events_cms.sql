-- Events CMS: DB-driven IRL events (shows / pop-ups / talks) that Chad can
-- CRUD + publish/unpublish on his own, replacing the hardcoded POPUP_EVENT
-- constant that drives /irl today.
--
-- Ported from the Chad Rising WordPress `awcls` module (shows / rsvps /
-- checkins). Three tables:
--   events         - the CMS-managed listing (native SEO, same pattern as pages)
--   event_rsvps    - open RSVPs (name + email, optional account link)
--   event_checkins - self-scan venue-QR attendance
--
-- Check-in model is SELF-SCAN: each event carries a random checkin_token; the
-- venue QR encodes /irl/checkin/{token}. A fan scans it, confirms their email,
-- and a checkin row is logged (deduped per event+email, matched to their RSVP
-- and account when possible). checkin_enabled is the door open/closed switch.
--
-- Follows the RLS + GRANT + update_updated_at trigger pattern from
-- 20260606130000_pages_cms.sql. RSVP/checkin writes go through service-role API
-- routes, so anon gets NO direct grant on those two tables (privacy).

-- ===== events =====
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  summary text,
  body text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/New_York',
  venue_name text,
  venue_address text,
  venue_city text,
  venue_state text,
  venue_url text,
  hero_image_path text,
  rsvp_enabled boolean NOT NULL DEFAULT true,
  capacity integer,
  checkin_enabled boolean NOT NULL DEFAULT false,
  checkin_token text NOT NULL UNIQUE,
  seo_title text,
  seo_description text,
  og_image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_status  ON events(status);
CREATE INDEX idx_events_starts  ON events(starts_at);
CREATE INDEX idx_events_sort    ON events(sort_order);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published events"
  ON events FOR SELECT
  USING (status = 'published');

CREATE POLICY "Admin full access events"
  ON events FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON events TO anon;
GRANT ALL    ON events TO authenticated, service_role;

CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===== event_rsvps =====
-- Open RSVP: anyone with name + email. user_id links to a member account when
-- the visitor is logged in. Deduped per event by lowercased email.
CREATE TABLE event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  user_id uuid,
  party_size integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_event_rsvps_event_email
  ON event_rsvps(event_id, lower(email));
CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id, created_at);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Admin only. Public RSVP submit goes through a service-role API route, so no
-- anon grant here (keeps the guest list private).
CREATE POLICY "Admin full access event_rsvps"
  ON event_rsvps FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON event_rsvps TO authenticated, service_role;

-- ===== event_checkins =====
-- Self-scan attendance. rsvp_id / user_id are filled when the email matches an
-- existing RSVP / account. Deduped per event by lowercased email.
CREATE TABLE event_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id uuid REFERENCES event_rsvps(id) ON DELETE SET NULL,
  name text,
  email text NOT NULL,
  user_id uuid,
  source text NOT NULL DEFAULT 'self'
    CHECK (source IN ('self', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_event_checkins_event_email
  ON event_checkins(event_id, lower(email));
CREATE INDEX idx_event_checkins_event ON event_checkins(event_id, created_at);

ALTER TABLE event_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access event_checkins"
  ON event_checkins FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT ALL ON event_checkins TO authenticated, service_role;
