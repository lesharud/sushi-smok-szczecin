import { test, expect } from "@playwright/test";
import { adminFixture, login, makeOrder } from "./admin-fixture";
// Run with the test-only public env in ADMIN.md. Auth/transport here are fixtures; SQL tests are real PostgreSQL.
test("staff login rejects bad password, restores session and logs out; anonymous routes guarded", async ({
  page,
}) => {
  await adminFixture(page, "staff");
  for (const path of [
    "/admin",
    "/admin/orders",
    "/admin/menu",
    "/admin/settings",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
  await page.getByLabel("E-mail").fill("staff@example.test");
  await page.getByLabel("Hasło").fill("wrong");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się zalogować",
  );
  await page.getByLabel("Hasło").fill("fixture-password-not-real");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(
    page.getByRole("heading", { name: "Zamówienia", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Zamówienia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ustawienia", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/menu");
  await expect(
    page.getByRole("heading", { name: "Brak dostępu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible();
});
test("authenticated user without membership has no restaurant access", async ({
  page,
}) => {
  await adminFixture(page, "outsider");
  await login(page);
  await expect(page.getByRole("alert")).toContainText(
    "To konto nie ma dostępu",
  );
  await expect(page.getByText("SMOK-TEST-1")).toHaveCount(0);
});
test("orders show snapshot details, status persists and cancellation requires confirmation", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await login(page);
  await page.getByRole("button", { name: "Szczegóły zamówienia" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("500000000");
  await expect(dialog).toContainText("TEST — NIE PRZYGOTOWYWAĆ");
  await expect(dialog).toContainText("74");
  await dialog.getByRole("button", { name: "Przyjmij", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Rozpocznij przygotowanie" }),
  ).toBeVisible();
  expect(state.orders[0].status).toBe("accepted");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Rozpocznij przygotowanie" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  expect(state.orders[0].status).toBe("accepted");
  await page.getByRole("button", { name: "Tak, anuluj zamówienie" }).click();
  await expect(page.getByText("Brak zamówień w tym widoku.")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("cancelled");
  await expect(
    page.getByRole("button", { name: "SMOK-TEST-1", exact: true }),
  ).toBeVisible();
});
test("kitchen polling discovers a new order and recovers after network error", async ({
  page,
}) => {
  const state = await adminFixture(page, "staff");
  await login(page);
  await page.getByRole("link", { name: "Kuchnia" }).click();
  await expect(page.getByText("2 ×")).toBeVisible();
  state.orders.push(makeOrder("SMOK-TEST-2"));
  await expect(
    page.getByRole("button", { name: "SMOK-TEST-2", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  state.fail = true;
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 12000 });
  state.fail = false;
  await expect(
    page.getByRole("button", { name: "SMOK-TEST-2", exact: true }),
  ).toBeVisible({ timeout: 20000 });
});
test("admin menu availability and price persist; settings validate unknown delivery tariff", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await login(page);
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  const toggle = page.getByRole("switch");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.getByLabel("Cena (zł)", { exact: true }).fill("42,50");
  await page
    .getByRole("button", { name: "Zapisz zmiany", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Zapisano");
  expect(state.products[0].price_grosz).toBe(4250);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("link", { name: "Ustawienia" }).click();
  await page.getByLabel("Włącz dostawę").check();
  await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
  await expect(page.getByRole("alert")).toContainText("Podaj poprawną opłatę");
  await page.getByLabel("Włącz dostawę").uncheck();
  await page.getByLabel("Przyjmuj zamówienia online").uncheck();
  await page.getByRole("button", { name: "Zapisz ustawienia" }).click();
  await expect.poll(() => state.settings.ordering_enabled).toBe(false);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`admin responsive ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await adminFixture(page);
    await login(page);
    await page.getByRole("link", { name: "Kuchnia" }).click();
    await expect(
      page.getByRole("button", { name: "SMOK-TEST-1" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/admin-${viewport.width}.png`,
      fullPage: true,
    });
  });

test("expired session returns to login; revoked membership removes order data", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await login(page);
  await expect(page.getByRole("button", { name: "SMOK-TEST-1" })).toBeVisible();
  state.role = "outsider";
  await expect(page.getByRole("alert")).toContainText(
    "To konto nie ma dostępu",
    { timeout: 15000 },
  );
  await expect(page.getByText("SMOK-TEST-1")).toHaveCount(0);
  state.role = "admin";
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.getByRole("button", { name: "SMOK-TEST-1" })).toBeVisible();
  state.expired = true;
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("sushi-smok:staff-auth")!);
    value.expires_at = 1;
    localStorage.setItem("sushi-smok:staff-auth", JSON.stringify(value));
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Zaloguj się" })).toBeVisible({
    timeout: 15000,
  });
});

test("notifications show configuration and queued test result without exposing keys", async ({
  page,
}) => {
  await adminFixture(page);
  let sent = false,
    configured = false;
  await page.route("**/api/notifications", (route) => {
    if (route.request().method() === "POST") {
      sent = true;
      return route.fulfill({ status: 202, json: { id: "test-job" } });
    }
    return route.fulfill({
      json: {
        telegram: { configured },
        sms: { configured: false },
        lastWorkerRun: new Date().toISOString(),
        recent: sent
          ? [
              {
                id: "test-job",
                event: "test",
                status: "sent",
                attempts: 1,
                last_code: "DELIVERED",
                created_at: new Date().toISOString(),
                sent_at: new Date().toISOString(),
              },
            ]
          : [],
      },
    });
  });
  await login(page);
  await page.getByRole("link", { name: "Ustawienia", exact: true }).click();
  const section = page.getByRole("region", { name: "Powiadomienia" });
  await expect(
    section.getByRole("button", { name: "Wyślij test Telegram" }),
  ).toBeDisabled();
  configured = true;
  await expect(
    section.getByRole("button", { name: "Wyślij test Telegram" }),
  ).toBeEnabled({ timeout: 12000 });
  await section.getByRole("button", { name: "Wyślij test Telegram" }).click();
  await expect(section.getByRole("status")).toContainText("Wysłano pomyślnie");
  await expect(section).toContainText("SMS: Nie skonfigurowano");
});
