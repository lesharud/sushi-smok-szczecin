// Optional hooks for verify-admin-cloud.mjs. Real Telegram sends are explicit opt-in.
// No secrets/customer payloads in output. Failure simulation applies ONLY to a fixed test job.
import { processNotifications } from "../.server-test/server/notifications/worker.js";
export function notificationChecks({ env, service, base, check }) {
  const production = env.VERIFY_PRODUCTION_NOTIFICATIONS === "true";
  const call = async (method, params = {}) => {
    const r = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      },
    );
    const j = await r.json();
    check(r.ok && j.ok, "Telegram configuration rejected");
    return j.result;
  };
  const job = async (id) => {
    const r = await service
      .from("notification_jobs")
      .select("id,status,attempts,provider_message_id,available_at")
      .eq("id", id)
      .single();
    check(!r.error, "Job read failed");
    return r.data;
  };
  const onlyJob = async (id) => {
    const r = await service
      .from("notification_jobs")
      .select("id")
      .eq("channel", "telegram")
      .in("status", ["pending", "processing"]);
    check(
      !r.error && r.data.every((j) => j.id === id),
      "Other active jobs require review before test worker",
    );
  };
  const worker = async () => {
    const r = await fetch(base + "/api/notification-worker", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.NOTIFICATION_WORKER_SECRET },
    });
    check(r.ok, "Local real worker failed");
    return r.json();
  };
  return {
    async config() {
      check(
        production
          ? base === "https://sushi-smok-szczecin.vercel.app"
          : base === "http://127.0.0.1:4175",
        "Notification test must use local worker before deployment",
      );
      const bot = await call("getMe");
      const chat = await call("getChat", { chat_id: env.TELEGRAM_CHAT_ID });
      check(
        ["group", "supergroup"].includes(chat.type),
        "Expected restaurant group",
      );
      check(
        String(chat.title)
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[—–-]/g, " ")
          .replace(/\s+/g, " ")
          .trim() === "sushi smok zamówienia",
        "Unexpected group title",
      );
      const member = await call("getChatMember", {
        chat_id: env.TELEGRAM_CHAT_ID,
        user_id: bot.id,
      });
      check(
        !["left", "kicked"].includes(member.status),
        "Bot cannot access group",
      );
      console.log(
        JSON.stringify({
          telegramConfigurationVerified: true,
          expectedRestaurantGroup: true,
          secretsPrinted: false,
        }),
      );
    },
    async test(page) {
      await page.goto(base + "/admin/settings");
      const region = page.getByRole("region", { name: "Powiadomienia" });
      await region
        .getByRole("button", { name: "Wyślij test Telegram" })
        .waitFor();
      if (production) {
        check(
          await region
            .getByRole("button", { name: "Wyślij test Telegram" })
            .isEnabled(),
          "Production Telegram unconfigured",
        );
        console.log(
          JSON.stringify({
            productionNotificationSettings: true,
            extraTestMessage: false,
          }),
        );
        return;
      }
      const responsePromise = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/notifications") &&
          r.request().method() === "POST",
      );
      await region
        .getByRole("button", { name: "Wyślij test Telegram" })
        .click();
      const response = await responsePromise;
      check(response.status() === 202, "Admin test enqueue failed");
      const { id } = await response.json();
      await onlyJob(id);
      // Deterministic injected provider failure, not a false report of a real Telegram outage.
      const failed = await processNotifications(service, env, async () =>
        Response.json({ ok: false }, { status: 503 }),
      );
      check(failed.processed === 1, "Test failure not recorded");
      const pending = await job(id);
      check(
        pending.status === "pending" && pending.attempts === 1,
        "Retry not persisted",
      );
      const premature = await worker();
      check(premature.processed === 0, "Backoff ignored");
      console.log(
        JSON.stringify({
          adminTestQueued: true,
          injected503Recorded: true,
          retryBackoffEnforced: true,
        }),
      );
      const delay =
        Math.max(0, new Date(pending.available_at).getTime() - Date.now()) +
        1100;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delay, 32000)),
      );
      await onlyJob(id);
      await worker();
      const sent = await job(id);
      check(
        sent.status === "sent" &&
          sent.attempts === 2 &&
          sent.provider_message_id,
        "Actual Telegram send failed",
      );
      const attempts = await service
        .from("notification_attempts")
        .select("outcome,code")
        .eq("job_id", id)
        .order("created_at");
      check(
        !attempts.error &&
          attempts.data.length === 2 &&
          attempts.data[0].outcome === "retry" &&
          attempts.data[1].outcome === "sent",
        "Delivery log mismatch",
      );
      await region
        .getByRole("status")
        .filter({ hasText: "Wysłano pomyślnie" })
        .waitFor({ timeout: 20000 });
      await worker();
      check((await job(id)).attempts === 2, "Test notification duplicated");
      console.log(
        JSON.stringify({
          realTelegramTestSent: true,
          adminSuccessVisible: true,
          attempts: 2,
          deliveredMessages: 1,
          duplicatePrevented: true,
        }),
      );
    },
    async order(id, number) {
      const jobs = await service
        .from("notification_jobs")
        .select("id,channel,status")
        .eq("order_id", id)
        .eq("event", "order_received");
      check(!jobs.error && jobs.data.length === 2, "Order outbox missing");
      const telegram = jobs.data.find((j) => j.channel === "telegram");
      check(telegram, "Order Telegram job missing");
      if (!production) {
        check(telegram.status === "pending", "Order job already processed");
        await onlyJob(telegram.id);
        await worker();
      }
      let sent = await job(telegram.id);
      if (production) {
        for (let i = 0; i < 30 && sent.status !== "sent"; i++) {
          if (i % 6 === 0)
            console.log(
              JSON.stringify({
                waitingForAutomaticScheduler: true,
                orderNumber: number,
              }),
            );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          sent = await job(telegram.id);
        }
      }
      check(
        sent.status === "sent" &&
          sent.attempts === 1 &&
          sent.provider_message_id,
        "Order Telegram send failed",
      );
      if (!production) await worker();
      check(
        (await job(telegram.id)).attempts === 1,
        "Order notification duplicated",
      );
      const log = await service
        .from("notification_attempts")
        .select("outcome,code")
        .eq("job_id", telegram.id);
      check(
        !log.error && log.data.length === 1 && log.data[0].code === "DELIVERED",
        "Order delivery log missing",
      );
      console.log(
        JSON.stringify({
          orderNumber: number,
          realOrderTelegramSent: true,
          automaticProductionScheduler: production,
          deliveryAttempts: 1,
          smsDisabled: true,
          duplicatePrevented: true,
        }),
      );
    },
  };
}
