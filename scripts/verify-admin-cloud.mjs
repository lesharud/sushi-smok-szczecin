// Opt-in real cloud verification; never print auth tokens, keys, email or customer data.
// Uses an administrative one-time email token for the EXISTING user (no email sent/password changed).
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
const env = { ...loadEnv("development", process.cwd(), ""), ...process.env };
if (env.CONFIRM_CLOUD_ADMIN_TEST !== "true")
  throw new Error(
    "Set CONFIRM_CLOUD_ADMIN_TEST=true to authorize one real labelled test order.",
  );
const base = env.ADMIN_TEST_BASE_URL || "http://127.0.0.1:4175";
if (
  !["http://127.0.0.1:4175", "https://sushi-smok-szczecin.vercel.app"].includes(
    base,
  )
)
  throw new Error("Unapproved test origin");
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
  },
};
let browser,
  staff,
  service,
  testOrderId,
  stage = "configuration";
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const marker = "TEST — NIE PRZYGOTOWYWAĆ. ADMIN QA " + randomUUID();
let notificationQA;
try {
  check(
    env.SUPABASE_URL &&
      env.SUPABASE_SECRET_KEY &&
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "ENV incomplete",
  );
  service = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
  staff = createClient(
    env.SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  const anon = createClient(
    env.SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    options,
  );
  if (env.VERIFY_NOTIFICATIONS === "true") {
    const { notificationChecks } =
      await import("./verify-notifications-cloud.mjs");
    notificationQA = notificationChecks({ env, service, base, check });
    stage = "telegram-configuration";
    await notificationQA.config();
  }
  stage = "existing-user";
  const users = await service.auth.admin.listUsers({ page: 1, perPage: 10 });
  check(
    !users.error && users.data.users.length === 1,
    "Expected exactly one existing user",
  );
  const user = users.data.users[0];
  check(user.email, "Existing user email missing");
  const profile = await service
    .from("staff_profiles")
    .select("role,active")
    .eq("user_id", user.id)
    .single();
  check(
    !profile.error && profile.data.role === "admin" && profile.data.active,
    "Admin profile missing",
  );
  stage = "real-auth-session";
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  check(
    !link.error && link.data.properties?.hashed_token,
    "One-time auth token unavailable",
  );
  const auth = await staff.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  check(!auth.error && auth.data.session, "Cloud Auth verification failed");
  const verified = await staff.auth.getUser();
  check(
    !verified.error && verified.data.user.id === user.id,
    "Cloud session user mismatch",
  );
  for (const table of ["orders", "order_items", "staff_profiles"]) {
    const result = await anon.from(table).select("*").limit(1);
    check(
      result.error || result.data?.length === 0,
      "Anonymous read unexpectedly allowed",
    );
  }
  const hashRead = await staff.from("orders").select("receipt_hash").limit(1);
  check(hashRead.error, "Private order hash exposed");
  const settingsResponse = await fetch(env.SUPABASE_URL + "/auth/v1/settings", {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
  });
  const authSettings = await settingsResponse.json();
  console.log(
    JSON.stringify({
      cloudAuth: true,
      authMethod: "one-time-token-existing-user",
      publicSignupDisabled: authSettings.disable_signup === true,
      anonymousReadsDenied: true,
      privateHashesDenied: true,
    }),
  );
  stage = "browser-auth";
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext({ locale: "pl-PL" });
  let runtimeErrors = 0;
  context.on("page", (p) => p.on("pageerror", () => runtimeErrors++));
  const page = await context.newPage();
  await page.goto(base + "/admin/orders");
  await page
    .getByRole("button", { name: "Zaloguj się", exact: true })
    .waitFor();
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Hasło").fill(randomUUID() + randomUUID());
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Nie udało się zalogować" })
    .waitFor();
  // Inject only a genuinely issued staff session into this isolated browser context.
  await page.evaluate(
    (session) =>
      localStorage.setItem("sushi-smok:staff-auth", JSON.stringify(session)),
    auth.data.session,
  );
  await page.goto(base + "/admin/orders");
  await page
    .getByRole("heading", { name: "Zamówienia", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Zamówienia", exact: true })
    .waitFor();
  for (const [path, heading] of [
    ["/admin/menu", "Zarządzaj menu"],
    ["/admin/settings", "Przyjmowanie zamówień"],
  ]) {
    await page.goto(base + path);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    if (path.endsWith("menu")) await page.getByRole("switch").first().waitFor();
    else await page.getByLabel("Przyjmuj zamówienia online").waitFor();
    check((await page.getByRole("alert").count()) === 0, "Admin view error");
  }
  if (notificationQA) {
    stage = "telegram-admin-test-retry";
    await notificationQA.test(page);
  }
  await page.goto(base + "/admin/kitchen");
  await page
    .getByRole("heading", { name: "Na bieżąco.", exact: true })
    .waitFor();
  stage = "guest-checkout";
  const guestContext = await browser.newContext({ locale: "pl-PL" });
  const guest = await guestContext.newPage();
  guest.on("pageerror", () => runtimeErrors++);
  const catalog = await service
    .from("products")
    .select("id,slug,price_grosz")
    .eq("available", true)
    .order("id")
    .limit(2);
  check(
    !catalog.error && catalog.data.length === 2,
    "Two available products required",
  );
  for (const [index, p] of catalog.data.entries()) {
    stage = "guest-add-product-" + index;
    await guest.goto(base + "/menu/danie/" + p.slug);
    if (index === 1)
      await guest
        .locator(".detail-actions")
        .getByRole("button", { name: /Zwiększ/ })
        .click();
    await guest
      .locator(".detail-actions")
      .getByRole("button", { name: /Dodaj do koszyka/ })
      .click();
  }
  stage = "guest-form";
  await guest.goto(base + "/checkout");
  await guest.getByLabel("Imię", { exact: true }).fill("Test integracyjny");
  await guest.getByLabel("Telefon", { exact: true }).fill("500000000");
  await guest.locator("textarea").fill(marker);
  stage = "guest-submit";
  await guest
    .getByRole("button", { name: "Potwierdź zamówienie", exact: true })
    .click();
  await guest
    .locator("h1")
    .filter({ hasText: "Zamówienie zapisane." })
    .waitFor({ timeout: 30000 });
  stage = "guest-cart-cleared";
  check(
    (await guest.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sushi-smok:cart:v1") || "[]").length,
    )) === 0,
    "Cart not cleared after success",
  );
  stage = "guest-database-check";
  const stored = await service
    .from("orders")
    .select("id,number,status,subtotal_grosz,total_grosz")
    .eq("notes", marker)
    .single();
  check(!stored.error, "Order not stored");
  testOrderId = stored.data.id;
  check(stored.data.status === "new", "Wrong initial status");
  const items = await service
    .from("order_items")
    .select("product_id,quantity,unit_price_grosz,line_total_grosz")
    .eq("order_id", testOrderId);
  check(!items.error && items.data.length === 2, "Order items missing");
  const expected = catalog.data.reduce(
    (n, p, i) => n + p.price_grosz * (i + 1),
    0,
  );
  check(
    stored.data.total_grosz === expected &&
      stored.data.subtotal_grosz === expected,
    "Cloud total mismatch",
  );
  for (const [i, p] of catalog.data.entries()) {
    const item = items.data.find((x) => x.product_id === p.id);
    check(
      item?.quantity === i + 1 &&
        item.unit_price_grosz === p.price_grosz &&
        item.line_total_grosz === p.price_grosz * (i + 1),
      "Snapshot mismatch",
    );
  }
  if (notificationQA) {
    stage = "telegram-order-delivery";
    await notificationQA.order(testOrderId, stored.data.number);
  }
  stage = "kitchen-auto-update";
  const card = page.locator(".admin-order").filter({
    has: page.getByRole("button", { name: stored.data.number, exact: true }),
  });
  await card.waitFor({ timeout: 20000 });
  await card.getByText(marker, { exact: false }).waitFor();
  await card.getByRole("button", { name: "Szczegóły zamówienia" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("heading", { name: new RegExp(stored.data.number) })
    .waitFor();
  await dialog.getByText(marker, { exact: false }).waitFor();
  stage = "status-workflow";
  for (const label of ["Przyjmij", "Rozpocznij przygotowanie", "Gotowe"]) {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(700);
  }
  await dialog.getByRole("button", { name: "Zakończ", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
  await dialog.getByRole("button", { name: "Tak, anuluj zamówienie" }).click();
  await page.waitForTimeout(1500);
  const cancelled = await service
    .from("orders")
    .select("status")
    .eq("id", testOrderId)
    .single();
  check(cancelled.data?.status === "cancelled", "Cancellation not persisted");
  await page.keyboard.press("Escape");
  await page.goto(base + "/admin/orders");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("cancelled");
  await page.getByLabel("Numer zamówienia").fill(stored.data.number);
  await page
    .getByRole("button", { name: stored.data.number, exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Zamówienia", exact: true })
    .waitFor();
  stage = "logout";
  await page.getByRole("button", { name: "Wyloguj", exact: true }).click();
  await page
    .getByRole("button", { name: "Zaloguj się", exact: true })
    .waitFor();
  await page.goto(base + "/admin/orders");
  await page
    .getByRole("button", { name: "Zaloguj się", exact: true })
    .waitFor();
  check(runtimeErrors === 0, "Browser runtime errors observed");
  console.log(
    JSON.stringify({
      verified: true,
      orderNumber: stored.data.number,
      items: items.data.length,
      totalGrosz: expected,
      kitchenAutoRefresh: true,
      statuses: ["new", "accepted", "preparing", "ready", "cancelled"],
      menuAndSettingsRead: true,
      refreshAndLogout: true,
      browserRuntimeErrors: runtimeErrors,
      passwordLogin:
        "wrong-password rejection verified; existing password not available",
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      verified: false,
      failedStage: stage,
      details: "Suppressed to protect credentials and customer data",
    }),
  );
  process.exitCode = 1;
} finally {
  // Retain audit rows and only cancel THIS marked test order, including ambiguous submit failures.
  if (service) {
    try {
      const { data, error } = await service
        .from("orders")
        .select("id,status")
        .eq("notes", marker);
      if (error) throw error;
      for (const row of data || []) {
        if (!["cancelled", "delivered"].includes(row.status)) {
          const result = await service
            .from("orders")
            .update({ status: "cancelled" })
            .eq("id", row.id)
            .eq("notes", marker);
          if (result.error) throw result.error;
        }
      }
      console.log("Marked test orders retained; active test orders cancelled.");
    } catch {
      console.error(
        "Test-order cleanup needs review in Supabase; no secrets displayed.",
      );
      process.exitCode = 1;
    }
  }
  try {
    await staff?.auth.signOut({ scope: "local" });
  } catch {}
  await browser?.close();
}
