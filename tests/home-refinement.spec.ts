import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("home discovery categories, pagination, links and both add buttons", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.locator("#menu");
  await expect(
    section
      .getByRole("group", { name: "Kategorie w naszym menu" })
      .getByRole("button", { name: /Filadelfia/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const old = await section.locator("h3").allTextContents();
  await section.getByRole("button", { name: "Następne dania" }).click();
  await expect
    .poll(() => section.locator("h3").allTextContents())
    .not.toEqual(old);
  await expect(section.locator(".discovery-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await section
    .getByRole("button", { name: /Dodaj do koszyka:/ })
    .first()
    .click();
  await expect(page.locator(".header-cart")).toHaveAttribute(
    "aria-label",
    /1$/,
  );
  await expect(section.locator(".home-add").first()).toHaveText("Dodano");
  await section.getByRole("button", { name: "Poprzednie dania" }).click();
  await section.locator(".home-product-photo").first().click();
  await expect(page).toHaveURL(/menu\/danie\//);
  await page.goBack();
  await page.locator(".sharing-rail .home-add").first().click();
  await expect(page.locator(".header-cart")).toHaveAttribute(
    "aria-label",
    /2$/,
  );
  await page
    .locator(".sharing-section")
    .getByRole("link", { name: "Wszystkie zestawy" })
    .click();
  await expect(page).toHaveURL(/menu\/kategoria\/zestawy$/);
  await page.goBack();
  await page
    .getByRole("link", { name: "Zobacz pełne menu", exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu$/);
});
test("home visual rhythm at phone, tablet, laptop, desktop; gallery touch and reduced motion", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const selector of ["#menu", ".sharing-section", "#galeria"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/refinement-${width}-${selector.replace(/[.#]/g, "")}.png`,
      });
    }
    if (width === 390 || width === 1440) {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `test-results/refinement-full-${width}.png`,
        fullPage: true,
      });
    }
  }
  const photo = page.locator(".editorial-photo");
  await photo.evaluate((el) => {
    const first = new Touch({
      identifier: 1,
      target: el,
      clientX: 250,
      clientY: 100,
    });
    el.dispatchEvent(
      new TouchEvent("touchstart", { bubbles: true, touches: [first] }),
    );
    const last = new Touch({
      identifier: 1,
      target: el,
      clientX: 100,
      clientY: 102,
    });
    el.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, changedTouches: [last] }),
    );
  });
  await expect(page.locator(".editorial-controls")).toContainText("02");
  await expect(page.locator(".editorial-photo img")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  const rail = page.locator(".sharing-rail");
  await page.getByRole("button", { name: "Następne zestawy" }).click();
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
});
