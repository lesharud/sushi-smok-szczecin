import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { guestApiFixture } from "./guest-api-fixture";
async function addProduct(page: Page) {
  await page.goto("/menu/danie/filadelfia-z-lososiem");
  await page
    .getByRole("button", { name: /Dodaj do koszyka/ })
    .first()
    .click();
}
async function fillCustomer(page: Page) {
  await page.getByLabel("Imię", { exact: true }).fill("Anna");
  await page.getByLabel("Telefon", { exact: true }).fill("500600700");
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
  await guestApiFixture(page);
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
  await page.getByRole("button", { name: "Potwierdź zamówienie" }).tap();
  await expect(page).toHaveURL(/order-success/);
  await expect(page.locator(".receipt")).toContainText(/74\s*zł/);
  await page.screenshot({
    path: "test-results/mobile-success.png",
    fullPage: true,
  });
  await context.close();
});
