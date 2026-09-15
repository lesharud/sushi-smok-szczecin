import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function addProduct(page: Page) {
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await page
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .first()
    .click();
}
async function fillCustomer(page: Page) {
  await page.getByLabel("Imię", { exact: true }).fill("Anna");
  await page.getByLabel("Nazwisko", { exact: true }).fill("Kowalska");
  await page.getByLabel("Telefon", { exact: true }).fill("500600700");
  await page.getByLabel("E-mail", { exact: true }).fill("anna@example.com");
}
test("catalog routes, search, real prices and product quantity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/menu");
  await expect(
    page.getByRole("heading", { name: "Zestawy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Kategorie menu" })
    .getByRole("link", { name: "Nigiri", exact: true })
    .click();
  await expect(page.locator(".product-card")).toHaveCount(5);
  await page.getByRole("searchbox").fill("losos");
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("losos");
  await expect(page.locator(".product-card").first()).toContainText("łoso");
  await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
  await expect(page.locator(".product-card")).toHaveCount(5);
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await expect(page.locator(".detail-meta")).toContainText(/37\s*zł/);
  await page
    .getByRole("button", { name: "Zwiększ liczbę: Filadelfia z łososiem" })
    .click();
  await page
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .first()
    .click();
  await expect(page.locator(".shop-toast")).toContainText("Dodano");
  await page.goto("/cart");
  await expect(page.locator("main .cart-items output")).toHaveText("2");
  await expect(page.locator("main .cart-item-end")).toContainText(/74\s*zł/);
  await page.reload();
  await expect(page.locator("main .cart-items output")).toHaveText("2");
  expect(errors).toEqual([]);
});
test("drawer focus, quantity, removal and empty checkout", async ({ page }) => {
  await addProduct(page);
  const open = page.getByRole("button", { name: /Otwórz koszyk/ });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Twój koszyk" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Zwiększ liczbę: Filadelfia z łososiem" })
    .click();
  await expect(dialog.locator("output")).toHaveText("2");
  await dialog
    .getByRole("button", { name: "Zmniejsz liczbę: Filadelfia z łososiem" })
    .click();
  await expect(dialog.locator("output")).toHaveText("1");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest(".cart-sheet"),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await open.click();
  await dialog
    .getByRole("button", { name: "Usuń: Filadelfia z łososiem" })
    .click();
  await expect(dialog).toContainText("Twój koszyk czeka");
  await page.keyboard.press("Escape");
  await page.goto("/checkout");
  await expect(
    page.getByRole("button", { name: /Potwierdź zamówienie/ }),
  ).toHaveCount(0);
});
test("checkout validation, delivery and test receipt persist without personal data in history", async ({
  page,
}) => {
  await addProduct(page);
  await page.goto("/checkout");
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .click();
  await expect(page.locator("#firstName")).toBeFocused();
  await expect(page.locator("#firstName-error")).toBeVisible();
  await fillCustomer(page);
  await page.getByRole("radio", { name: /Dostawa/ }).check();
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .click();
  await expect(page.locator("#street-error")).toBeVisible();
  await page.getByLabel("Ulica", { exact: true }).fill("Testowa");
  await page.getByLabel("Numer domu", { exact: true }).fill("10");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("123");
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .click();
  await expect(page.locator("#postalCode-error")).toContainText("70-781");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("70-781");
  await page.getByLabel(/Rozumiem, że to zamówienie testowe/).check();
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .click();
  await expect(page).toHaveURL(/order-success\//);
  await expect(page.locator("h1")).toContainText("To była próba.");
  await expect(page.locator(".receipt")).toContainText("Anna Kowalska");
  await expect(page.locator(".receipt")).toContainText(
    "Koszt dostawy do potwierdzenia",
  );
  await page.reload();
  await expect(page.locator(".receipt")).toContainText("Anna Kowalska");
  const stored = await page.evaluate(() =>
    localStorage.getItem("sushi-smok:orders:v1"),
  );
  expect(stored).not.toContain("anna@example.com");
  expect(stored).not.toContain("Testowa");
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Twój koszyk czeka na coś dobrego." }),
  ).toBeVisible();
  await page.goto("/account/orders");
  await expect(page.locator(".order-history>a")).toHaveCount(1);
});
test("pickup, remember profile, addresses edit/delete and honest account availability", async ({
  page,
}) => {
  await addProduct(page);
  await page.goto("/checkout");
  await fillCustomer(page);
  await page.getByLabel(/Zapisz moje dane i adres/).check();
  await page.getByLabel(/Rozumiem, że to zamówienie testowe/).check();
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .click();
  await expect(page).toHaveURL(/order-success/);
  await expect(page.locator(".receipt")).toContainText("Odbiór osobisty");
  await page.goto("/account");
  await expect(page.getByLabel("Imię", { exact: true })).toHaveValue("Anna");
  await page.getByRole("button", { name: "Dodaj adres" }).click();
  await page.getByLabel("Nazwa adresu").fill("Biuro");
  await page.getByLabel("Ulica", { exact: true }).fill("Testowa");
  await page.getByLabel("Numer domu", { exact: true }).fill("7");
  await page.getByLabel("Kod pocztowy").fill("70-781");
  await page.getByRole("button", { name: "Zapisz adres", exact: true }).click();
  await expect(page.locator(".address-list")).toContainText("Biuro");
  await page.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.getByLabel("Numer domu", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Zapisz adres", exact: true }).click();
  await expect(page.locator(".address-list")).toContainText("Testowa 8");
  await page.getByRole("button", { name: "Usuń adres: Biuro" }).click();
  await expect(page.locator(".address-list article")).toHaveCount(0);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Konta już wkrótce." }),
  ).toBeVisible();
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Konta już wkrótce." }),
  ).toBeVisible();
});
test("corrupt cart storage is rejected, unknown routes have a recovery path", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "sushi-smok:cart:v1",
      JSON.stringify([
        { productId: "missing", quantity: 2 },
        { productId: "filadelfia-z-lososiem", quantity: -1 },
      ]),
    ),
  );
  await page.goto("/cart");
  await expect(page.locator("main .empty-state")).toBeVisible();
  await page.goto("/menu/danie/no-such-dish");
  await expect(
    page.getByRole("heading", { name: "Nie ma takiej strony." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Odkryj menu" }).click();
  await expect(page).toHaveURL(/\/menu$/);
});
test("responsive shop pages, image loading and accessibility", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await addProduct(page);
    for (const route of [
      "/menu",
      "/menu/danie/filadelfia-z-lososiem",
      "/cart",
      "/checkout",
      "/account",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} overflow ${width}`,
      ).toBe(true);
      if (width === 390 || width === 1440) {
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 20));
          }
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: `test-results/shop-${width}-${route.replaceAll("/", "-")}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.goto("/menu");
  await page.locator(".product-card").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".product-card img")
        .evaluateAll((imgs) =>
          imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  for (const route of [
    "/menu",
    "/menu/danie/filadelfia-z-lososiem",
    "/checkout",
    "/account",
  ]) {
    await page.goto(route);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(scan.violations, route).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("mobile touch order flow and always available actions", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "pl-PL",
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  const add = page
    .locator(".detail-actions")
    .getByRole("button", { name: /Dodaj do koszyka/ });
  await expect(add).toBeInViewport();
  await add.tap();
  await page
    .getByRole("navigation", { name: "Nawigacja mobilna" })
    .getByRole("button", { name: /Koszyk/ })
    .tap();
  const sheet = page.getByRole("dialog", { name: "Twój koszyk" });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: "Zwiększ liczbę: Filadelfia z łososiem" })
    .tap();
  await expect(sheet.locator("output")).toHaveText("2");
  await page.screenshot({ path: "test-results/mobile-cart-sheet.png" });
  await sheet.getByRole("link", { name: "Przejdź do kasy" }).tap();
  await expect(page).toHaveURL(/checkout$/);
  await fillCustomer(page);
  await page.getByLabel(/Rozumiem, że to zamówienie testowe/).check();
  await page
    .getByRole("button", { name: "Potwierdź zamówienie testowe" })
    .tap();
  await expect(page).toHaveURL(/order-success/);
  await expect(page.locator(".receipt")).toContainText(/74\s*zł/);
  await page.screenshot({
    path: "test-results/mobile-success.png",
    fullPage: true,
  });
  await context.close();
});
