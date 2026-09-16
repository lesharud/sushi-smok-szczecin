import { readJson, writeJson, removeStored } from "./storage";
import type { CartLine, CheckoutInput, Order } from "./types";

const PENDING_KEY = "sushi-smok:checkout-attempt:v2";
const RECEIPT_KEY = "sushi-smok:receipt:v2";
type Attempt = {
  key: string;
  token: string;
  request: CheckoutInput & { items: CartLine[] };
  createdAt: number;
};
let pendingMemory: Attempt | null = null;
let receiptMemory: { key: string; token: string } | null = null;
export class OrderError extends Error {
  constructor(
    message: string,
    public code: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function pendingAttempt(): Attempt | null {
  const value =
    pendingMemory || readJson<Attempt | null>(PENDING_KEY, null, true);
  if (
    !value ||
    typeof value.key !== "string" ||
    typeof value.token !== "string" ||
    !value.request?.customer ||
    !Array.isArray(value.request.items)
  )
    return null;
  return value;
}
function receiptCredentials(key: string) {
  const pending = pendingAttempt();
  const receipt =
    receiptMemory ||
    readJson<{ key: string; token: string } | null>(RECEIPT_KEY, null, true);
  return pending?.key === key ? pending : receipt?.key === key ? receipt : null;
}
async function api(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch {
    throw new OrderError(
      "Nie udało się sprawdzić wyniku wysyłki. Ponów próbę — ten sam numer próby chroni przed podwójnym zamówieniem.",
      "NETWORK_ERROR",
      true,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new OrderError(
      "Serwer zamówień jest chwilowo niedostępny. Spróbuj ponownie.",
      "SERVER_ERROR",
      true,
    );
  }
  if (!response.ok)
    throw new OrderError(
      data.error?.message ||
        "Nie udało się zapisać zamówienia. Spróbuj ponownie.",
      data.error?.code || "SERVER_ERROR",
      response.status >= 500 || response.status === 408,
    );
  return data;
}
export async function orderSettings() {
  return (await api("/api/order-settings", {})) as {
    orderingEnabled: boolean;
    deliveryEnabled: boolean;
    deliveryFeeGrosz: number | null;
  };
}
export async function getOrder(key: string): Promise<Order> {
  const credentials = receiptCredentials(key);
  if (!credentials)
    throw new OrderError(
      "To potwierdzenie jest dostępne tylko w przeglądarce, w której wysłano zamówienie.",
      "NOT_FOUND",
    );
  const data = await api("/api/order-receipt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "X-Receipt-Token": credentials.token,
    },
    body: "{}",
  });
  return data.order;
}
export function finishAttempt() {
  const attempt = pendingAttempt();
  if (attempt) {
    receiptMemory = { key: attempt.key, token: attempt.token };
    writeJson(RECEIPT_KEY, receiptMemory, true);
  }
  pendingMemory = null;
  removeStored(PENDING_KEY, true);
}
export const orderRepository = {
  async submit(
    lines: CartLine[],
    input: CheckoutInput,
  ): Promise<{ order: Order; key: string; submitted: CartLine[] }> {
    let attempt = pendingAttempt();
    if (!attempt) {
      const token = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      attempt = {
        key: crypto.randomUUID(),
        token,
        request: {
          ...input,
          items: lines.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
        createdAt: Date.now(),
      };
      pendingMemory = attempt;
      // Only an in-flight request is retained for retry/reload, never a simulated order or account history.
      writeJson(PENDING_KEY, attempt, true);
    }
    try {
      const data = await api("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
          "X-Receipt-Token": attempt.token,
        },
        body: JSON.stringify(attempt.request),
      });
      if (
        !data.order?.number ||
        !data.order?.id ||
        !Array.isArray(data.order.items)
      )
        throw new OrderError(
          "Nie udało się odczytać potwierdzenia. Ponów próbę.",
          "SERVER_ERROR",
          true,
        );
      finishAttempt();
      return {
        order: data.order,
        key: attempt.key,
        submitted: attempt.request.items,
      };
    } catch (error) {
      if (
        error instanceof OrderError &&
        !error.uncertain &&
        error.code !== "IDEMPOTENCY_CONFLICT"
      ) {
        pendingMemory = null;
        removeStored(PENDING_KEY, true);
      }
      throw error;
    }
  },
};
