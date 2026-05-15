// Temporary diagnostic — returns lengths and prefixes of env vars only
// (never the full secret). Remove this file once the checkout-on-staging
// issue is resolved.
export async function GET() {
  const peek = (v: string | undefined) => ({
    present: !!v,
    length: v?.length ?? 0,
    prefix: v ? v.slice(0, 10) + "..." : null,
  });

  return Response.json({
    STRIPE_SECRET_KEY: peek(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: peek(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: peek(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: peek(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8),
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  });
}
