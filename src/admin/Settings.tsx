import { useState, type FormEvent } from "react";
import { adminClient as db, errorText } from "./client";
import { useResource } from "./useResource";
import type { Settings as SettingsData } from "./types";
import { parsePrice } from "./Menu";
export default function Settings() {
  const [saved, setSaved] = useState(false);
  const resource = useResource(
    "settings",
    async () => {
      const { data, error } = await db!
        .from("order_settings")
        .select(
          "ordering_enabled,delivery_enabled,delivery_fee_grosz,updated_at",
        )
        .eq("id", true)
        .single();
      if (error) throw error;
      return data as SettingsData;
    },
    0,
  );
  return (
    <>
      <p className="admin-eyebrow">SUSHI SMOK / USTAWIENIA</p>
      <h1>Przyjmowanie zamówień</h1>
      <p>
        Nie włączaj dostawy bez potwierdzenia taryfy i obsługi adresów przez
        restaurację.
      </p>
      <button
        onClick={() => {
          setSaved(false);
          resource.refresh();
        }}
      >
        Wczytaj aktualne ustawienia
      </button>
      {saved && <p role="status">Ustawienia zapisane.</p>}
      {resource.error && (
        <p role="alert" className="admin-error">
          {resource.error}
        </p>
      )}
      {resource.data ? (
        <Editor
          key={resource.data.updated_at}
          settings={resource.data}
          refresh={() => {
            setSaved(true);
            resource.refresh();
          }}
        />
      ) : (
        !resource.error && <p role="status">Ładowanie ustawień…</p>
      )}
    </>
  );
}
function Editor({
  settings: s,
  refresh,
}: {
  settings: SettingsData;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const delivery = f.get("delivery") === "on";
    const raw = String(f.get("fee")).trim();
    const fee = raw ? parsePrice(raw) : null;
    if (
      (delivery && fee === null) ||
      (raw && fee === null) ||
      (fee !== null && fee > 100000)
    ) {
      setError("Podaj poprawną opłatę dostawy od 0 do 1000 zł.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await db!.rpc("admin_update_settings", {
        p_expected: s.updated_at,
        p_ordering: f.get("ordering") === "on",
        p_delivery: delivery,
        p_fee: fee,
      });
      if (error) throw error;
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="admin-editor" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Ustawienia operacyjne</legend>
        <label className="admin-check">
          <input
            name="ordering"
            type="checkbox"
            defaultChecked={s.ordering_enabled}
          />
          Przyjmuj zamówienia online
        </label>
        <p>
          Wyłączenie zatrzymuje nowe zamówienia. Już zapisane zamówienia
          pozostają do obsługi.
        </p>
        <label className="admin-check">
          <input
            name="delivery"
            type="checkbox"
            defaultChecked={s.delivery_enabled}
          />
          Włącz dostawę
        </label>
        <label>
          Opłata za dostawę (zł)
          <input
            name="fee"
            inputMode="decimal"
            defaultValue={
              s.delivery_fee_grosz === null
                ? ""
                : (s.delivery_fee_grosz / 100).toFixed(2)
            }
          />
        </label>
        <p>
          Puste pole oznacza brak ustalonej taryfy. Wtedy dostawa musi pozostać
          wyłączona.
        </p>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <button className="admin-primary">
          {busy ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
      </fieldset>
    </form>
  );
}
