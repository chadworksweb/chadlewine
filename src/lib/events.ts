import { randomBytes } from "crypto";
import { createAdminClient, createPublicClient } from "@/lib/supabase-server";

// Events CMS: DB-driven IRL events + open RSVP + self-scan venue-QR check-in.
// Schema: supabase/migrations/20260709120000_events_cms.sql
// Ported from the Chad Rising `awcls` module (shows / rsvps / checkins).

export type EventStatus = "draft" | "published";

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  summary: string | null;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_url: string | null;
  hero_image_path: string | null;
  rsvp_enabled: boolean;
  capacity: number | null;
  checkin_enabled: boolean;
  checkin_token: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventListItem extends EventRow {
  rsvp_count: number;
  checkin_count: number;
}

export interface EventRsvpRow {
  id: string;
  event_id: string;
  name: string;
  email: string;
  user_id: string | null;
  party_size: number;
  note: string | null;
  created_at: string;
}

export interface EventCheckinRow {
  id: string;
  event_id: string;
  rsvp_id: string | null;
  name: string | null;
  email: string;
  user_id: string | null;
  source: "self" | "staff";
  created_at: string;
}

// Fields the admin save endpoints may write. checkin_token is NOT here -- it is
// set at creation and only changed via the dedicated regenerate endpoint.
export const EVENT_WRITABLE_FIELDS = [
  "slug",
  "title",
  "status",
  "summary",
  "body",
  "starts_at",
  "ends_at",
  "timezone",
  "venue_name",
  "venue_address",
  "venue_city",
  "venue_state",
  "venue_url",
  "hero_image_path",
  "rsvp_enabled",
  "capacity",
  "checkin_enabled",
  "seo_title",
  "seo_description",
  "og_image_path",
  "sort_order",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Single-segment slug (no slashes -- events live under /irl/<slug>). Lowercase,
// url-safe, collapsed dashes.
export function normalizeEventSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// URL-safe random token for the venue QR (/irl/checkin/<token>).
export function generateCheckinToken(): string {
  return randomBytes(12).toString("base64url");
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

// ---------------------------------------------------------------------------
// Admin reads (service role)
// ---------------------------------------------------------------------------

export async function listEventsForAdmin(): Promise<EventListItem[]> {
  const db = createAdminClient();

  const { data: events, error } = await db
    .from("events")
    .select("*")
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (events || []) as EventRow[];

  const { data: rsvps } = await db.from("event_rsvps").select("event_id");
  const rsvpByEvent = new Map<string, number>();
  for (const r of (rsvps || []) as Array<{ event_id: string }>) {
    rsvpByEvent.set(r.event_id, (rsvpByEvent.get(r.event_id) || 0) + 1);
  }

  const { data: checkins } = await db.from("event_checkins").select("event_id");
  const checkinByEvent = new Map<string, number>();
  for (const r of (checkins || []) as Array<{ event_id: string }>) {
    checkinByEvent.set(r.event_id, (checkinByEvent.get(r.event_id) || 0) + 1);
  }

  return rows.map((e) => ({
    ...e,
    rsvp_count: rsvpByEvent.get(e.id) || 0,
    checkin_count: checkinByEvent.get(e.id) || 0,
  }));
}

export async function resolveEventId(idOrSlug: string): Promise<string | null> {
  if (isUuid(idOrSlug)) return idOrSlug;
  const db = createAdminClient();
  const { data } = await db.from("events").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function getEventForAdmin(idOrSlug: string): Promise<EventRow | null> {
  const db = createAdminClient();
  const field = isUuid(idOrSlug) ? "id" : "slug";
  const { data } = await db.from("events").select("*").eq(field, idOrSlug).maybeSingle();
  return (data as EventRow) ?? null;
}

export async function listRsvpsForEvent(eventId: string): Promise<EventRsvpRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("event_rsvps")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data || []) as EventRsvpRow[];
}

export async function listCheckinsForEvent(eventId: string): Promise<EventCheckinRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("event_checkins")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return (data || []) as EventCheckinRow[];
}

// ---------------------------------------------------------------------------
// Public reads (anon, RLS-gated to published)
// ---------------------------------------------------------------------------

export async function listPublishedUpcomingEvents(): Promise<EventRow[]> {
  const db = createPublicClient();
  const { data } = await db
    .from("events")
    .select("*")
    .eq("status", "published")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  return (data || []) as EventRow[];
}

export async function getPublishedEventBySlug(slug: string): Promise<EventRow | null> {
  const db = createPublicClient();
  const { data } = await db
    .from("events")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as EventRow) ?? null;
}

// Check-in lookup happens by token (service role -- the token is the secret).
export async function getEventByCheckinToken(token: string): Promise<EventRow | null> {
  const db = createAdminClient();
  const { data } = await db.from("events").select("*").eq("checkin_token", token).maybeSingle();
  return (data as EventRow) ?? null;
}

// ---------------------------------------------------------------------------
// Public writes (service role, called from hardened API routes)
// ---------------------------------------------------------------------------

export type RsvpResult =
  | { ok: true; rsvp: EventRsvpRow; duplicate: boolean }
  | { ok: false; error: string };

export async function createRsvp(input: {
  eventId: string;
  name: string;
  email: string;
  userId?: string | null;
  partySize?: number;
  note?: string | null;
}): Promise<RsvpResult> {
  const db = createAdminClient();
  const email = input.email.trim();
  const partySize = Number.isFinite(input.partySize) && (input.partySize as number) > 0
    ? Math.min(20, Math.floor(input.partySize as number))
    : 1;

  const { data, error } = await db
    .from("event_rsvps")
    .insert({
      event_id: input.eventId,
      name: input.name.trim(),
      email,
      user_id: input.userId ?? null,
      party_size: partySize,
      note: input.note?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    // Unique (event, lower(email)) -> already RSVP'd. Treat as success.
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("event_rsvps")
        .select("*")
        .eq("event_id", input.eventId)
        .ilike("email", email)
        .maybeSingle();
      if (existing) return { ok: true, rsvp: existing as EventRsvpRow, duplicate: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, rsvp: data as EventRsvpRow, duplicate: false };
}

export type CheckinResult =
  | { ok: true; checkin: EventCheckinRow; duplicate: boolean; matchedRsvp: boolean }
  | { ok: false; error: string };

export async function createCheckin(input: {
  eventId: string;
  email: string;
  name?: string | null;
  userId?: string | null;
}): Promise<CheckinResult> {
  const db = createAdminClient();
  const email = input.email.trim();

  // Match an existing RSVP by email so the check-in is attributed.
  const { data: rsvp } = await db
    .from("event_rsvps")
    .select("id, name, user_id")
    .eq("event_id", input.eventId)
    .ilike("email", email)
    .maybeSingle();

  const { data, error } = await db
    .from("event_checkins")
    .insert({
      event_id: input.eventId,
      rsvp_id: rsvp?.id ?? null,
      name: input.name?.trim() || rsvp?.name || null,
      email,
      user_id: input.userId ?? rsvp?.user_id ?? null,
      source: "self",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await db
        .from("event_checkins")
        .select("*")
        .eq("event_id", input.eventId)
        .ilike("email", email)
        .maybeSingle();
      if (existing) {
        return {
          ok: true,
          checkin: existing as EventCheckinRow,
          duplicate: true,
          matchedRsvp: !!existing.rsvp_id,
        };
      }
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, checkin: data as EventCheckinRow, duplicate: false, matchedRsvp: !!rsvp };
}
