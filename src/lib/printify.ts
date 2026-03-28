const PRINTIFY_API = "https://api.printify.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function shopId() {
  return process.env.PRINTIFY_SHOP_ID!;
}

export interface PrintifyBlueprint {
  id: number;
  title: string;
  description: string;
  brand: string;
  model: string;
  images: string[];
}

export interface PrintifyPrintProvider {
  id: number;
  title: string;
}

export interface PrintifyVariant {
  id: number;
  title: string;
  options: Record<string, string>;
  placeholders: { position: string; height: number; width: number }[];
}

export async function getBlueprints(): Promise<PrintifyBlueprint[]> {
  const res = await fetch(`${PRINTIFY_API}/catalog/blueprints.json`, { headers: headers() });
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}

export async function getBlueprint(blueprintId: number): Promise<PrintifyBlueprint> {
  const res = await fetch(`${PRINTIFY_API}/catalog/blueprints/${blueprintId}.json`, { headers: headers() });
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}

export async function getPrintProviders(blueprintId: number): Promise<PrintifyPrintProvider[]> {
  const res = await fetch(`${PRINTIFY_API}/catalog/blueprints/${blueprintId}/print_providers.json`, { headers: headers() });
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}

export async function getVariants(blueprintId: number, printProviderId: number): Promise<{ variants: PrintifyVariant[] }> {
  const res = await fetch(
    `${PRINTIFY_API}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}

export async function uploadImage(url: string, fileName: string): Promise<{ id: string }> {
  const res = await fetch(`${PRINTIFY_API}/uploads/images.json`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ file_name: fileName, url }),
  });
  if (!res.ok) throw new Error(`Printify upload error: ${res.status}`);
  return res.json();
}

export async function createProduct(product: {
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: { id: number; price: number; is_enabled: boolean }[];
  print_areas: { variant_ids: number[]; placeholders: { position: string; images: { id: string; x: number; y: number; scale: number; angle: number }[] }[] }[];
}): Promise<{ id: string }> {
  const res = await fetch(`${PRINTIFY_API}/shops/${shopId()}/products.json`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error(`Printify create error: ${res.status}`);
  return res.json();
}

export async function publishProduct(productId: string): Promise<void> {
  const res = await fetch(`${PRINTIFY_API}/shops/${shopId()}/products/${productId}/publish.json`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: true,
      description: true,
      images: true,
      variants: true,
      tags: true,
    }),
  });
  if (!res.ok) throw new Error(`Printify publish error: ${res.status}`);
}

export async function getShopProducts(): Promise<{ data: { id: string; title: string; images: { src: string }[]; variants: { id: number; title: string; price: number }[] }[] }> {
  const res = await fetch(`${PRINTIFY_API}/shops/${shopId()}/products.json`, { headers: headers() });
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}
