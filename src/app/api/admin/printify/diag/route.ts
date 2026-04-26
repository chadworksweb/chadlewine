export async function GET() {
  const token = process.env.PRINTIFY_API_TOKEN || "";
  const shop = process.env.PRINTIFY_SHOP_ID || "";
  const tokenLen = token.length;
  const tokenPrefix = token.slice(0, 12);
  const tokenSuffix = token.slice(-8);
  const trailingNewline = token.endsWith("\n");
  const trailingSpace = token.endsWith(" ");

  let liveCheck: { status: number; body: string } | null = null;
  if (token && shop) {
    const res = await fetch(`https://api.printify.com/v1/shops/${shop}/products.json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    liveCheck = { status: res.status, body: text.slice(0, 200) };
  }

  return Response.json({
    shop,
    tokenLen,
    tokenPrefix,
    tokenSuffix,
    trailingNewline,
    trailingSpace,
    liveCheck,
  });
}
