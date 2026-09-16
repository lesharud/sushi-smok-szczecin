// Local disposable database ONLY. No production credentials or provider network access.
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
  "smok_stage3_test",
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
const input = {
  items: [
    { productId: "filadelfia-z-lososiem", quantity: 2 },
    { productId: "double-shrimp", quantity: 1 },
  ],
  customer: { name: "SQL notification test", phone: "500222333" },
  fulfillment: "pickup",
  address: null,
  notes: "TEST — NIE PRZYGOTOWYWAĆ",
  preferredTime: null,
};
let order, key;
const create = (k) =>
  `select public.create_guest_order('${k}','${"a".repeat(64)}',${quote(JSON.stringify(input))}::jsonb);`;
before(() => {
  try {
    execFileSync(
      "createdb",
      ["-h", "127.0.0.1", "-p", "55439", "-U", "postgres", "smok_stage3_test"],
      { stdio: "pipe" },
    );
  } catch (e) {
    if (!String(e.stderr).includes("already exists")) throw e;
  }
  sql(
    `drop schema public cascade;create schema public;create schema if not exists auth;create table if not exists auth.users(id uuid primary key);create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of [
    "supabase/migrations/202609150001_guest_orders.sql",
    "supabase/seed.sql",
    "supabase/migrations/202609160001_restaurant_admin.sql",
    "supabase/migrations/202609170001_notifications.sql",
  ])
    sql(readFileSync(file, "utf8"));
  sql("grant usage on schema public to anon,authenticated,service_role;");
  key = randomUUID();
  order = JSON.parse(sql(create(key)));
});
test("atomic order/items/outbox persistence, idempotent duplicate prevention", () => {
  assert.equal(
    sql(`select count(*) from public.order_items where order_id='${order.id}'`),
    "2",
  );
  assert.equal(
    sql(
      `select count(*) from public.notification_jobs where order_id='${order.id}'`,
    ),
    "2",
  );
  assert.equal(JSON.parse(sql(create(key))).id, order.id);
  assert.equal(
    sql(
      `select count(*) from public.notification_jobs where order_id='${order.id}'`,
    ),
    "2",
  );
  assert.equal(
    sql(
      `select count(*) from public.notification_jobs where channel='sms' and status='pending'`,
    ),
    "1",
  );
});
test("public/staff cannot read outbox, claim, acknowledge or enqueue tests", () => {
  for (const role of ["anon", "authenticated"])
    for (const query of [
      "select * from public.notification_jobs",
      "select * from public.notification_attempts",
      "select public.claim_notification(array['telegram'])",
      "select public.enqueue_notification_test()",
    ]) {
      assert.throws(() =>
        sql(`begin;set local role ${role};${query};rollback;`),
      );
    }
});
test("concurrent claims never get the same job; failure cannot affect saved order; retry resumes and sent is final", async () => {
  const invoke = () =>
    promisify(execFile)(
      "psql",
      [
        ...args,
        "-c",
        "select coalesce(json_agg(j),'[]') from public.claim_notification(array['telegram']) j",
      ],
      { encoding: "utf8" },
    ).then((r) => JSON.parse(r.stdout));
  const claims = await Promise.all([invoke(), invoke()]);
  const jobs = claims.flat();
  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.equal(
    sql(
      `select public.finish_notification('${job.id}','${job.lease_token}','retry','TELEGRAM_UNAVAILABLE',30,null)`,
    ),
    "t",
  );
  assert.equal(
    sql(`select status from public.orders where id='${order.id}'`),
    "new",
  );
  assert.equal(JSON.parse(sql(create(key))).id, order.id);
  assert.equal(
    sql("select count(*) from public.claim_notification(array['telegram'])"),
    "0",
  );
  sql(
    `update public.notification_jobs set available_at=now()-interval '1 second' where id='${job.id}'`,
  );
  const retry = JSON.parse(
    sql(
      "select to_json(j) from public.claim_notification(array['telegram']) j",
    ),
  );
  assert.equal(retry.attempts, 2);
  assert.equal(
    sql(
      `select public.finish_notification('${job.id}','${job.lease_token}','sent','DELIVERED',1,'1')`,
    ),
    "f",
  );
  assert.equal(
    sql(
      `select public.finish_notification('${job.id}','${retry.lease_token}','sent','DELIVERED',1,'1')`,
    ),
    "t",
  );
  assert.equal(
    sql("select count(*) from public.claim_notification(array['telegram'])"),
    "0",
  );
  assert.equal(
    sql(
      `select count(*) from public.notification_attempts where job_id='${job.id}'`,
    ),
    "2",
  );
});
test("test sends rate limited globally; expired leases recovered and logged", () => {
  const id = sql("select public.enqueue_notification_test()");
  assert.throws(() => sql("select public.enqueue_notification_test()"));
  const first = JSON.parse(
    sql(
      "select to_json(j) from public.claim_notification(array['telegram']) j",
    ),
  );
  assert.equal(first.id, id);
  sql(
    `update public.notification_jobs set locked_until=now()-interval '1 second' where id='${id}'`,
  );
  const next = JSON.parse(
    sql(
      "select to_json(j) from public.claim_notification(array['telegram']) j",
    ),
  );
  assert.equal(next.id, id);
  assert.notEqual(next.lease_token, first.lease_token);
  assert.equal(
    sql(`select code from public.notification_attempts where job_id='${id}'`),
    "LEASE_EXPIRED",
  );
  sql(
    `select public.finish_notification('${id}','${next.lease_token}','sent','DELIVERED',1,'2')`,
  );
});
test("SMS events persisted but never sent, no invented delivery_started transition", () => {
  for (const status of ["accepted", "preparing", "ready", "cancelled"])
    sql(`update public.orders set status='${status}' where id='${order.id}'`);
  assert.equal(
    sql(
      `select string_agg(event,',' order by event) from public.notification_jobs where order_id='${order.id}' and channel='sms'`,
    ),
    "order_cancelled,order_confirmed,order_ready,order_received",
  );
  assert.equal(
    sql(
      "select count(*) from public.notification_jobs where channel='sms' and attempts>0",
    ),
    "0",
  );
});
test("retention expiry prevents stale sends; retries stop after eight attempts", () => {
  sql(
    `update public.notification_jobs set expires_at=now()-interval '1 second' where status='pending';select count(*) from public.claim_notification('{}');`,
  );
  assert.equal(
    sql("select count(*) from public.notification_jobs where status='pending'"),
    "0",
  );
  sql(
    `update public.notification_jobs set created_at=now()-interval '2 minutes' where event='test'`,
  );
  const id = sql("select public.enqueue_notification_test()");
  sql(`update public.notification_jobs set attempts=7 where id='${id}'`);
  const job = JSON.parse(
    sql(
      "select to_json(j) from public.claim_notification(array['telegram']) j",
    ),
  );
  sql(
    `select public.finish_notification('${id}','${job.lease_token}','unknown','TELEGRAM_TIMEOUT_OR_NETWORK',30,null)`,
  );
  assert.equal(
    sql(`select status from public.notification_jobs where id='${id}'`),
    "failed",
  );
});
