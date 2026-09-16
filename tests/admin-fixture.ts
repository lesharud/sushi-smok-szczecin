// Explicit browser contract fixture. Does not prove cloud Auth or database integration.
import type { Page } from "@playwright/test";
const userId = "10000000-0000-4000-8000-000000000001";
export async function adminFixture(
  page: Page,
  role: "admin" | "staff" | "outsider" = "admin",
) {
  const state = {
    role,
    fail: false,
    expired: false,
    orders: [makeOrder("SMOK-TEST-1")],
    products: [
      {
        id: "filadelfia-z-lososiem",
        name: "Filadelfia z łososiem",
        description: "Fixture description",
        category_id: "filadelfia",
        price_grosz: 3700,
        available: true,
        updated_at: "2026-09-16T10:00:00Z",
      },
    ],
    settings: {
      ordering_enabled: true,
      delivery_enabled: false,
      delivery_fee_grosz: null as number | null,
      updated_at: "2026-09-16T10:00:00Z",
    },
  };
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "staff@example.test",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const jwt =
    [
      { alg: "HS256", typ: "JWT" },
      {
        sub: userId,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    ]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".test-signature";
  await page.route("https://staff-fixture.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const data = request.postData() ? JSON.parse(request.postData()!) : {};
    if (path === "/auth/v1/token") {
      if (state.expired)
        return route.fulfill({
          status: 400,
          json: {
            code: "refresh_token_not_found",
            message: "Invalid Refresh Token",
          },
        });
      if (data.password === "wrong")
        return route.fulfill({
          status: 400,
          json: {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
          },
        });
      return route.fulfill({
        json: {
          access_token: jwt,
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user,
        },
      });
    }
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (state.fail)
      return route.fulfill({
        status: 503,
        json: { message: "test network unavailable" },
      });
    if (path === "/rest/v1/staff_profiles")
      return route.fulfill({
        json:
          state.role === "outsider" ? null : { role: state.role, active: true },
      });
    if (path === "/rest/v1/orders") {
      let rows = state.orders;
      if (url.searchParams.has("id"))
        rows = rows.filter(
          (o) => o.id === url.searchParams.get("id")?.slice(3),
        );
      const status = url.searchParams.get("status");
      if (status?.startsWith("eq."))
        rows = rows.filter((o) => o.status === status.slice(3));
      if (status?.startsWith("in."))
        rows = rows.filter((o) => status.includes(o.status));
      const number = url.searchParams.get("number");
      if (number)
        rows = rows.filter((o) =>
          o.number.includes(number.replace("ilike.", "").replaceAll("%", "")),
        );
      return route.fulfill({
        headers: {
          "access-control-expose-headers": "content-range",
          "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
        },
        json: request.headers().accept?.includes("vnd.pgrst.object")
          ? rows[0]
          : rows,
      });
    }
    if (path === "/rest/v1/rpc/staff_change_order_status") {
      const order = state.orders.find((o) => o.id === data.p_id)!;
      if (order.status !== data.p_expected)
        return route.fulfill({ status: 400, json: { message: "STALE_WRITE" } });
      order.status = data.p_next;
      return route.fulfill({ json: null });
    }
    if (path === "/rest/v1/products")
      return route.fulfill({ json: state.products });
    if (path === "/rest/v1/categories")
      return route.fulfill({
        json: [{ id: "filadelfia", name: "Filadelfia" }],
      });
    if (path === "/rest/v1/rpc/admin_update_product") {
      Object.assign(state.products[0], {
        name: data.p_name,
        description: data.p_description,
        category_id: data.p_category,
        price_grosz: data.p_price,
        available: data.p_available,
        updated_at: new Date().toISOString(),
      });
      return route.fulfill({ json: null });
    }
    if (path === "/rest/v1/order_settings")
      return route.fulfill({ json: state.settings });
    if (path === "/rest/v1/rpc/admin_update_settings") {
      Object.assign(state.settings, {
        ordering_enabled: data.p_ordering,
        delivery_enabled: data.p_delivery,
        delivery_fee_grosz: data.p_fee,
        updated_at: new Date().toISOString(),
      });
      return route.fulfill({ json: null });
    }
    return route.fulfill({
      status: 404,
      json: { message: "unhandled fixture endpoint" },
    });
  });
  return state;
}
export function makeOrder(number: string) {
  return {
    id:
      number === "SMOK-TEST-1"
        ? "10000000-0000-4000-8000-000000000011"
        : "10000000-0000-4000-8000-000000000012",
    number,
    status: "new",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    customer: { name: "Testowy klient", phone: "500000000" },
    fulfillment: "pickup",
    address: null,
    notes: "TEST — NIE PRZYGOTOWYWAĆ",
    preferred_time: null,
    subtotal_grosz: 7400,
    delivery_fee_grosz: 0,
    total_grosz: 7400,
    order_items: [
      {
        id: 1,
        name: "Filadelfia z łososiem",
        quantity: 2,
        unit_price_grosz: 3700,
        line_total_grosz: 7400,
      },
    ],
  };
}
export async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill("staff@example.test");
  await page.getByLabel("Hasło").fill("fixture-password-not-real");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}
