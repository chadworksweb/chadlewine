"use client";

import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client (anon key, respects RLS)
// Use this in client components
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
