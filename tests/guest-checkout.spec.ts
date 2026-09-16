import { test, expect } from "@playwright/test";
import { guestApiFixture } from "./guest-api-fixture";

test("guest checkout validates, handles uncertain network retry, preserves key and clears cart only after server success", async ({
  page,
}) => {
  const fixture = await guestApiFixture(page, { failOnce: true, delay: 350 });
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .click();
  await page.goto("/menu/danie/double-shrimp");
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: /Zwiększ/ })
    .click();
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .click();
  await page.goto("/checkout");
  const submit = page.getByRole("button", {
    name: "Potwierdź zamówienie",
    exact: true,
  });
  await submit.click();
  await expect(page.getByText("Podaj swoje imię.")).toBeVisible();
  expect(fixture.requests).toHaveLength(0);
  await page.getByLabel("Imię", { exact: true }).fill("Anna");
  await page.getByLabel("Telefon", { exact: true }).fill("123");
  await submit.click();
  await expect(
    page.getByText("Podaj poprawny numer telefonu (9–15 cyfr)."),
  ).toBeVisible();
  await page.getByLabel("Telefon", { exact: true }).fill("500600700");
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByRole("button", { name: /Wysyłanie/ })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się sprawdzić",
  );
  expect(fixture.requests).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sushi-smok:cart:v1") || "[]").length,
    ),
  ).toBe(2);
  await expect(page.getByLabel("Imię", { exact: true })).toHaveValue("Anna");
  await page.reload();
  await expect(page.getByLabel("Imię", { exact: true })).toHaveValue("Anna");
  await page.getByRole("button", { name: "Ponów wysłanie zamówienia" }).click();
  await expect(page.locator("h1")).toContainText("Zamówienie zapisane.");
  await expect(page.locator("main")).toContainText("SMOK-100001");
  expect(fixture.requests).toHaveLength(2);
  expect(fixture.requests[0]).toEqual(fixture.requests[1]);
  expect(fixture.orders.size).toBe(1);
  const sent = fixture.requests[0].body;
  expect(Object.keys(sent).sort()).toEqual(
    [
      "address",
      "customer",
      "fulfillment",
      "items",
      "notes",
      "preferredTime",
    ].sort(),
  );
  expect(Object.keys(sent.items[0]).sort()).toEqual(["productId", "quantity"]);
  expect(sent.customer).toEqual({ name: "Anna", phone: "500600700" });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sushi-smok:cart:v1") || "[]"),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("sushi-smok:checkout-attempt:v2"),
    ),
  ).toBeNull();
  await page.reload();
  await expect(page.locator("main")).toContainText("SMOK-100001");
});
test("delivery fee, required address, and removed customer accounts", async ({
  page,
}) => {
  const fixture = await guestApiFixture(page, { delivery: true });
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .click();
  await page.goto("/checkout");
  await page.getByLabel("Imię", { exact: true }).fill("Anna");
  await page.getByLabel("Telefon", { exact: true }).fill("500600700");
  await page.getByRole("radio", { name: /Dostawa/ }).check();
  await page
    .getByRole("button", { name: "Potwierdź zamówienie", exact: true })
    .click();
  expect(fixture.requests).toHaveLength(0);
  await page.getByLabel("Ulica", { exact: true }).fill("Testowa");
  await page.getByLabel("Numer domu", { exact: true }).fill("1");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("70-781");
  await page
    .getByRole("button", { name: "Potwierdź zamówienie", exact: true })
    .click();
  await expect(page.locator(".receipt")).toContainText(/49,5\s*zł/);
  for (const route of ["/login", "/register", "/account", "/account/orders"]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Nie ma takiej strony." }),
    ).toBeVisible();
  }
  await expect(
    page.locator('a[href="/account"],a[href="/login"],a[href="/register"]'),
  ).toHaveCount(0);
});
test("definitive server rejection leaves cart and input editable", async ({
  page,
}) => {
  await guestApiFixture(page);
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: "PRODUCT_UNAVAILABLE",
          message: "Niektóre dania nie są już dostępne. Sprawdź koszyk.",
        },
      },
    }),
  );
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await page
    .locator(".detail-actions")
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .click();
  await page.goto("/checkout");
  await page.getByLabel("Imię", { exact: true }).fill("Anna");
  await page.getByLabel("Telefon", { exact: true }).fill("500600700");
  await page
    .getByRole("button", { name: "Potwierdź zamówienie", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("nie są już dostępne");
  await expect(page.getByLabel("Imię", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Imię", { exact: true })).toHaveValue("Anna");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sushi-smok:cart:v1") || "[]").length,
    ),
  ).toBe(1);
});
