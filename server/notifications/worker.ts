import { database } from "../orders.js";
import {
  sendTelegram,
  telegramConfigured,
  telegramOrder,
  type OrderNotification,
} from "./providers.js";
export function notificationSiteUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.SITE_URL || "https://sushi-smok-szczecin.vercel.app";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("INVALID_SITE_URL");
  return url.origin;
}
export async function processNotifications(
  db = database(),
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  const channels = telegramConfigured(env) ? ["telegram"] : [];
  let processed = 0;
  const started = Date.now();
  // Bounded execution for a Vercel function. Claim just one job at a time, lease >> HTTP timeout.
  for (let i = 0; i < 3 && Date.now() - started < 10000; i++) {
    const { data: jobs, error } = await db.rpc("claim_notification", {
      p_channels: channels,
    });
    if (error) throw new Error("QUEUE_UNAVAILABLE");
    const job = jobs?.[0];
    if (!job) break;
    let result;
    if (job.event === "test")
      result = await sendTelegram(
        "Sushi SMOK — powiadomienie testowe. Połączenie z Telegramem działa.",
        env,
        transport,
      );
    else {
      const { data: order, error: readError } = await db
        .from("orders")
        .select(
          "number,status,created_at,fulfillment,customer,address,preferred_time,notes,total_grosz,order_items(name,quantity)",
        )
        .eq("id", job.order_id)
        .single();
      if (readError || !order)
        result = { outcome: "retry" as const, code: "ORDER_READ_FAILED" };
      // Do not send a misleading "new" alert for an order already cancelled/completed during downtime.
      else if (["cancelled", "delivered"].includes(order.status))
        result = { outcome: "failed" as const, code: "ORDER_ALREADY_CLOSED" };
      else {
        try {
          result = await sendTelegram(
            telegramOrder(order as OrderNotification, notificationSiteUrl(env)),
            env,
            transport,
          );
        } catch {
          result = {
            outcome: "failed" as const,
            code: "MESSAGE_CONFIGURATION",
          };
        }
      }
    }
    const { error: finishError, data: finished } = await db.rpc(
      "finish_notification",
      {
        p_id: job.id,
        p_lease: job.lease_token,
        p_outcome: result.outcome,
        p_code: result.code,
        p_delay:
          result.retryAfter || Math.min(3600, 30 * 2 ** (job.attempts - 1)),
        p_message_id: result.messageId || null,
      },
    );
    // Do not re-send in the same invocation after an ambiguous acknowledgement.
    if (finishError || !finished) throw new Error("QUEUE_ACK_FAILED");
    processed++;
  }
  return { processed };
}
