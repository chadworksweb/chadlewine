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

// Custom-storefront publish is two-step: Printify locks the product as "Publishing"
// and fires product:publish:started, and we must POST one of these to clear the lock.
export async function publishingSucceeded(
  productId: string,
  external: { id: string; handle: string },
): Promise<void> {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${shopId()}/products/${productId}/publishing_succeeded.json`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ external }),
    },
  );
  if (!res.ok) {
    throw new Error(`Printify publishing_succeeded error: ${res.status} ${await res.text()}`);
  }
}

export async function publishingFailed(productId: string, reason: string): Promise<void> {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${shopId()}/products/${productId}/publishing_failed.json`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok) {
    throw new Error(`Printify publishing_failed error: ${res.status} ${await res.text()}`);
  }
}

export interface PrintifyShopProduct {
  id: string;
  title: string;
  description: string;
  visible: boolean;
  is_locked: boolean;
  images: { src: string; is_default?: boolean; position?: string }[];
  variants: {
    id: number;
    title: string;
    price: number;
    is_enabled: boolean;
    options?: number[];
  }[];
  options?: {
    name: string;
    type: string;
    values: { id: number; title: string }[];
  }[];
}

export async function getShopProducts(): Promise<{ data: PrintifyShopProduct[] }> {
  const res = await fetch(`${PRINTIFY_API}/shops/${shopId()}/products.json`, { headers: headers() });
  if (!res.ok) throw new Error(`Printify error: ${res.status}`);
  return res.json();
}

export interface PrintifyOrderLineItem {
  product_id: string;
  variant_id: number;
  quantity: number;
}

export interface PrintifyShipping {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  country: string;
  region: string;
  address1: string;
  address2?: string;
  city: string;
  zip: string;
}

export interface PrintifyOrderPayload {
  external_id: string;
  label?: string;
  line_items: PrintifyOrderLineItem[];
  shipping_method: number;
  is_printify_express?: boolean;
  is_economy_shipping?: boolean;
  send_shipping_notification: boolean;
  address_to: PrintifyShipping;
}

export async function createOrder(payload: PrintifyOrderPayload): Promise<{ id: string }> {
  const res = await fetch(`${PRINTIFY_API}/shops/${shopId()}/orders.json`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify order error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function sendOrderToProduction(printifyOrderId: string): Promise<void> {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${shopId()}/orders/${printifyOrderId}/send_to_production.json`,
    { method: "POST", headers: headers() },
  );
  if (!res.ok) throw new Error(`Printify send-to-production error: ${res.status}`);
}

export interface PrintifyOrderRecord {
  id: string;
  status: string;
  shipments?: Array<{
    carrier: string;
    number: string;
    url: string;
    delivered_at?: string | null;
  }>;
}

export async function getOrder(printifyOrderId: string): Promise<PrintifyOrderRecord> {
  const res = await fetch(
    `${PRINTIFY_API}/shops/${shopId()}/orders/${printifyOrderId}.json`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`Printify get-order error: ${res.status}`);
  return res.json();
}
