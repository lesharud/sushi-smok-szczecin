export class RequestError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export type GuestRequest = {
  items: { productId: string; quantity: number }[];
  customer: { name: string; phone: string };
  fulfillment: "pickup" | "delivery";
  address: {
    street: string;
    building: string;
    apartment: string;
    postalCode: string;
    city: string;
  } | null;
  notes: string;
  preferredTime: string | null;
};
function record(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestError("INVALID_REQUEST");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key)))
    throw new RequestError("INVALID_REQUEST");
  return result;
}
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string") throw new RequestError("INVALID_REQUEST");
  const result = value.trim();
  if (
    result.length < min ||
    result.length > max ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(result)
  )
    throw new RequestError("INVALID_REQUEST");
  return result;
}
export function validateGuestRequest(value: unknown): GuestRequest {
  const r = record(value, [
    "items",
    "customer",
    "fulfillment",
    "address",
    "notes",
    "preferredTime",
  ]);
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > 50)
    throw new RequestError("INVALID_ITEMS");
  const seen = new Set<string>();
  let count = 0;
  const items = r.items
    .map((value) => {
      const item = record(value, ["productId", "quantity"]);
      const productId = text(item.productId, 1, 150);
      const quantity = item.quantity;
      if (
        !/^[a-z0-9-]+$/.test(productId) ||
        !Number.isInteger(quantity) ||
        typeof quantity !== "number" ||
        quantity < 1 ||
        quantity > 99 ||
        seen.has(productId)
      )
        throw new RequestError("INVALID_ITEMS");
      seen.add(productId);
      count += quantity;
      return { productId, quantity };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));
  if (count > 200) throw new RequestError("INVALID_ITEMS");
  const c = record(r.customer, ["name", "phone"]);
  const name = text(c.name, 2, 100);
  if (!/\p{L}/u.test(name)) throw new RequestError("INVALID_CUSTOMER");
  const rawPhone = text(c.phone, 9, 24);
  if (!/^\+?[\d ()-]+$/.test(rawPhone)) throw new RequestError("INVALID_PHONE");
  const phone = rawPhone.replace(/[ ()-]/g, "");
  if (!/^\+?\d{9,15}$/.test(phone)) throw new RequestError("INVALID_PHONE");
  if (r.fulfillment !== "pickup" && r.fulfillment !== "delivery")
    throw new RequestError("INVALID_REQUEST");
  let address: GuestRequest["address"] = null;
  if (r.fulfillment === "delivery") {
    const a = record(r.address, [
      "street",
      "building",
      "apartment",
      "postalCode",
      "city",
    ]);
    address = {
      street: text(a.street, 2, 150),
      building: text(a.building, 1, 30),
      apartment: text(a.apartment ?? "", 0, 30),
      postalCode: text(a.postalCode, 6, 6),
      city: text(a.city, 2, 100),
    };
    if (!/^\d{2}-\d{3}$/.test(address.postalCode))
      throw new RequestError("INVALID_ADDRESS");
  } else if (r.address != null) throw new RequestError("INVALID_ADDRESS");
  const preferredTime =
    r.preferredTime == null ? null : text(r.preferredTime, 20, 30);
  if (
    preferredTime &&
    (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(preferredTime) ||
      !Number.isFinite(Date.parse(preferredTime)))
  )
    throw new RequestError("INVALID_TIME");
  return {
    items,
    customer: { name, phone },
    fulfillment: r.fulfillment,
    address,
    notes: text(r.notes ?? "", 0, 1000),
    preferredTime,
  };
}
export function credentials(request: Request) {
  const key = request.headers.get("Idempotency-Key") || "";
  const token = request.headers.get("X-Receipt-Token") || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    ) ||
    !/^[0-9a-f]{64}$/.test(token)
  )
    throw new RequestError("INVALID_REQUEST");
  return { key, token };
}
