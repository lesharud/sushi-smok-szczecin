// Real PostgreSQL integration tests, restricted to the disposable local cluster.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
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
  "smok_stage1_test",
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
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const body = () => ({
  items: [
    { productId: "filadelfia-z-lososiem", quantity: 2 },
    { productId: "double-shrimp", quantity: 1 },
  ],
  customer: { name: "Anna", phone: "500600700" },
  fulfillment: "pickup",
  address: null,
  notes: "",
  preferredTime: null,
});
const call = (value = body(), key = randomUUID(), token = "a".repeat(64)) =>
  `public.create_guest_order('${key}','${token}',${quote(JSON.stringify(value))}::jsonb)`;
before(() => {
  // This connection is hard-coded to the disposable localhost cluster, never an env/database URL.
  sql("drop schema public cascade; create schema public;");
  sql(
    readFileSync("supabase/migrations/202609150001_guest_orders.sql", "utf8"),
  );
  sql(readFileSync("supabase/seed.sql", "utf8"));
});
test("multiple real rows and quantities, authoritative money, immutable snapshots and guest receipt authorization", () => {
  const key = randomUUID();
  const result = JSON.parse(
    sql(`begin; select ${call(body(), key)}; rollback;`)
      .split("\n")
      .find((line) => line.startsWith("{")),
  );
  assert.match(result.number, /^SMOK-\d+$/);
  assert.equal(result.status, "new");
  assert.equal(result.items.length, 2);
  const expected = Number(
    sql(
      "select price_grosz*2 + (select price_grosz from public.products where id='double-shrimp') from public.products where id='filadelfia-z-lososiem';",
    ),
  );
  assert.equal(result.subtotalGrosz, expected);
  assert.equal(result.totalGrosz, expected);
  assert.equal(result.customer, undefined);
  const rows = sql(
    `begin; select ${call(body(), key)}; update public.products set price_grosz=1,name='Changed' where id='filadelfia-z-lososiem'; select name||':'||unit_price_grosz||':'||line_total_grosz from public.order_items where product_id='filadelfia-z-lososiem'; select public.get_guest_order('${key}','${"b".repeat(64)}') is null; rollback;`,
  );
  assert.match(rows, /Filadelfia z łososiem:3700:7400/);
  assert.match(rows, /\nt\n/);
});
test("RPC independently rejects spoofed totals and invalid cart/customer/address data", () => {
  const invalid = [];
  for (const field of [
    "price",
    "subtotal",
    "total",
    "subtotalGrosz",
    "totalGrosz",
  ])
    invalid.push({ ...body(), [field]: 1 });
  invalid.push(
    { ...body(), items: [] },
    { ...body(), items: [{ productId: "not-real", quantity: 1 }] },
  );
  for (const quantity of [0, -1, 100, 1.5, "2"])
    invalid.push({
      ...body(),
      items: [{ productId: "filadelfia-z-lososiem", quantity }],
    });
  invalid.push(
    { ...body(), items: [{ ...body().items[0], price: 1 }] },
    { ...body(), items: [body().items[0], body().items[0]] },
  );
  invalid.push(
    { ...body(), customer: { name: "", phone: "bad" } },
    { ...body(), fulfillment: "delivery" },
    { ...body(), preferredTime: "2000-01-01T00:00:00Z" },
  );
  for (const input of invalid)
    assert.throws(() => sql(`select ${call(input)};`));
  assert.equal(sql("select count(*) from public.orders;"), "0");
});
test("unavailable product fails and disabled delivery is never priced as free", () => {
  assert.throws(
    () =>
      sql(
        `begin; update public.products set available=false where id='filadelfia-z-lososiem'; select ${call()}; commit;`,
      ),
    /PRODUCT_UNAVAILABLE/,
  );
  const request = {
    ...body(),
    fulfillment: "delivery",
    address: {
      street: "Testowa",
      building: "1",
      apartment: "",
      postalCode: "70-781",
      city: "Szczecin",
    },
  };
  assert.throws(() => sql(`select ${call(request)};`), /DELIVERY_UNAVAILABLE/);
  const data = sql(
    `begin; update public.order_settings set delivery_enabled=true,delivery_fee_grosz=1250; select ${call(request)}; rollback;`,
  );
  const result = JSON.parse(
    data.split("\n").find((line) => line.startsWith("{")),
  );
  assert.equal(result.deliveryFeeGrosz, 1250);
  assert.equal(result.totalGrosz, result.subtotalGrosz + 1250);
});
test("injected order_items write failure rolls back the entire order", () => {
  const result = sql(`begin;
    create function public.test_item_failure() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
    create trigger test_item_failure before insert on public.order_items for each row execute function public.test_item_failure();
    do $$ begin perform ${call()}; raise exception 'expected failure'; exception when others then if sqlerrm <> 'test failure' then raise; end if; end $$;
    select count(*) from public.orders; select count(*) from public.order_items; rollback;`);
  assert.match(result, /\n0\n0\n/);
});
test("anon and authenticated cannot read orders or execute order RPCs", () => {
  for (const role of ["anon", "authenticated"]) {
    assert.throws(
      () => sql(`set role ${role}; select * from public.orders;`),
      /permission denied/,
    );
    assert.throws(
      () => sql(`set role ${role}; select ${call()};`),
      /permission denied/,
    );
    assert.throws(
      () =>
        sql(
          `set role ${role}; insert into public.products(id) values ('injected');`,
        ),
      /permission denied/,
    );
  }
});
test("concurrent retries create exactly one order; changed request conflicts", async () => {
  const key = randomUUID();
  const invoke = promisify(execFile);
  const results = await Promise.all([
    invoke("psql", [...args, "-c", `select ${call(body(), key)};`]),
    invoke("psql", [...args, "-c", `select ${call(body(), key)};`]),
  ]);
  assert.equal(
    JSON.parse(results[0].stdout).id,
    JSON.parse(results[1].stdout).id,
  );
  assert.equal(
    sql(`select count(*) from public.orders where idempotency_key='${key}';`),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.order_items i join public.orders o on o.id=i.order_id where o.idempotency_key='${key}';`,
    ),
    "2",
  );
  assert.throws(
    () => sql(`select ${call({ ...body(), notes: "changed" }, key)};`),
    /IDEMPOTENCY_CONFLICT/,
  );
});
test("shared rate limit blocks a sixth new order but permits a retry", () => {
  const input = { ...body(), customer: { name: "Jan", phone: "500700800" } };
  const key = randomUUID();
  sql(
    `begin; select ${call(input, key)}; ${Array.from({ length: 4 }, () => `select ${call(input)};`).join("")} select ${call(input, key)}; rollback;`,
  );
  assert.throws(
    () =>
      sql(
        `begin; ${Array.from({ length: 6 }, () => `select ${call(input)};`).join("")} commit;`,
      ),
    /RATE_LIMITED/,
  );
});
test("legacy scaffold upgrades without deleting existing orders or customer data", () => {
  sql(
    "drop schema public cascade; create schema public; create schema if not exists auth; create table if not exists auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;",
  );
  sql(readFileSync("supabase/legacy/202609140001_restaurant.sql", "utf8"));
  sql(readFileSync("supabase/seed.sql", "utf8"));
  sql(
    `insert into public.orders(idempotency_key,number,status,fulfillment,customer,payment_method,subtotal_grosz,delivery_fee_grosz) values ('${randomUUID()}','LEGACY-1','pending','pickup','{}','cash',0,0);`,
  );
  sql(
    readFileSync("supabase/migrations/202609150001_guest_orders.sql", "utf8"),
  );
  assert.equal(
    sql("select status from public.orders where number='LEGACY-1';"),
    "new",
  );
  assert.equal(sql("select to_regclass('public.profiles') is not null;"), "t");
  assert.throws(
    () => sql("set role authenticated; select * from public.profiles;"),
    /permission denied/,
  );
  const order = JSON.parse(sql(`select ${call()};`));
  assert.equal(order.status, "new");
  assert.equal(order.items.length, 2);
});
