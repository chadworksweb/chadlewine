/**
 * Replace [aw_rubric] shortcode text with rendered HTML in all observations.
 * Run with: source .env.local && npx tsx scripts/fix-rubric-shortcode.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RUBRIC_HTML = `<div class="aw-rubric"><div class="aw-rubric__terms"><p>The <strong>message</strong> is what is being said. Is it describing healthy or productive thoughts, behaviors or actions? Or unhealthy, indulgent or destructive thoughts, behavior or actions?</p><p>The <strong>expression</strong> is how it's being said. Is it said with kindness, understanding and compassion? Or is it said with malice, disdain, ego or aggression?</p><p>The <strong>intention</strong> is the why of the message or expression. Is it meant to heal, empower or create? Or hurt, harm, minimize or destroy?</p></div><div class="aw-rubric__colors"><div class="aw-rubric__color-card aw-rubric__color-card--bright-green"><span class="aw-rubric__dot aw-rubric__dot--bright-green"></span><strong class="aw-rubric__color-label">BRIGHT GREEN</strong><span class="aw-rubric__color-desc">Songs with an <em>exceptionally</em> positive charge.</span></div><div class="aw-rubric__color-card aw-rubric__color-card--green"><span class="aw-rubric__dot aw-rubric__dot--green"></span><strong class="aw-rubric__color-label">GREEN</strong><span class="aw-rubric__color-desc">Songs with a positive or neutral charge.</span></div><div class="aw-rubric__color-card aw-rubric__color-card--red"><span class="aw-rubric__dot aw-rubric__dot--red"></span><strong class="aw-rubric__color-label">RED</strong><span class="aw-rubric__color-desc">Songs with a negative charge.</span></div></div></div>`;

async function main() {
  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, body")
    .or("body.ilike.%[aw_rubric]%");

  if (!observations || observations.length === 0) {
    console.log("No observations with [aw_rubric] found.");
    return;
  }

  for (const obs of observations) {
    // Replace both <p>[aw_rubric]</p> and bare [aw_rubric]
    const newBody = obs.body
      .replace(/<p>\[aw_rubric\]<\/p>/g, RUBRIC_HTML)
      .replace(/\[aw_rubric\]/g, RUBRIC_HTML);

    const { error } = await supabase
      .from("observations")
      .update({ body: newBody })
      .eq("id", obs.id);

    if (error) {
      console.error(`FAIL: "${obs.title}" — ${error.message}`);
    } else {
      console.log(`OK: "${obs.title}"`);
    }
  }

  console.log("Done.");
}

main();
