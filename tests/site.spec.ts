import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Polish page loads without runtime errors; layouts and images fit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "SUSHI SMOK",
  );
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    });
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `Overflow at ${width}px`,
    ).toBe(true);
  }
  await page.locator(".sharing-rail").scrollIntoViewIfNeeded();
  await page.locator(".sharing-rail").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect
    .poll(() =>
      page
        .locator("main img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("menu filters, gallery keyboard navigation and focus restoration", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("group", { name: "Kategorie w naszym menu" })
    .getByRole("button", { name: /Zestawy/ })
    .click();
  await expect(page.locator(".discovery-grid .home-product")).toHaveCount(2);
  await expect(page.locator(".discovery-grid")).toContainText("Maki Set");
  await page
    .getByRole("group", { name: "Kategorie w naszym menu" })
    .getByRole("button", { name: /Smok/ })
    .click();
  await expect(page.locator(".discovery-grid")).toContainText(
    "Pomarańczowy smok",
  );
  const first = page.locator(".editorial-photo");
  await first.click();
  await expect(
    page.getByRole("dialog", { name: "Galeria zdjęć sushi" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".lightbox-toolbar p")).toContainText("2 / 3");
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).not.toBeVisible();
  await expect(first).toBeFocused();
});

test("mobile menu traps focus, closes by link/Escape and unlocks scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Otwórz menu nawigacji" });
  await toggle.click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("#mobile-menu"),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page
    .getByRole("navigation", { name: "Nawigacja główna" })
    .getByRole("link", { name: "Kontakt" })
    .click();
  await expect(page.locator("#mobile-menu")).not.toBeVisible();
  await expect(page).toHaveURL(/#kontakt$/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await toggle.click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("WCAG accessibility scan on desktop and mobile menu", async ({ page }) => {
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const desktop = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(desktop.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Otwórz menu nawigacji" }).click();
  const mobile = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(mobile.violations).toEqual([]);
});

test("screenshots and valid navigation targets", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
    await page.screenshot({ path: `test-results/${name}-hero.png` });
  }
  const broken = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links
        .filter(
          (link) =>
            !document.getElementById(link.getAttribute("href")!.slice(1)),
        )
        .map((link) => link.getAttribute("href")),
    );
  expect(broken).toEqual([]);
  for (const href of await page
    .locator('a[target="_blank"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href"))))
    expect(href).toMatch(
      /^https:\/\/(wolt.com|www.pyszne.pl|www.instagram.com|www.google.com)\//,
    );
});

test("production content is available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#kontakt h2")).toBeVisible();
  await context.close();
});

test("fullscreen navigation works on desktop and small mobile with reverse focus order", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small-mobile", 320, 568],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Otwórz menu nawigacji" });
    await trigger.click();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    for (let step = 0; step < 16; step++) {
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest("#mobile-menu"),
        ),
      ).toBe(true);
    }
    await page
      .locator("#mobile-menu")
      .evaluate((element) => (element.scrollTop = 0));
    await page.screenshot({ path: `test-results/${name}-navigation.png` });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await page.locator("#menu").scrollIntoViewIfNeeded();
    await expect(page.locator(".site-header")).toHaveClass(/is-scrolled/);
    await expect(trigger).toBeInViewport();
  }
});

test("editorial gallery has one image, explicit selection and bounded controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const previous = page.getByRole("button", {
    name: "Poprzednie zdjęcie w galerii",
  });
  const next = page.getByRole("button", { name: "Następne zdjęcie w galerii" });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.locator(".editorial-controls")).toContainText("02");
  await next.click();
  await expect(next).toBeDisabled();
  await expect(page.locator(".editorial-photo img")).toHaveCount(1);
  await page.locator(".editorial-photo").click();
  await expect(page.locator(".lightbox-toolbar p")).toContainText("3 / 3");
  await page.keyboard.press("Escape");
  await previous.click();
  await previous.click();
  await expect(previous).toBeDisabled();
  await page
    .getByRole("group", { name: "Wybierz zdjęcie w galerii" })
    .getByRole("button", { name: /Chwila dla siebie/ })
    .click();
  await expect(page.locator(".editorial-caption")).toContainText(
    "Chwila dla siebie",
  );
  await expect(page.locator(".editorial-caption")).not.toContainText("zł");
  await page.locator(".editorial-order").click();
  await expect(page).toHaveURL(/\/menu$/);
});
