import { productById, orderSettings } from "./catalog";
import { readJson, writeJson, removeStored } from "./storage";
import type {
  CartLine,
  CheckoutInput,
  Order,
  OrderItem,
  SavedProfile,
} from "./types";
export const PROFILE_KEY = "sushi-smok:profile:v1";
const ORDERS_KEY = "sushi-smok:orders:v1";
const SESSION_KEY = "sushi-smok:last-order:v1";
const memoryOrders = new Map<string, Order>();
export const blankProfile: SavedProfile = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  addresses: [],
};
export function readProfile(): SavedProfile {
  const value = readJson<unknown>(PROFILE_KEY, null);
  if (!value || typeof value !== "object") return blankProfile;
  const p = value as SavedProfile;
  if (
    ![p.firstName, p.lastName, p.phone, p.email].every(
      (v) => typeof v === "string",
    ) ||
    !Array.isArray(p.addresses)
  )
    return blankProfile;
  return {
    ...p,
    addresses: p.addresses.filter(
      (a) =>
        a &&
        [
          a.id,
          a.label,
          a.street,
          a.building,
          a.apartment,
          a.postalCode,
          a.city,
        ].every((v) => typeof v === "string"),
    ),
  };
}
export function listLocalOrders(): Order[] {
  const value = readJson<unknown>(ORDERS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (x): x is Order =>
      !!x &&
      typeof x.id === "string" &&
      typeof x.number === "string" &&
      x.status === "demo" &&
      Array.isArray(x.items) &&
      x.items.every(
        (i: OrderItem) =>
          i &&
          typeof i.name === "string" &&
          Number.isSafeInteger(i.quantity) &&
          Number.isSafeInteger(i.unitPriceGrosz),
      ) &&
      Number.isSafeInteger(x.subtotalGrosz),
  );
}
export function getLocalOrder(id: string): Order | undefined {
  const session = readJson<Order | null>(SESSION_KEY, null, true);
  return (
    memoryOrders.get(id) ||
    (session?.id === id ? session : listLocalOrders().find((o) => o.id === id))
  );
}
export function clearLocalOrders() {
  memoryOrders.clear();
  removeStored(ORDERS_KEY);
  removeStored(SESSION_KEY, true);
}
export interface OrderRepository {
  submit(
    lines: CartLine[],
    input: CheckoutInput,
    idempotencyKey: string,
  ): Promise<Order>;
}
/** Demo adapter only. A live adapter MUST re-price and validate stock/fees on the server. */
export const orderRepository: OrderRepository = {
  async submit(lines, input, idempotencyKey) {
    const existing = getLocalOrder(idempotencyKey);
    if (existing) return existing;
    if (!lines.length) throw new Error("Koszyk jest pusty.");
    if (
      !Object.values(input.customer).every(
        (value) => typeof value === "string" && value.trim(),
      ) ||
      (input.fulfillment === "delivery" &&
        (!input.address ||
          ![
            input.address.street,
            input.address.building,
            input.address.postalCode,
            input.address.city,
          ].every((value) => value.trim())))
    )
      throw new Error("Uzupełnij dane zamówienia.");
    const items = lines.map((line) => {
      const p = productById.get(line.productId);
      if (
        !p ||
        !p.available ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 99
      )
        throw new Error(
          "Zawartość koszyka uległa zmianie. Sprawdź wybrane dania.",
        );
      return {
        productId: p.id,
        name: p.name,
        quantity: line.quantity,
        unitPriceGrosz: p.priceGrosz,
        image: p.image,
      };
    });
    const subtotal = items.reduce(
      (sum, item) => sum + item.unitPriceGrosz * item.quantity,
      0,
    );
    const fee =
      input.fulfillment === "pickup" ? 0 : orderSettings.deliveryFeeGrosz;
    const order: Order = {
      id: idempotencyKey,
      number: `TEST-${idempotencyKey.slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      status: "demo",
      items,
      subtotalGrosz: subtotal,
      deliveryFeeGrosz: fee,
      totalGrosz: fee === null ? null : subtotal + fee,
      customer: input.customer,
      address: input.fulfillment === "delivery" ? input.address : null,
      fulfillment: input.fulfillment,
      payment: input.payment,
      notes: input.notes,
      preferredTime: input.preferredTime,
    };
    memoryOrders.set(order.id, order);
    writeJson(SESSION_KEY, order, true);
    // Persist only an anonymous receipt unless the customer explicitly opts in.
    const historyOrder = input.remember
      ? order
      : { ...order, customer: null, address: null, notes: "" };
    writeJson(ORDERS_KEY, [historyOrder, ...listLocalOrders()].slice(0, 50));
    if (input.remember) {
      const previous = readProfile();
      const addresses =
        input.address && input.fulfillment === "delivery"
          ? [
              input.address,
              ...previous.addresses.filter(
                (a) =>
                  a.street !== input.address!.street ||
                  a.building !== input.address!.building,
              ),
            ].slice(0, 5)
          : previous.addresses;
      writeJson(PROFILE_KEY, { ...input.customer, addresses });
    }
    return order;
  },
};
