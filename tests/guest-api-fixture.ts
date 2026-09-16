// Browser contract fixtures only. Production code always calls the server/Supabase.
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Product } from "../src/shop/types";
const catalog = JSON.parse(
  readFileSync(new URL("../src/shop/catalog.json", import.meta.url), "utf8"),
) as { products: Product[] };
export async function guestApiFixture(
  page: Page,
  options: { failOnce?: boolean; delivery?: boolean; delay?: number } = {},
) {
  const requests: { key: string; token: string; body: Record<string, any> }[] =
    [];
  const orders = new Map<string, unknown>();
  await page.route("**/api/order-settings", (route) =>
    route.fulfill({
      json: {
        orderingEnabled: true,
        deliveryEnabled: !!options.delivery,
        deliveryFeeGrosz: options.delivery ? 1250 : null,
      },
    }),
  );
  await page.route("**/api/orders", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const key = request.headers()["idempotency-key"];
    const token = request.headers()["x-receipt-token"];
    requests.push({ key, token, body });
    if (options.delay)
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    if (options.failOnce && requests.length === 1) {
      await route.abort("failed");
      return;
    }
    const items = body.items.map(
      (item: { productId: string; quantity: number }) => {
        const p = catalog.products.find((p) => p.id === item.productId)!;
        return {
          productId: p.id,
          name: p.name,
          quantity: item.quantity,
          unitPriceGrosz: p.priceGrosz,
          lineTotalGrosz: p.priceGrosz * item.quantity,
          image: p.image,
        };
      },
    );
    const subtotal = items.reduce(
      (sum: number, item: { lineTotalGrosz: number }) =>
        sum + item.lineTotalGrosz,
      0,
    );
    const fee = body.fulfillment === "delivery" ? 1250 : 0;
    const order = orders.get(key) || {
      id: "server-order-id",
      number: "SMOK-100001",
      status: "new",
      createdAt: new Date().toISOString(),
      items,
      subtotalGrosz: subtotal,
      deliveryFeeGrosz: fee,
      totalGrosz: subtotal + fee,
      fulfillment: body.fulfillment,
    };
    orders.set(key, order);
    await route.fulfill({ status: 201, json: { order } });
  });
  await page.route("**/api/order-receipt", (route) => {
    const order = orders.get(route.request().headers()["idempotency-key"]);
    return route.fulfill({
      status: order ? 200 : 404,
      json: order
        ? { order }
        : {
            error: {
              code: "NOT_FOUND",
              message: "Nie znaleźliśmy tego potwierdzenia.",
            },
          },
    });
  });
  return { requests, orders };
}
