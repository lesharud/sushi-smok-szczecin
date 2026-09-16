// Opt-in integration check against a configured Supabase project. Creates one real TEST-labelled order.
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env };
if (env.CONFIRM_TEST_ORDER !== "true")
  throw new Error(
    "Set CONFIRM_TEST_ORDER=true to create a real integration-test order in the configured Supabase project.",
  );
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.SUPABASE_URL || !secretKey)
  throw new Error(
    "Configure SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local. Never send secrets to chat.",
  );
const db = createClient(env.SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: products, error: catalogError } = await db
  .from("products")
  .select("id,price_grosz")
  .eq("available", true)
  .order("id")
  .limit(2);
if (catalogError || !products?.length)
  throw new Error("Cannot read products. Apply the migration and seed first.");
const key = randomUUID();
const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
const input = {
  items: products.map((p, index) => ({ productId: p.id, quantity: index + 1 })),
  customer: { name: "Integration test", phone: "500000000" },
  fulfillment: "pickup",
  address: null,
  notes: "TEST INTEGRACYJNY — NIE PRZYGOTOWYWAĆ. Sprawdzenie zapisu w bazie.",
  preferredTime: null,
};
const { data: order, error } = await db.rpc("create_guest_order", {
  p_key: key,
  p_receipt_hash: hash,
  p_request: input,
});
if (error || !order)
  throw new Error(
    "Order RPC failed. Check migration, ordering settings and Supabase logs (without sharing secrets).",
  );
const { data: stored, error: readError } = await db
  .from("orders")
  .select("id,number,status,subtotal_grosz,total_grosz")
  .eq("id", order.id)
  .single();
const { data: items, error: itemError } = await db
  .from("order_items")
  .select("product_id,quantity,unit_price_grosz,line_total_grosz")
  .eq("order_id", order.id);
const expected = products.reduce(
  (total, p, index) => total + p.price_grosz * (index + 1),
  0,
);
if (
  readError ||
  itemError ||
  !stored ||
  items?.length !== products.length ||
  stored.total_grosz !== expected ||
  stored.subtotal_grosz !== expected ||
  stored.status !== "new"
)
  throw new Error(
    "Database verification failed. Inspect the test order before retrying.",
  );
const { data: retry, error: retryError } = await db.rpc("create_guest_order", {
  p_key: key,
  p_receipt_hash: hash,
  p_request: input,
});
if (retryError || retry.id !== stored.id)
  throw new Error("Idempotency verification failed.");
console.log(
  JSON.stringify({
    verified: true,
    orderNumber: stored.number,
    items: items.length,
    subtotalGrosz: stored.subtotal_grosz,
    totalGrosz: stored.total_grosz,
    idempotency: true,
  }),
);
const { error: cancelError } = await db
  .from("orders")
  .update({ status: "cancelled" })
  .eq("id", stored.id);
if (cancelError)
  throw new Error(
    "Test order verified but could not be cancelled. Cancel it in Supabase Table Editor.",
  );
console.log("Integration test order marked cancelled; audit rows retained.");
