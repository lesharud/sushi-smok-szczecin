import { test, expect } from "@playwright/test";

test("short commerce pages fill the viewport without a footer gap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/cart", "/checkout", "/login", "/not-a-real-page"]) {
    await page.goto(route);
    await page.addStyleTag({ content: ":root{--safe-bottom:34px}" });
    await expect(page.locator(".shop-footer")).toHaveCSS("padding-bottom", "132px");
    await expect.poll(async () => {
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      return page.locator(".shop-footer").evaluate(el => Math.abs(el.getBoundingClientRect().bottom - innerHeight));
    }).toBeLessThanOrEqual(1);
    const geometry = await page
      .locator(".shop-footer")
      .evaluate((el) => ({
        bottom: el.getBoundingClientRect().bottom,
        viewport: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
    expect(Math.abs(geometry.bottom - geometry.viewport)).toBeLessThanOrEqual(
      1,
    );
    expect(geometry.overflow).toBe(false);
  }
});

test("mobile page edges stay covered through scrolling, viewport changes and safe areas", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [393, 852],
    [430, 932],
    [360, 800],
    [412, 915],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const fullHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    for (let y = 0; y < fullHeight + height; y += height - 100) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(20);
      const edge = await page.evaluate(() => {
        const header = document.querySelector(".site-header")!;
        return {
          top: header.getBoundingClientRect().top,
          background: getComputedStyle(header).backgroundColor,
          overflow: document.documentElement.scrollWidth > innerWidth,
          padding: getComputedStyle(document.body).paddingBottom,
        };
      });
      expect(edge.top).toBe(0);
      expect(edge.background).toBe("rgb(17, 17, 18)");
      expect(edge.overflow).toBe(false);
      expect(edge.padding).toBe("0px");
    }
    const gap = await page.evaluate(
      () =>
        document.documentElement.scrollHeight -
        (document.querySelector(".site-footer")!.getBoundingClientRect()
          .bottom +
          scrollY),
    );
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    if (width === 390)
      await page.screenshot({
        path: "test-results/prelaunch-mobile-bottom.png",
      });
    await page.setViewportSize({ width, height: height - 70 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(
      await page.evaluate(
        () =>
          document.querySelector(".site-footer")!.getBoundingClientRect()
            .bottom - innerHeight,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.addStyleTag({
    content: ":root{--safe-top:47px;--safe-bottom:34px}",
  });
  expect(
    await page
      .locator(".site-header")
      .evaluate((el) => getComputedStyle(el).paddingTop),
  ).toBe("47px");
  await page.screenshot({ path: "test-results/prelaunch-mobile-top.png" });
  await page.getByRole("button", { name: "Otwórz menu nawigacji" }).click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/menu");
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await page.goBack();
  expect(errors).toEqual([]);
});

test("ultrawide editorial section retains one featured image", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  await expect(page.locator(".editorial-photo img")).toHaveCount(1);
  await expect(page.locator(".editorial-selector button")).toHaveCount(3);
  await expect(page.locator(".editorial-caption a")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#galeria").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator(".editorial-photo img")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(750);
  await page.screenshot({ path: "test-results/prelaunch-editorial.png" });
});
