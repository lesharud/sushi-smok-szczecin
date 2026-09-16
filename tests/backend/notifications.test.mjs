import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sendTelegram,
  telegramConfigured,
  telegramOrder,
  smsProvider,
  smsTemplate,
} from "../../.server-test/server/notifications/providers.js";
import { notifications } from "../../.server-test/server/notifications/api.js";
import { processNotifications } from "../../.server-test/server/notifications/worker.js";
import { assertPublicEnv } from "../../.server-test/server/public-env.js";
const env = {
  TELEGRAM_BOT_TOKEN: "123456:fixture_key_only_never_real_12345",
  TELEGRAM_CHAT_ID: "-12345",
  NOTIFICATION_WORKER_SECRET: "x".repeat(40),
};
const order = {
  number: "SMOK-TEST",
  created_at: "2026-09-16T12:00:00Z",
  fulfillment: "pickup",
  customer: { name: "Anna <b>test</b>", phone: "500000000" },
  address: null,
  preferred_time: null,
  notes: "TEST — NIE PRZYGOTOWYWAĆ",
  total_grosz: 24100,
  order_items: [{ name: "Maki", quantity: 2 }],
};
test("Telegram successful plain-text message; no parsing/user-selected destination", async () => {
  const result = await sendTelegram(
    telegramOrder(order, "https://sushi.example"),
    env,
    async (url, init) => {
      assert.equal(new URL(url).hostname, "api.telegram.org");
      const body = JSON.parse(init.body);
      assert.equal(body.chat_id, env.TELEGRAM_CHAT_ID);
      assert.equal(body.parse_mode, undefined);
      assert.match(body.text, /2 × Maki/);
      assert.match(body.text, /241,00 zł/);
      assert.match(body.text, /\/admin\/orders/);
      return Response.json({ ok: true, result: { message_id: 99 } });
    },
  );
  assert.equal(result.outcome, "sent");
  assert.equal(result.messageId, "99");
});
test("Telegram disabled/malformed ENV never contacts network; SMS is disabled with all five templates", async () => {
  for (const e of [
    {},
    { ...env, TELEGRAM_CHAT_ID: "" },
    { ...env, TELEGRAM_BOT_TOKEN: "not-a-token" },
  ]) {
    assert.equal(telegramConfigured(e), false);
    assert.equal(
      (
        await sendTelegram("test", e, () => {
          throw Error("Must not call");
        })
      ).code,
      "UNCONFIGURED",
    );
  }
  assert.equal(smsProvider, null);
  for (const event of [
    "order_received",
    "order_confirmed",
    "order_ready",
    "order_cancelled",
    "delivery_started",
  ])
    assert.match(smsTemplate(event, "SMOK-123"), /SMOK-123/);
});
test("Telegram errors and timeout are sanitized, bounded and retryable", async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const r = await sendTelegram("sensitive", env, async () =>
      Response.json(
        { description: "sensitive secret", parameters: { retry_after: 120 } },
        { status },
      ),
    );
    assert.equal(r.outcome, "retry");
    assert.ok(!JSON.stringify(r).includes("sensitive"));
    if (status === 429) assert.equal(r.retryAfter, 120);
  }
  assert.equal(
    (
      await sendTelegram("test", env, async () => {
        throw Error("https://secret");
      })
    ).outcome,
    "unknown",
  );
});
test("largest valid order fits Telegram and preserves every quantity and note", () => {
  const text = telegramOrder(
    {
      ...order,
      customer: { name: "x".repeat(100), phone: "1".repeat(15) },
      order_items: Array.from({ length: 50 }, (_, i) => ({
        name: `${i} <>&` + "x".repeat(150),
        quantity: 99,
      })),
      notes: "x".repeat(1000),
      fulfillment: "delivery",
      address: {
        street: "x".repeat(150),
        building: "x".repeat(30),
        apartment: "x".repeat(30),
        postalCode: "00-000",
        city: "x".repeat(100),
      },
      preferred_time: "2026-09-17T12:00:00Z",
    },
    "https://sushi-smok-szczecin.vercel.app",
  );
  assert.ok(text.length <= 4096);
  assert.equal((text.match(/99 × /g) || []).length, 50);
});
function deps(role = "admin", active = true) {
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: (table) => {
      const data =
        table === "staff_profiles"
          ? { role, active }
          : table === "notification_worker_state"
            ? { last_run_at: null }
            : [];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data }),
        single: () => Promise.resolve({ data }),
      };
      return q;
    },
    rpc: async () => ({ data: "job-test" }),
  };
  return {
    database: () => db,
    processNotifications: async () => ({ processed: 0 }),
  };
}
const req = (method = "GET", token = "valid", body) =>
  new Request("https://sushi.example/api/notifications", {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body ? { body } : {}),
  });
