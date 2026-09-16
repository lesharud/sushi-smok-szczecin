import { useState, useEffect, useRef } from "react";
import { adminClient as db, errorText } from "./client";
import { useResource } from "./useResource";
import {
  labels,
  next,
  orderColumns,
  type StaffOrder,
  type Status,
} from "./types";
import { money } from "../shop/catalog";
const active = ["new", "accepted", "preparing", "ready"];
const date = (value: string) =>
  new Date(value).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  });
const elapsed = (value: string) =>
  `${Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000))} min`;
export default function Orders({ kitchen = false }: { kitchen?: boolean }) {
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const key = JSON.stringify([kitchen, filter, query, day, page]);
  const limit = kitchen ? 200 : 50;
  const resource = useResource(key, async () => {
    let request = db!
      .from("orders")
      .select(orderColumns, { count: "exact" })
      .order("created_at", { ascending: kitchen })
      .order("id")
      .range(page * limit, (page + 1) * limit - 1);
    if (kitchen || filter === "active") request = request.in("status", active);
    else if (filter !== "all") request = request.eq("status", filter);
    if (query.trim())
      request = request.ilike(
        "number",
        `%${query.trim().replace(/[%_]/g, "")}%`,
      );
    if (day) {
      const start = new Date(`${day}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      request = request
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());
    }
    const [{ data, error, count }, newCount] = await Promise.all([
      request,
      db!
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
    ]);
    if (error || newCount.error) throw error || newCount.error;
    return {
      orders: data as unknown as StaffOrder[],
      count: count || 0,
      newCount: newCount.count || 0,
    };
  });
  const details = useResource<StaffOrder | null>(
    selected || "none",
    async () => {
      if (!selected) return null;
      const { data, error } = await db!
        .from("orders")
        .select(orderColumns)
        .eq("id", selected)
        .single();
      if (error) throw error;
      return data as unknown as StaffOrder;
    },
  );
  const orders = resource.data?.orders || [];
  const refresh = () => {
    resource.refresh();
    details.refresh();
  };
  const groups = kitchen
    ? [
        { label: "Nowe", values: ["new"] },
        { label: "W przygotowaniu", values: ["accepted", "preparing"] },
        { label: "Gotowe", values: ["ready"] },
      ]
    : [{ label: "Zamówienia", values: Object.keys(labels) }];
  return (
    <>
      <div className="admin-title">
        <div>
          <p className="admin-eyebrow">
            SUSHI SMOK / {kitchen ? "KUCHNIA" : "ZAMÓWIENIA"}
          </p>
          <h1>{kitchen ? "Na bieżąco." : "Zamówienia"}</h1>
        </div>
        <span className="admin-new" role="status">
          Nowe: {resource.data?.newCount ?? "—"}
        </span>
      </div>
      <div className="admin-sync">
        <span>
          {resource.updated
            ? `Ostatnia aktualizacja: ${new Date(resource.updated).toLocaleTimeString("pl-PL")}. Automatycznie co 5 s.`
            : "Pobieranie zamówień…"}
        </span>
        <button onClick={refresh}>Odśwież</button>
      </div>
      {resource.error && (
        <p role="alert" className="admin-error">
          {resource.error} Wyświetlane dane mogą być nieaktualne. Ponawiamy
          połączenie.
        </p>
      )}
      {!kitchen && (
        <div className="admin-filters">
          <label>
            Status
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="active">W toku</option>
              <option value="all">Wszystkie</option>
              {Object.entries(labels).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Numer zamówienia
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="SMOK-100123"
            />
          </label>
          <label>
            Data (czas urządzenia)
            <input
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
      )}
      {!resource.data && !resource.error && <p role="status">Ładowanie…</p>}
      {resource.data && orders.length === 0 && (
        <p className="admin-empty">Brak zamówień w tym widoku.</p>
      )}
      <div className={kitchen ? "admin-board" : "admin-orders"}>
        {groups.map((group) => (
          <section key={group.label}>
            {kitchen && (
              <h2>
                {group.label}{" "}
                <small>
                  {orders.filter((o) => group.values.includes(o.status)).length}
                </small>
              </h2>
            )}
            {orders
              .filter((o) => group.values.includes(o.status))
              .map((order) => (
                <article
                  key={order.id}
                  className={`admin-order ${order.status === "new" ? "is-new" : ""}`}
                >
                  <div className="admin-order-top">
                    <button
                      className="admin-order-number"
                      onClick={() => setSelected(order.id)}
                    >
                      {order.number}
                    </button>
                    <span className={`admin-badge status-${order.status}`}>
                      {labels[order.status]}
                    </span>
                  </div>
                  <p className="admin-time">
                    {date(order.created_at)} · {elapsed(order.created_at)} od
                    złożenia
                  </p>
                  <p>
                    {order.fulfillment === "pickup"
                      ? "Odbiór osobisty"
                      : "Dostawa"}
                    {order.preferred_time
                      ? ` · Na ${date(order.preferred_time)}`
                      : ""}
                  </p>
                  {kitchen ? (
                    <ul className="admin-dishes">
                      {order.order_items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.quantity} ×</strong> {item.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {order.customer.name} · {order.order_items.length} poz. ·{" "}
                      <strong>{money(order.total_grosz)}</strong>
                    </p>
                  )}
                  {order.notes && (
                    <p className="admin-note">
                      <strong>Uwagi klienta</strong>
                      {order.notes}
                    </p>
                  )}
                  <Actions order={order} onChange={refresh} />
                  <button
                    className="admin-detail-link"
                    onClick={() => setSelected(order.id)}
                  >
                    Szczegóły zamówienia
                  </button>
                </article>
              ))}
          </section>
        ))}
      </div>
      {resource.data && resource.data.count > limit && (
        <nav className="admin-pagination" aria-label="Strony zamówień">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Poprzednia
          </button>
          <span>
            {page + 1} / {Math.ceil(resource.data.count / limit)} · Łącznie{" "}
            {resource.data.count} zamówień
          </span>
          <button
            disabled={(page + 1) * limit >= resource.data.count}
            onClick={() => setPage((p) => p + 1)}
          >
            Następna
          </button>
        </nav>
      )}
      {selected && (
        <dialog
          ref={dialog}
          className="admin-details"
          aria-label="Szczegóły zamówienia"
          onCancel={() => setSelected(null)}
        >
          <div className="admin-title">
            <h2>Szczegóły zamówienia</h2>
            <button onClick={() => setSelected(null)}>Zamknij szczegóły</button>
          </div>
          {details.error && (
            <p role="alert" className="admin-error">
              {details.error}
            </p>
          )}
          {!details.data && !details.error && <p role="status">Ładowanie…</p>}
          {details.data && <Detail order={details.data} onChange={refresh} />}
        </dialog>
      )}
    </>
  );
}
function Actions({
  order,
  onChange,
}: {
  order: StaffOrder;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function change(status: Status) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await db!.rpc("staff_change_order_status", {
        p_id: order.id,
        p_expected: order.status,
        p_next: status,
      });
      if (error) throw error;
      setConfirm(false);
      onChange();
    } catch (e) {
      setError(errorText(e));
      onChange();
    } finally {
      setBusy(false);
    }
  }
  const step = next[order.status];
  return (
    <>
      <div className="admin-actions">
        {step && (
          <button
            className="admin-primary"
            disabled={busy}
            onClick={() => change(step.status)}
          >
            {busy ? "Zapisywanie…" : step.label}
          </button>
        )}
        {step && !confirm && (
          <button disabled={busy} onClick={() => setConfirm(true)}>
            Anuluj
          </button>
        )}
        {step && confirm && (
          <div className="admin-confirm">
            <p>
              Anulować zamówienie {order.number}? Tej operacji nie można cofnąć.
            </p>
            <button
              className="admin-danger"
              disabled={busy}
              onClick={() => change("cancelled")}
            >
              Tak, anuluj zamówienie
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Nie, wróć
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
    </>
  );
}
function Detail({
  order: o,
  onChange,
}: {
  order: StaffOrder;
  onChange: () => void;
}) {
  return (
    <>
      <h3>
        {o.number} · {labels[o.status]}
      </h3>
      <p>
        {date(o.created_at)} · {elapsed(o.created_at)} od złożenia
      </p>
      <p>
        {o.customer.name} ·{" "}
        <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a>
      </p>
      <p>{o.fulfillment === "pickup" ? "Odbiór osobisty" : "Dostawa"}</p>
      {o.address && (
        <p>
          {o.address.street} {o.address.building}
          {o.address.apartment ? ` / ${o.address.apartment}` : ""},{" "}
          {o.address.postalCode} {o.address.city}
        </p>
      )}
      <p>
        Żądany termin:{" "}
        {o.preferred_time ? date(o.preferred_time) : "Jak najszybciej"}
      </p>
      {o.notes && (
        <p className="admin-note">
          <strong>Uwagi klienta</strong>
          {o.notes}
        </p>
      )}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Danie</th>
              <th>Ilość</th>
              <th>Cena</th>
              <th>Razem</th>
            </tr>
          </thead>
          <tbody>
            {o.order_items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.quantity}</td>
                <td>{money(i.unit_price_grosz)}</td>
                <td>{money(i.line_total_grosz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="admin-totals">
        <dt>Produkty</dt>
        <dd>{money(o.subtotal_grosz)}</dd>
        <dt>Dostawa</dt>
        <dd>{money(o.delivery_fee_grosz)}</dd>
        <dt>Łącznie</dt>
        <dd>
          <strong>{money(o.total_grosz)}</strong>
        </dd>
      </dl>
      <Actions key={o.id} order={o} onChange={onChange} />
    </>
  );
}
