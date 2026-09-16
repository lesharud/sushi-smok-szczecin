// Real SQL integration on a separate disposable LOCAL database; never cloud credentials.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const args = [
  "-X",
  "-h",
  "127.0.0.1",
  "-p",
  "55439",
  "-U",
  "postgres",
  "-d",
  "smok_stage2_test",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
const sql = (text) =>
  execFileSync("psql", args, {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const admin = "10000000-0000-4000-8000-000000000001",
  staff = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003";
const as = (id, text) =>
  sql(
    `begin;set local role authenticated;set local request.jwt.claim.sub='${id}';${text};rollback;`,
  );
const request = {
  items: [
    { productId: "filadelfia-z-lososiem", quantity: 2 },
    { productId: "double-shrimp", quantity: 1 },
  ],
  customer: { name: "SQL test", phone: "500111222" },
  fulfillment: "pickup",
  address: null,
  notes: "TEST — NIE PRZYGOTOWYWAĆ",
  preferredTime: null,
};
let order;
before(() => {
  try {
    execFileSync(
      "createdb",
      ["-h", "127.0.0.1", "-p", "55439", "-U", "postgres", "smok_stage2_test"],
      { stdio: "pipe" },
    );
  } catch (e) {
    if (!String(e.stderr).includes("already exists")) throw e;
  }
  sql(
    `drop schema public cascade;create schema public;create schema if not exists auth;create table if not exists auth.users(id uuid primary key);create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  sql(
    readFileSync("supabase/migrations/202609150001_guest_orders.sql", "utf8"),
  );
  sql(readFileSync("supabase/seed.sql", "utf8"));
  order = JSON.parse(
    sql(
      `select public.create_guest_order('${randomUUID()}','${"a".repeat(64)}',${quote(JSON.stringify(request))}::jsonb);`,
    ),
  );
  sql(
    "create policy legacy_permissive_read on public.orders for select to authenticated using(true);create policy catalog_products_read on public.products for select to anon,authenticated using(true);",
  );
  sql(
    readFileSync(
      "supabase/migrations/202609160001_restaurant_admin.sql",
      "utf8",
    ),
  );
  sql(
    `grant usage on schema public to anon,authenticated;insert into auth.users(id) values('${admin}'),('${staff}'),('${outsider}') on conflict do nothing;insert into public.staff_profiles(user_id,role) values('${admin}','admin'),('${staff}','staff');`,
  );
});
test("additive migration preserves real guest rows, items and authoritative total", () => {
  assert.equal(
    sql(`select total_grosz from public.orders where id='${order.id}'`),
    String(order.totalGrosz),
  );
  assert.equal(
    sql(`select count(*) from public.order_items where order_id='${order.id}'`),
    "2",
  );
});
test("anon cannot read PII or staff, mutate data or execute staff RPCs", () => {
  for (const q of [
    "select number from public.orders",
    "select name from public.order_items",
    "select role from public.staff_profiles",
    "update public.products set price_grosz=1",
    "update public.orders set status='delivered'",
    "update public.order_settings set ordering_enabled=false",
    `select public.staff_change_order_status('${order.id}','new','accepted')`,
  ])
    assert.throws(() => sql(`set role anon;${q}`), /permission denied/);
});
test("an authenticated non-staff user sees no orders/items and cannot acquire a role", () => {
  assert.match(as(outsider, "select count(*) from public.orders"), /\n0\n/);
  assert.match(
    as(outsider, "select count(*) from public.order_items"),
    /\n0\n/,
  );
  assert.throws(
    () =>
      as(
        outsider,
        `insert into public.staff_profiles(user_id,role)values('${outsider}','admin')`,
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      as(
        outsider,
        `select public.staff_change_order_status('${order.id}','new','accepted')`,
      ),
    /STAFF_REQUIRED/,
  );
});
test("staff reads order details and snapshots but never receipt hashes or another staff profile", () => {
  assert.match(
    as(staff, `select number from public.orders where id='${order.id}'`),
    /SMOK-/,
  );
  assert.match(
    as(
      staff,
      `select quantity from public.order_items where order_id='${order.id}' order by quantity desc`,
    ),
    /\n2\n1\n/,
  );
  assert.throws(
    () => as(staff, "select receipt_hash from public.orders"),
    /permission denied/,
  );
  assert.match(
    as(staff, "select count(*) from public.staff_profiles"),
    /\n1\n/,
  );
  assert.match(as(staff, "select count(*) from public.products"), /\n0\n/);
  assert.throws(
    () => as(staff, "update public.orders set status='delivered'"),
    /permission denied/,
  );
});
test("status workflow, cancellation, stale writes and immutable totals enforced in SQL", () => {
  assert.throws(
    () =>
      as(
        staff,
        `select public.staff_change_order_status('${order.id}','new','delivered')`,
      ),
    /INVALID_TRANSITION/,
  );
  assert.throws(
    () =>
      as(
        staff,
        `select public.staff_change_order_status('${order.id}','accepted','preparing')`,
      ),
    /STALE_WRITE/,
  );
  const result = as(
    staff,
    `select public.staff_change_order_status('${order.id}','new','accepted');select public.staff_change_order_status('${order.id}','accepted','preparing');select public.staff_change_order_status('${order.id}','preparing','ready');select public.staff_change_order_status('${order.id}','ready','delivered');select status||':'||total_grosz from public.orders where id='${order.id}'`,
  );
  assert.match(result, new RegExp(`delivered:${order.totalGrosz}`));
  assert.throws(
    () =>
      as(
        staff,
        `select public.staff_change_order_status('${order.id}','new','cancelled');select public.staff_change_order_status('${order.id}','cancelled','accepted')`,
      ),
    /INVALID_TRANSITION/,
  );
  assert.match(
    as(
      staff,
      `select public.staff_change_order_status('${order.id}','new','cancelled');select status from public.orders where id='${order.id}'`,
    ),
    /cancelled/,
  );
});
test("committed staff mutation persists and records actor; revoked staff immediately loses rights", () => {
  sql(
    `begin;set local role authenticated;set local request.jwt.claim.sub='${staff}';select public.staff_change_order_status('${order.id}','new','accepted');commit;`,
  );
  assert.equal(
    sql(`select status from public.orders where id='${order.id}'`),
    "accepted",
  );
  assert.equal(
    sql(
      `select actor_id from public.order_status_events where order_id='${order.id}'`,
    ),
    staff,
  );
  sql(`update public.staff_profiles set active=false where user_id='${staff}'`);
  assert.match(as(staff, "select count(*) from public.orders"), /\n0\n/);
  assert.throws(
    () =>
      as(
        staff,
        `select public.staff_change_order_status('${order.id}','accepted','preparing')`,
      ),
    /STAFF_REQUIRED/,
  );
  sql(`update public.staff_profiles set active=true where user_id='${staff}'`);
});
test("admin product edits use optimistic concurrency and preserve guest pricing and snapshots", () => {
  const p = "filadelfia-z-lososiem";
  const stamp = sql(`select updated_at from public.products where id='${p}'`);
  const edit = (price, available = true) =>
    `select public.admin_update_product('${p}','${stamp}','SQL product','SQL description','filadelfia',${price},${available})`;
  assert.throws(() => as(staff, edit(100)), /ADMIN_REQUIRED/);
  assert.throws(() => as(admin, edit(-1)), /INVALID_PRODUCT/);
  assert.throws(() => as(admin, `${edit(100)};${edit(200)}`), /STALE_WRITE/);
  assert.throws(
    () =>
      sql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${admin}';${edit(100, false)};reset role;select public.create_guest_order('${randomUUID()}','${"b".repeat(64)}',${quote(JSON.stringify(request))}::jsonb);rollback;`,
      ),
    /PRODUCT_UNAVAILABLE/,
  );
  const result = sql(
    `begin;set local role authenticated;set local request.jwt.claim.sub='${admin}';${edit(100)};reset role;select public.create_guest_order('${randomUUID()}','${"c".repeat(64)}',${quote(JSON.stringify(request))}::jsonb);rollback;`,
  );
  const fresh = JSON.parse(result.split("\n").find((l) => l.startsWith("{")));
  assert.equal(fresh.items.find((i) => i.productId === p).unitPriceGrosz, 100);
  assert.equal(
    sql(
      `select unit_price_grosz from public.order_items where order_id='${order.id}' and product_id='${p}'`,
    ),
    "3700",
  );
});
test("settings admin-only, unknown delivery tariff rejected, disabling orders blocks guest RPC", () => {
  const stamp = sql("select updated_at from public.order_settings");
  const edit = (enabled, delivery = false, fee = "null") =>
    `select public.admin_update_settings('${stamp}',${enabled},${delivery},${fee})`;
  assert.throws(() => as(staff, edit(false)), /ADMIN_REQUIRED/);
  assert.throws(() => as(admin, edit(true, true)), /INVALID_SETTINGS/);
  assert.throws(
    () =>
      sql(
        `begin;set local role authenticated;set local request.jwt.claim.sub='${admin}';${edit(false)};reset role;select public.create_guest_order('${randomUUID()}','${"d".repeat(64)}',${quote(JSON.stringify(request))}::jsonb);rollback;`,
      ),
    /ORDERING_UNAVAILABLE/,
  );
});
