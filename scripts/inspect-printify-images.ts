/**
 * inspect-printify-images.ts
 *
 * Probe Printify's mockup CDN to figure out what sizes/params actually exist.
 * The list endpoint only returns one URL per image; we want to know if higher-
 * res variants are available via query params or a different path.
 */

import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) process.env[k.trim()] = rest.join("=").trim();
    });
}

const TOKEN = process.env.PRINTIFY_API_TOKEN!;
const SHOP = process.env.PRINTIFY_SHOP_ID!;

function readJpegDims(buf: Buffer): { w: number; h: number } | null {
  // Walk JPEG markers looking for SOF0/SOF2 to read width/height.
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return { w, h };
    }
    i += 2 + len;
  }
  return null;
}

async function probeDims(url: string): Promise<{ size: number; dims: { w: number; h: number } | null }> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return { size: buf.length, dims: readJpegDims(buf) };
}

async function main() {
  const list = await fetch(
    `https://api.printify.com/v1/shops/${SHOP}/products.json?limit=1`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  ).then((r) => r.json());

  const product = list.data?.[0];
  if (!product) return;
  const baseUrl = product.images?.[0]?.src;
  if (!baseUrl) return;

  console.log(`Product: ${product.title}`);
  console.log(`Base URL: ${baseUrl}\n`);

  // Probe variants of the URL — does Printify serve larger via query params?
  const candidates = [
    baseUrl,
    `${baseUrl}&width=2000`,
    `${baseUrl}&w=2000`,
    `${baseUrl}&size=large`,
    `${baseUrl}&size=2000x2000`,
    baseUrl.replace(".jpg", "_2000.jpg"),
    baseUrl.replace(".jpg", "_large.jpg"),
    baseUrl.replace(".jpg", "_original.jpg"),
    baseUrl.replace("images-api.printify.com", "images.printify.com"),
  ];

  for (const url of candidates) {
    try {
      const { size, dims } = await probeDims(url);
      console.log(`  ${dims ? `${dims.w}x${dims.h}` : "?"}  ${size} bytes  ${url}`);
    } catch (e) {
      console.log(`  ERR  ${url}  ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
