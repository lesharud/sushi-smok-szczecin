import { useEffect, useState } from "react";
import { productById, categories } from "./catalog";
// Preserve the existing product objects/images used by editorial sections and cart.
// The database only supplies fields editable in Admin; checkout still reprices server-side.
export function applyCatalog(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid catalog");
  const rows = value as Record<string, unknown>[];
  for (const row of rows) {
    if (
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.description !== "string" ||
      typeof row.category_id !== "string" ||
      !categories.some((c) => c.id === row.category_id) ||
      !Number.isSafeInteger(row.price_grosz) ||
      Number(row.price_grosz) < 0 ||
      typeof row.available !== "boolean"
    )
      throw new Error("Invalid catalog");
  }
  const ids = new Set(rows.map((r) => r.id));
  let changed = false;
  for (const p of productById.values())
    if (!ids.has(p.id) && p.available) {
      p.available = false;
      changed = true;
    }
  for (const row of rows) {
    const p = productById.get(row.id as string);
    if (!p) continue;
    const update = {
      name: row.name as string,
      description: row.description as string,
      categoryId: row.category_id as string,
      priceGrosz: row.price_grosz as number,
      available: row.available as boolean,
    };
    if (Object.entries(update).some(([k, v]) => p[k as keyof typeof p] !== v)) {
      Object.assign(p, update);
      changed = true;
    }
  }
  return changed;
}
export function useLiveCatalog(enabled: boolean) {
  const [, setVersion] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      running = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const load = async () => {
      if (!alive || running) return;
      running = true;
      clearTimeout(timer);
      try {
        const response = await fetch("/api/catalog", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok) throw new Error("Catalog unavailable");
        const payload = await response.json();
        if (alive) {
          if (applyCatalog(payload.products)) setVersion((v) => v + 1);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        running = false;
        if (alive) timer = setTimeout(load, 15000);
      }
    };
    const wake = () => {
      if (!document.hidden) void load();
    };
    void load();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [enabled]);
  return error;
}
