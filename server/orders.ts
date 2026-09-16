import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  credentials,
  RequestError,
  validateGuestRequest,
} from "./validation.js";

const messages: Record<string, string> = {
  INVALID_REQUEST: "Sprawdź dane zamówienia i spróbuj ponownie.",
  INVALID_ITEMS: "Sprawdź produkty i ich liczbę w koszyku.",
  INVALID_CUSTOMER: "Podaj swoje imię i poprawny numer telefonu.",
  INVALID_PHONE: "Podaj poprawny numer telefonu (9–15 cyfr).",
  INVALID_ADDRESS: "Uzupełnij poprawny adres dostawy.",
  INVALID_TIME: "Wybierz przyszłą datę i godzinę lub pozostaw to pole puste.",
  PRODUCT_UNAVAILABLE: "Niektóre dania nie są już dostępne. Sprawdź koszyk.",
  DELIVERY_UNAVAILABLE:
    "Dostawa online nie jest teraz dostępna. Wybierz odbiór osobisty.",
  ORDERING_UNAVAILABLE:
    "Zamówienia online są chwilowo niedostępne. Spróbuj później lub zadzwoń do nas.",
  IDEMPOTENCY_CONFLICT:
    "Poprzednia próba dotyczyła innych danych. Sprawdź jej wynik przed kolejnym zamówieniem.",
  RATE_LIMITED: "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  NOT_FOUND: "Nie znaleźliśmy tego potwierdzenia.",
};
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(code: string, status: number) {
  return json(
    {
      error: { code, message: messages[code] || messages.ORDERING_UNAVAILABLE },
    },
    status,
  );
}
export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RequestError("ORDERING_UNAVAILABLE", 503);
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  )
    throw new RequestError("ORDERING_UNAVAILABLE", 503);
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
    },
  });
}
async function body(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new RequestError("INVALID_REQUEST", 415);
  if (Number(request.headers.get("content-length")) > 16384)
    throw new RequestError("INVALID_REQUEST", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new RequestError("INVALID_REQUEST", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("INVALID_REQUEST");
  }
}
// Only known errors cross the API boundary. Never return DB details or customer data in logs.
function rpcError(message: string): never {
  const code = Object.keys(messages).find((code) => message === code);
  throw new RequestError(
    code || "ORDERING_UNAVAILABLE",
    code === "RATE_LIMITED"
      ? 429
      : code === "NOT_FOUND"
        ? 404
        : code === "IDEMPOTENCY_CONFLICT"
          ? 409
          : code === "ORDERING_UNAVAILABLE" || !code
            ? 503
            : 422,
  );
}
export async function handle(
  request: Request,
  action: "create" | "receipt" | "settings",
) {
  try {
    if (request.method !== (action === "settings" ? "GET" : "POST"))
      return new Response(null, {
        status: 405,
        headers: { Allow: action === "settings" ? "GET" : "POST" },
      });
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(request.url).origin)
    )
      throw new RequestError("INVALID_REQUEST", 403);
    if (action === "settings") {
      const { data, error } = await database()
        .from("order_settings")
        .select("ordering_enabled,delivery_enabled,delivery_fee_grosz")
        .eq("id", true)
        .single();
      if (error || !data) throw new RequestError("ORDERING_UNAVAILABLE", 503);
      return json({
        orderingEnabled: data.ordering_enabled,
        deliveryEnabled:
          data.delivery_enabled && data.delivery_fee_grosz !== null,
        deliveryFeeGrosz: data.delivery_enabled
          ? data.delivery_fee_grosz
          : null,
      });
    }
    const { key, token } = credentials(request);
    const raw = await body(request);
    if (action === "receipt") {
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).length
      )
        throw new RequestError("INVALID_REQUEST");
      const { data, error } = await database().rpc("get_guest_order", {
        p_key: key,
        p_receipt_hash: sha256(token),
      });
      if (error) rpcError(error.message);
      if (!data) throw new RequestError("NOT_FOUND", 404);
      return json({ order: data });
    }
    const input = validateGuestRequest(raw);
    const { data, error } = await database().rpc("create_guest_order", {
      p_key: key,
      p_receipt_hash: sha256(token),
      p_request: input,
    });
    if (error) rpcError(error.message);
    if (!data) throw new RequestError("ORDERING_UNAVAILABLE", 503);
    return json({ order: data }, 201);
  } catch (error) {
    return error instanceof RequestError
      ? failure(error.code, error.status)
      : failure("ORDERING_UNAVAILABLE", 503);
  }
}
