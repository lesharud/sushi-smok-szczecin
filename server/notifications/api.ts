import { timingSafeEqual } from "node:crypto";
import { database, json } from "../orders.js";
import { telegramConfigured } from "./providers.js";
import { processNotifications } from "./worker.js";
const denied = () => json({ message: "Brak uprawnień." }, 401);
export async function notifications(
  request: Request,
  deps = { database, processNotifications },
  env: NodeJS.ProcessEnv = process.env,
) {
  const path = new URL(request.url).pathname;
  try {
    if (path === "/api/notification-worker") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const expected = env.NOTIFICATION_WORKER_SECRET;
      const supplied =
        request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ||
        "";
      if (
        !expected ||
        expected.length < 32 ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        return denied();
      return json(await deps.processNotifications(deps.database(), env));
    }
    if (!["GET", "POST"].includes(request.method))
      return new Response(null, { status: 405 });
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(request.url).origin)
    )
      return denied();
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (\S{1,4096})$/)?.[1];
    if (!token) return denied();
    const db = deps.database();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return denied();
    const { data: profile, error: roleError } = await db
      .from("staff_profiles")
      .select("role,active")
      .eq("user_id", auth.user.id)
      .single();
    if (roleError || profile?.role !== "admin" || !profile.active)
      return json({ message: "Brak uprawnień." }, 403);
    const configured = telegramConfigured(env);
    if (request.method === "GET") {
      const [jobs, heartbeat] = await Promise.all([
        db
          .from("notification_jobs")
          .select("id,event,status,attempts,last_code,created_at,sent_at")
          .eq("channel", "telegram")
          .order("created_at", { ascending: false })
          .limit(10),
        db
          .from("notification_worker_state")
          .select("last_run_at")
          .eq("id", true)
          .single(),
      ]);
      if (jobs.error || heartbeat.error) throw new Error("QUEUE_UNAVAILABLE");
      return json({
        telegram: { configured },
        sms: { configured: false },
        lastWorkerRun: heartbeat.data?.last_run_at || null,
        recent: jobs.data,
      });
    }
    // Fixed test event. Never accept a destination, arbitrary text or customer payload.
    if (Number(request.headers.get("content-length") || 0) > 0 || request.body)
      return json({ message: "Żądanie nie może zawierać treści." }, 400);
    if (!configured)
      return json({ message: "Telegram nie jest skonfigurowany." }, 409);
    const { data: id, error } = await db.rpc("enqueue_notification_test");
    if (error)
      return json(
        {
          message:
            error.message === "RATE_LIMITED"
              ? "Odczekaj minutę przed kolejnym testem."
              : "Nie udało się zlecić testu.",
        },
        error.message === "RATE_LIMITED" ? 429 : 503,
      );
    // Test delivery is queued too; UI polls durable status, not a misleading "sent" acknowledgment.
    return json({ id, message: "Test oczekuje na wysłanie." }, 202);
  } catch {
    // Sanitized operational signal only; never log underlying SDK/HTTP error objects.
    console.warn("NOTIFICATION_API_UNAVAILABLE");
    return json(
      {
        message:
          "Powiadomienia są chwilowo niedostępne. Zamówienia działają niezależnie.",
      },
      503,
    );
  }
}
