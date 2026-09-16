import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { handle } from "../../.server-test/server/orders.js";
import { validateGuestRequest } from "../../.server-test/server/validation.js";
const input = () => ({
  items: [{ productId: "filadelfia-z-lososiem", quantity: 2 }],
  customer: { name: "Anna", phone: "+48 500 600 700" },
  fulfillment: "pickup",
  address: null,
  notes: "",
  preferredTime: null,
});
const request = (data, headers = {}) =>
  new Request("https://sushi.example/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
      "X-Receipt-Token": "a".repeat(64),
      ...headers,
    },
    body: JSON.stringify(data),
  });
test("guest input is normalized; only IDs and quantities represent cart items", () => {
  assert.equal(validateGuestRequest(input()).customer.phone, "+48500600700");
  for (const field of [
    "price",
    "subtotal",
    "total",
    "subtotalGrosz",
    "totalGrosz",
  ]) {
    assert.throws(() => validateGuestRequest({ ...input(), [field]: 1 }));
    const body = input();
    body.items[0][field] = 1;
    assert.throws(() => validateGuestRequest(body));
  }
});
test("empty, malformed, duplicated and absurd cart quantities are rejected", () => {
  for (const value of [
    null,
    [],
    {},
    { ...input(), items: [] },
    { ...input(), items: Array(51).fill(input().items[0]) },
  ])
    assert.throws(() => validateGuestRequest(value));
  for (const quantity of [-1, 0, 100, 1.5, "2", null, Infinity]) {
    const body = input();
    body.items[0].quantity = quantity;
    assert.throws(() => validateGuestRequest(body));
  }
  assert.throws(() =>
    validateGuestRequest({
      ...input(),
      items: [...input().items, ...input().items],
    }),
  );
  assert.throws(() =>
    validateGuestRequest({
      ...input(),
      items: ["a", "b", "c"].map((productId) => ({ productId, quantity: 99 })),
    }),
  );
});
test("customer, phone, time and address validation is server side", () => {
  for (const phone of ["abc", "123", "1234567890123456", "500600700<script>"])
    assert.throws(() =>
      validateGuestRequest({ ...input(), customer: { name: "Anna", phone } }),
    );
  for (const name of ["", "1", "12345", "x".repeat(101)])
    assert.throws(() =>
      validateGuestRequest({
        ...input(),
        customer: { name, phone: "500600700" },
      }),
    );
  assert.throws(() =>
    validateGuestRequest({
      ...input(),
      fulfillment: "delivery",
      address: null,
    }),
  );
  assert.throws(() =>
    validateGuestRequest({ ...input(), preferredTime: "tomorrow" }),
  );
  assert.throws(() =>
    validateGuestRequest({ ...input(), notes: "x".repeat(1001) }),
  );
});
test("API rejects cross-site, bad content, oversized bodies and missing idempotency", async () => {
  assert.equal(
    (
      await handle(
        request(input(), { Origin: "https://other.example" }),
        "create",
      )
    ).status,
    403,
  );
  assert.equal(
    (await handle(request(input(), { "Content-Type": "text/plain" }), "create"))
      .status,
    415,
  );
  assert.equal(
    (await handle(request({ ...input(), notes: "x".repeat(17000) }), "create"))
      .status,
    413,
  );
  assert.equal(
    (await handle(request(input(), { "Idempotency-Key": "" }), "create"))
      .status,
    400,
  );
  assert.equal(
    (await handle(new Request("https://sushi.example/api/orders"), "create"))
      .status,
    405,
  );
  const malformed = new Request("https://sushi.example/api/orders", {
    method: "POST",
    headers: request(input()).headers,
    body: "{",
  });
  assert.equal((await handle(malformed, "create")).status, 400);
});
test("missing Supabase configuration fails closed, never returns a simulated order", async () => {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  try {
    const response = await handle(request(input()), "create");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).order, undefined);
  } finally {
    if (url) process.env.SUPABASE_URL = url;
    if (key) process.env.SUPABASE_SECRET_KEY = key;
  }
});
test("API calls the real SDK RPC contract; private DB errors never reach the browser (transport fixture)", async () => {
  const oldFetch = globalThis.fetch,
    oldUrl = process.env.SUPABASE_URL,
    oldKey = process.env.SUPABASE_SECRET_KEY,
    oldLegacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://unit-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_unit_test_sentinel_not_real";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-test-placeholder";
  try {
    let calls = 0;
    let expectedKey = process.env.SUPABASE_SECRET_KEY;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(new Headers(init.headers).get("apikey"), expectedKey);
      assert.match(String(url), /\/rest\/v1\/rpc\/create_guest_order$/);
      const payload = JSON.parse(init.body);
      assert.equal(payload.p_request.customer.phone, "+48500600700");
      assert.equal(payload.p_receipt_hash.length, 64);
      assert.equal(payload.p_request.total, undefined);
      return Response.json({
        id: "fixture",
        number: "SMOK-100001",
        items: [],
        subtotalGrosz: 7400,
        totalGrosz: 7400,
      });
    };
    const response = await handle(request(input()), "create");
    assert.equal(response.status, 201);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    delete process.env.SUPABASE_SECRET_KEY;
    expectedKey = "legacy-test-placeholder";
    assert.equal((await handle(request(input()), "create")).status, 201);
    globalThis.fetch = async () =>
      Response.json(
        {
          message:
            "secret database detail sb_secret_unit_test_sentinel_not_real",
          code: "XX000",
        },
        { status: 500 },
      );
    const failed = await handle(request(input()), "create");
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /sentinel|database detail/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl) process.env.SUPABASE_URL = oldUrl;
    else delete process.env.SUPABASE_URL;
    if (oldKey) process.env.SUPABASE_SECRET_KEY = oldKey;
    else delete process.env.SUPABASE_SECRET_KEY;
    if (oldLegacy) process.env.SUPABASE_SERVICE_ROLE_KEY = oldLegacy;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test("public live catalog is GET-only and selects only public editable fields", async () => {
  const { catalog } = await import("../../.server-test/server/catalog.js");
  const previous = {
    fetch: globalThis.fetch,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  };
  process.env.SUPABASE_URL = "https://unit-test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_catalog_fixture_not_real";
  try {
    assert.equal(
      (
        await catalog(
          new Request("https://shop.test/api/catalog", { method: "POST" }),
        )
      ).status,
      405,
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/products");
      assert.equal(
        url.searchParams.get("select"),
        "id,name,description,category_id,price_grosz,available",
      );
      return Response.json([
        { id: "test", name: "Test", price_grosz: 1234, available: false },
      ]);
    };
    const response = await catalog(
      new Request("https://shop.test/api/catalog"),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal((await response.json()).products[0].available, false);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url) process.env.SUPABASE_URL = previous.url;
    else delete process.env.SUPABASE_URL;
    if (previous.key) process.env.SUPABASE_SECRET_KEY = previous.key;
    else delete process.env.SUPABASE_SECRET_KEY;
  }
});

test("build guard rejects current and legacy server secrets in public environment variables", async () => {
  const { assertPublicEnv } =
    await import("../../.server-test/server/public-env.js");
  assert.doesNotThrow(() =>
    assertPublicEnv({
      SUPABASE_SECRET_KEY: "sb_secret_not_real",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_not_real",
    }),
  );
  assert.throws(
    () => assertPublicEnv({ VITE_SUPABASE_SECRET_KEY: "not_real" }),
    /Server credentials/,
  );
  assert.throws(
    () =>
      assertPublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not_real" }),
    /Server credentials/,
  );
  const token =
    "e30." +
    Buffer.from(JSON.stringify({ role: "service_role" })).toString(
      "base64url",
    ) +
    ".fake";
  assert.throws(
    () => assertPublicEnv({ VITE_OLD_KEY: token }),
    /Server credentials/,
  );
});
