import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const PW = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const HOST = process.env.BUNNY_STORAGE_HOSTNAME!;
const FROM = "MarltonMuarls6_web.jpg";
const TO = "art-thumbnails/MarltonMuarls6_web.jpg";

async function main() {
  const src = await fetch(`https://${HOST}/${ZONE}/${FROM}`, { headers: { AccessKey: PW } });
  if (!src.ok) throw new Error(`GET ${FROM}: ${src.status}`);
  const buf = Buffer.from(await src.arrayBuffer());

  const put = await fetch(`https://${HOST}/${ZONE}/${TO}`, {
    method: "PUT",
    headers: { AccessKey: PW, "Content-Type": src.headers.get("content-type") || "image/jpeg" },
    body: buf,
  });
  if (!put.ok) throw new Error(`PUT ${TO}: ${put.status} ${await put.text().catch(() => "")}`);

  const del = await fetch(`https://${HOST}/${ZONE}/${FROM}`, { method: "DELETE", headers: { AccessKey: PW } });
  if (!del.ok && del.status !== 404) throw new Error(`DELETE ${FROM}: ${del.status}`);

  console.log(`moved ${FROM} -> ${TO} (${buf.length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
