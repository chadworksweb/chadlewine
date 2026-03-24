import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from("observations")
    .select("id, body")
    .ilike("body", "%aw-rubric__color-card%");

  if (!data || data.length === 0) {
    console.log("No matches.");
    return;
  }

  for (const obs of data) {
    const newBody = obs.body
      .replace(/aw-rubric__color-card/g, "aw-rubric__item")
      .replace(/aw-rubric__dot/g, "aw-rubric__swatch")
      .replace(/aw-rubric__color-label/g, "aw-rubric__label")
      .replace(/aw-rubric__color-desc/g, "aw-rubric__desc");

    await supabase.from("observations").update({ body: newBody }).eq("id", obs.id);
    console.log(`Fixed: ${obs.id}`);
  }
  console.log("Done");
}

main();
