export type NotificationEvent =
  | "order_received"
  | "order_confirmed"
  | "order_ready"
  | "order_cancelled"
  | "delivery_started";
export type DeliveryResult = {
  outcome: "sent" | "retry" | "failed" | "unknown";
  code: string;
  retryAfter?: number;
  messageId?: string;
};
export interface SmsProvider {
  sendSms(
    phone: string,
    text: string,
    idempotencyKey: string,
  ): Promise<DeliveryResult>;
}
// Deliberately no provider selection or live SMS transport at this stage.
export const smsProvider: SmsProvider | null = null;
export function smsTemplate(event: NotificationEvent, number: string) {
  const messages: Record<NotificationEvent, string> = {
    order_received: `Sushi SMOK: zapisaliśmy zamówienie ${number}. Czeka na potwierdzenie restauracji.`,
    order_confirmed: `Sushi SMOK: zamówienie ${number} zostało przyjęte przez restaurację.`,
    order_ready: `Sushi SMOK: zamówienie ${number} jest gotowe.`,
    order_cancelled: `Sushi SMOK: zamówienie ${number} zostało anulowane.`,
    delivery_started: `Sushi SMOK: zamówienie ${number} jest w drodze.`,
  };
  return messages[event];
}
export function telegramConfigured(env: NodeJS.ProcessEnv = process.env) {
  return (
    /^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN || "") &&
    /^-?\d+$/.test(env.TELEGRAM_CHAT_ID || "")
  );
}
export async function sendTelegram(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!telegramConfigured(env))
    return { outcome: "failed", code: "UNCONFIGURED" };
  try {
    const response = await transport(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          link_preview_options: { is_disabled: true },
        }),
      },
    );
    // Never retain/log Telegram descriptions: they can contain user text or credentials.
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { message_id?: number };
      parameters?: { retry_after?: number };
    } | null;
    if (
      response.ok &&
      data?.ok &&
      Number.isSafeInteger(data.result?.message_id)
    )
      return {
        outcome: "sent",
        code: "DELIVERED",
        messageId: String(data!.result!.message_id),
      };
    if (response.status === 429)
      return {
        outcome: "retry",
        code: "TELEGRAM_RATE_LIMIT",
        retryAfter: Math.min(
          86400,
          Math.max(1, Number(data?.parameters?.retry_after) || 60),
        ),
      };
    // Configuration errors are retryable (bounded), allowing recovery after fixing ENV/permissions.
    if ([400, 401, 403, 404].includes(response.status))
      return {
        outcome: "retry",
        code: "TELEGRAM_CONFIGURATION",
        retryAfter: 900,
      };
    if (response.status >= 500)
      return { outcome: "retry", code: "TELEGRAM_UNAVAILABLE" };
    return { outcome: "unknown", code: "TELEGRAM_INVALID_RESPONSE" };
  } catch {
    return { outcome: "unknown", code: "TELEGRAM_TIMEOUT_OR_NETWORK" };
  }
}
export type OrderNotification = {
  number: string;
  created_at: string;
  fulfillment: string;
  customer: { name: string; phone: string };
  address: Record<string, string> | null;
  preferred_time: string | null;
  notes: string;
  total_grosz: number;
  order_items: { name: string; quantity: number }[];
};
// Plain text only: no Markdown/HTML parse mode and no customer-controlled destination/URL.
const clean = (value: string, max = 150) =>
  String(value)
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, max);
const date = (value: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export function telegramOrder(order: OrderNotification, siteUrl: string) {
  const url = new URL("/admin/orders", siteUrl); // Protected admin page; never include receipt tokens.
  const items = order.order_items.map(
    (i) => `${i.quantity} × ${clean(i.name, 60)}`,
  );
  // Telegram limit is 4096. Keep ALL positions (<=50), truncating names before critical fields.
  const itemBudget = 2100;
  const perName = Math.max(
    12,
    Math.floor(itemBudget / Math.max(1, items.length)) - 8,
  );
  const lines = [
    `🆕 Nowe zamówienie — ${order.number}`,
    date(order.created_at),
    order.fulfillment === "delivery" ? "Dostawa" : "Odbiór osobisty",
    `Klient: ${clean(order.customer.name, 100)}`,
    `Telefon: ${clean(order.customer.phone, 20)}`,
  ];
  if (order.address)
    lines.push(
      `Adres: ${["street", "building", "apartment", "postalCode", "city"]
        .map((k) => clean(order.address![k] || "", 150))
        .filter(Boolean)
        .join(" ")}`,
    );
  if (order.preferred_time)
    lines.push(`Preferowany termin: ${date(order.preferred_time)}`);
  lines.push(
    "",
    ...order.order_items.map(
      (i) => `${i.quantity} × ${clean(i.name, perName)}`,
    ),
  );
  if (order.notes) lines.push("", `Uwagi: ${clean(order.notes, 1000)}`);
  lines.push(
    "",
    `Razem: ${(order.total_grosz / 100).toFixed(2).replace(".", ",")} zł`,
    url.toString(),
  );
  return lines.join("\n");
}
