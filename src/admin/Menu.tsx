import { useState, type FormEvent } from "react";
import { adminClient as db, errorText } from "./client";
import { useResource } from "./useResource";
import type { MenuProduct } from "./types";
import { money, normalizeSearch } from "../shop/catalog";
export function parsePrice(value: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const price = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(price) ? price : null;
}
export default function Menu() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const resource = useResource(
    "menu",
    async () => {
      const [products, categories] = await Promise.all([
        db!
          .from("products")
          .select(
            "id,name,description,category_id,price_grosz,available,updated_at",
          )
          .order("name"),
        db!.from("categories").select("id,name").order("sort_order"),
      ]);
      if (products.error || categories.error)
        throw products.error || categories.error;
      return {
        products: products.data as MenuProduct[],
        categories: categories.data as { id: string; name: string }[],
      };
    },
    15000,
  );
  async function save(p: MenuProduct) {
    if (busy) return;
    setBusy(p.id);
    setError("");
    setMessage("");
    try {
      const { error } = await db!.rpc("admin_update_product", {
        p_id: p.id,
        p_expected: p.updated_at,
        p_name: p.name,
        p_description: p.description,
        p_category: p.category_id,
        p_price: p.price_grosz,
        p_available: p.available,
      });
      if (error) throw error;
      setEditing(null);
      setMessage(
        "Zapisano zmiany. Menu klientów zaktualizuje się automatycznie.",
      );
      resource.refresh();
    } catch (e) {
      setError(errorText(e));
      resource.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <p className="admin-eyebrow">SUSHI SMOK / MENU</p>
      <h1>Zarządzaj menu</h1>
      <p>
        Zmiany ceny i dostępności obowiązują przy kolejnych zamówieniach.
        Poprzednie zamówienia zachowują swoje ceny.
      </p>
      <div className="admin-filters">
        <label>
          Szukaj dania
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Kategoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Wszystkie</option>
            {resource.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={resource.refresh}>Odśwież</button>
      </div>
      {(error || resource.error) && (
        <p role="alert" className="admin-error">
          {error || resource.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!resource.data && !resource.error && (
        <p role="status">Ładowanie menu…</p>
      )}
      <div className="admin-menu-list">
        {resource.data?.products
          .filter(
            (p) =>
              (!category || p.category_id === category) &&
              normalizeSearch(p.name).includes(normalizeSearch(query)),
          )
          .map((p) => (
            <article key={p.id}>
              <div>
                <h2>{p.name}</h2>
                <p>
                  {money(p.price_grosz)} ·{" "}
                  {
                    resource.data!.categories.find(
                      (c) => c.id === p.category_id,
                    )?.name
                  }
                </p>
              </div>
              <div className="admin-actions">
                <button
                  role="switch"
                  aria-checked={p.available}
                  aria-label={`Dostępność: ${p.name}`}
                  disabled={!!busy}
                  onClick={() => save({ ...p, available: !p.available })}
                >
                  {p.available ? "Dostępny" : "Niedostępny"}
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => {
                    setEditing(p);
                    setError("");
                  }}
                >
                  Edytuj
                </button>
              </div>
              {editing?.id === p.id && (
                <ProductEditor
                  key={p.id}
                  product={editing}
                  categories={resource.data!.categories}
                  busy={!!busy}
                  onSave={save}
                  onClose={() => setEditing(null)}
                />
              )}
            </article>
          ))}
      </div>
    </>
  );
}
function ProductEditor({
  product,
  categories,
  busy,
  onSave,
  onClose,
}: {
  product: MenuProduct;
  categories: { id: string; name: string }[];
  busy: boolean;
  onSave: (p: MenuProduct) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const price = parsePrice(String(form.get("price")));
    if (price === null || price < 0 || price > 1000000) {
      setError(
        "Podaj cenę od 0 do 10 000 zł, maksymalnie dwa miejsca po przecinku.",
      );
      return;
    }
    onSave({
      ...product,
      name: String(form.get("name")).trim(),
      description: String(form.get("description")),
      category_id: String(form.get("category")),
      price_grosz: price,
      available: form.get("available") === "on",
    });
  }
  return (
    <form className="admin-editor" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Edytuj: {product.name}</legend>
        <label>
          Nazwa
          <input
            name="name"
            defaultValue={product.name}
            maxLength={150}
            required
          />
        </label>
        <label>
          Opis
          <textarea
            name="description"
            defaultValue={product.description}
            maxLength={4000}
          />
        </label>
        <label>
          Kategoria
          <select name="category" defaultValue={product.category_id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cena (zł)
          <input
            name="price"
            inputMode="decimal"
            defaultValue={(product.price_grosz / 100).toFixed(2)}
            required
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            name="available"
            defaultChecked={product.available}
          />
          Dostępny
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="admin-actions">
          <button className="admin-primary">
            {busy ? "Zapisywanie…" : "Zapisz zmiany"}
          </button>
          <button type="button" onClick={onClose}>
            Zamknij edycję
          </button>
        </div>
        <p>
          Jeśli dane zmieniły się na innym ekranie, zamknij edycję i otwórz ją
          ponownie.
        </p>
      </fieldset>
    </form>
  );
}
