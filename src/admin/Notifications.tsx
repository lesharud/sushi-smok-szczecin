import { useState } from "react";
import { adminClient } from "./client";
import { useResource } from "./useResource";
type Job = {
  id: string;
  event: string;
  status: string;
  attempts: number;
  last_code: string | null;
  created_at: string;
  sent_at: string | null;
};
type Status = {
  telegram: { configured: boolean };
  sms: { configured: boolean };
  lastWorkerRun: string | null;
  recent: Job[];
};
async function call(method = "GET") {
  const { data } = await adminClient!.auth.getSession();
  if (!data.session) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const response = await fetch("/api/notifications", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Nie udało się sprawdzić powiadomień.");
  return result;
}
export default function Notifications() {
  const resource = useResource<Status>("notifications", () => call(), 5000);
  const [busy, setBusy] = useState(false),
    [testId, setTestId] = useState<string | null>(null),
    [error, setError] = useState("");
  const job = resource.data?.recent.find((j) => j.id === testId);
  const workerStale =
    !resource.data?.lastWorkerRun ||
    Date.now() - new Date(resource.data.lastWorkerRun).getTime() > 180000;
  async function test() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await call("POST");
      setTestId(result.id);
      resource.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się wysłać.");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    pending: "Oczekuje / ponowna próba",
    processing: "Wysyłanie",
    sent: "Wysłano pomyślnie",
    failed: "Nie udało się wysłać",
    expired: "Nie wysłano — upłynął czas",
  };
  return (
    <section className="admin-editor" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Powiadomienia</h2>
      <p>Zamówienia zapisują się niezależnie od działania powiadomień.</p>
      {resource.error && (
        <p role="alert">
          Nie udało się sprawdzić powiadomień. Spróbujemy ponownie.
        </p>
      )}
      {!resource.data && !resource.error && (
        <p role="status">Ładowanie powiadomień…</p>
      )}
      {resource.data && (
        <>
          <p>
            Telegram:{" "}
            <strong>
              {resource.data.telegram.configured
                ? "Skonfigurowano"
                : "Nie skonfigurowano"}
            </strong>
          </p>
          <p>
            SMS: <strong>Nie skonfigurowano</strong> — wysyłka wyłączona.
          </p>
          {resource.data.telegram.configured && workerStale && (
            <p className="admin-error" role="status">
              Wysyłka nie jest aktywna lub nie odpowiada. Sprawdzaj nowe
              zamówienia w zakładce Kuchnia.
            </p>
          )}
          <button
            type="button"
            onClick={test}
            disabled={busy || !resource.data.telegram.configured}
          >
            {busy ? "Zlecanie testu…" : "Wyślij test Telegram"}
          </button>
          {testId && (
            <p role="status">
              {job ? labels[job.status] : "Test oczekuje na wysłanie."}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <h3>Ostatnie powiadomienia Telegram</h3>
          {!resource.data.recent.length && <p>Brak powiadomień.</p>}
          <ul>
            {resource.data.recent.map((j) => (
              <li key={j.id}>
                {new Date(j.created_at).toLocaleString("pl-PL")} ·{" "}
                {j.event === "test" ? "Test" : "Nowe zamówienie"} ·{" "}
                {labels[j.status]} · Próby: {j.attempts}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
