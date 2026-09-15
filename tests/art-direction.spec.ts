import { test, expect } from "@playwright/test";

test("compact header and two-card desktop carousel stay composed at target sizes", async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const width of [1440, 1536, 1920, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1300);
    const header = page.locator(".site-header");
    const originalHeight = (await header.boundingBox())!.height;
    await page
      .locator(".hero")
      .screenshot({ path: `test-results/polish-${width}-hero.png` });
    await page.evaluate(() =>
      window.scrollTo({ top: 400, behavior: "instant" }),
    );
    await expect(header).toHaveClass(/is-scrolled/);
    await expect
      .poll(async () => (await header.boundingBox())!.height)
      .toBeLessThanOrEqual(originalHeight * 0.8);
    await expect(header).toHaveCSS("animation-name", "none");
    await expect(page.locator(".header-cart")).toBeInViewport();
    await header.screenshot({
      path: `test-results/polish-${width}-header.png`,
    });
    const rail = page.locator(".sharing-rail");
    await rail.scrollIntoViewIfNeeded();
    await page.waitForTimeout(550);
    if (width > 1050) {
      const visibleWidths = () =>
        rail.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return Array.from(el.children)
            .map((card) => {
              const box = card.getBoundingClientRect();
              return {
                width: box.width,
                visible: Math.max(
                  0,
                  Math.min(box.right, bounds.right) -
                    Math.max(box.left, bounds.left),
                ),
              };
            })
            .filter((card) => card.visible > 1);
        });
      let cards = await visibleWidths();
      expect(cards).toHaveLength(2);
      expect(
        cards.every((card) => Math.abs(card.width - card.visible) < 1),
      ).toBe(true);
      const step = await rail.evaluate(
        (el) =>
          (el.firstElementChild as HTMLElement).offsetWidth +
          parseFloat(getComputedStyle(el).columnGap),
      );
      await page
        .getByRole("button", { name: "Następne zestawy", exact: true })
        .click();
      await expect
        .poll(() => rail.evaluate((el) => el.scrollLeft))
        .toBeGreaterThanOrEqual(step - 1);
      await page.waitForTimeout(150);
      cards = await visibleWidths();
      expect(cards).toHaveLength(2);
      expect(
        cards.every((card) => Math.abs(card.width - card.visible) < 1),
      ).toBe(true);
    }
    await page
      .locator(".sharing-section")
      .screenshot({ path: `test-results/polish-${width}-sets.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(header).not.toHaveClass(/is-scrolled/);
    await expect
      .poll(async () => (await header.boundingBox())!.height)
      .toBe(originalHeight);
  }
});

test("directional transitions keep content synchronized and ignore conflicting input", async ({
  page,
}) => {
  await page.goto("/");
  const stage = page.locator(".editorial-stage");
  const next = page.getByRole("button", {
    name: "Następne zdjęcie w galerii",
    exact: true,
  });
  await stage.scrollIntoViewIfNeeded();
  const original = await stage.locator("img").getAttribute("src");
  const before = await stage.boundingBox();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(stage).toHaveAttribute("data-phase", "out");
  await expect(stage.locator("img")).toHaveAttribute("src", original!);
  await next.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await expect(stage.locator("img")).not.toHaveAttribute("src", original!);
  await expect(page.locator(".editorial-controls > span")).toContainText("02");
  expect(
    Math.abs((await stage.boundingBox())!.height - before!.height),
  ).toBeLessThan(1);
  await page
    .getByRole("button", { name: "Poprzednie zdjęcie w galerii", exact: true })
    .click();
  await expect(stage).toHaveAttribute("data-direction", "previous");
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await expect(stage.locator("img")).toHaveAttribute("src", original!);

  await page.locator(".editorial-photo").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".lightbox-content")).toHaveAttribute(
    "data-phase",
    "out",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await expect(page.locator(".lightbox")).not.toBeVisible();
  await expect(page.locator(".editorial-photo")).toBeFocused();
});

test("wide desktop and phone compositions stay stable through all menu pages", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 412, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const section = page.locator("#menu");
    await section.scrollIntoViewIfNeeded();
    const heights: number[] = [];
    const next = page.getByRole("button", {
      name: "Następne dania",
      exact: true,
    });
    do {
      await expect(section.locator(".discovery-content")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      heights.push((await section.boundingBox())!.height);
      if (await next.isDisabled()) break;
      await next.click();
    } while (heights.length < 10);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const selector of [
      ".hero",
      "#menu",
      ".sharing-section",
      ".story-section",
      "#galeria",
      ".site-footer",
    ]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/art-${width}-${selector.replace(/[.#]/g, "")}.png`,
      });
    }
  }
});
