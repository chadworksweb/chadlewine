import { createClient } from "@supabase/supabase-js";

// Server-side client with service role key (full access, bypasses RLS)
// Use this in API routes and server components that need admin access
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Server-side client with anon key (respects RLS)
// Use this for public data queries in server components
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