test("notification status admin only; never exposes keys; SMS unconfigured", async () => {
  for (const [role, active, status] of [
    ["staff", true, 403],
    ["admin", false, 403],
    ["outsider", true, 403],
    ["admin", true, 200],
  ]) {
    const r = await notifications(req(), deps(role, active), env);
    assert.equal(r.status, status);
    if (status === 200) {
      const j = await r.json();
      assert.equal(j.telegram.configured, true);
      assert.equal(j.sms.configured, false);
      assert.ok(!JSON.stringify(j).includes(env.TELEGRAM_BOT_TOKEN));
    }
  }
  assert.equal((await notifications(req("GET", ""), deps(), env)).status, 401);
});
test("test notification rejects unauthorized and arbitrary content, disabled provider; queues fixed test for admin", async () => {
  assert.equal((await notifications(req("POST", ""), deps(), env)).status, 401);
  assert.equal(
    (await notifications(req("POST"), deps("staff"), env)).status,
    403,
  );
  assert.equal(
    (await notifications(req("POST", "valid", "arbitrary"), deps(), env))
      .status,
    400,
  );
  assert.equal((await notifications(req("POST"), deps(), {})).status, 409);
  assert.equal((await notifications(req("POST"), deps(), env)).status, 202);
});
test("worker endpoint requires its own strong secret; user JWT cannot invoke delivery", async () => {
  for (const secret of ["", "valid", env.NOTIFICATION_WORKER_SECRET]) {
    const r = await notifications(
      new Request("https://sushi.example/api/notification-worker", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      }),
      deps(),
      env,
    );
    assert.equal(
      r.status,
      secret === env.NOTIFICATION_WORKER_SECRET ? 200 : 401,
    );
  }
});
test("worker failure persists retry result, success is not claimed again; disabled makes no send", async () => {
  let status = "pending",
    attempts = 0;
  const attemptsLog = [];
  const db = {
    rpc: async (name, args) => {
      if (name === "claim_notification") {
        if (status !== "pending" || !args.p_channels.length)
          return { data: [] };
        status = "processing";
        return {
          data: [
            {
              id: "1",
              event: "test",
              lease_token: "lease",
              attempts: ++attempts,
            },
          ],
        };
      }
      attemptsLog.push(args);
      status = args.p_outcome === "sent" ? "sent" : "waiting";
      return { data: true };
    },
  };
  await processNotifications(db, {}, () => {
    throw Error("disabled");
  });
  assert.equal(attempts, 0);
  await processNotifications(db, env, async () =>
    Response.json({}, { status: 500 }),
  );
  assert.equal(status, "waiting");
  assert.equal(attemptsLog[0].p_outcome, "retry");
  status = "pending";
  await processNotifications(db, env, async () =>
    Response.json({ ok: true, result: { message_id: 1 } }),
  );
  assert.equal(status, "sent");
  assert.equal(attempts, 2);
  await processNotifications(db, env, () => {
    throw Error("duplicate");
  });
  assert.equal(attempts, 2);
});
test("public ENV build guard rejects notification secrets", () => {
  for (const key of [
    "VITE_TELEGRAM_BOT_TOKEN",
    "VITE_SMS_API_KEY",
    "VITE_NOTIFICATION_WORKER_SECRET",
  ])
    assert.throws(() => assertPublicEnv({ [key]: "fixture" }));
});
