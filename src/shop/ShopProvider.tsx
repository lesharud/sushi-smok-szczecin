import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { productById, orderSettings } from "./catalog";
import { readJson, writeJson } from "./storage";
import type { CartLine } from "./types";
const KEY = "sushi-smok:cart:v1";
function clean(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const totals = new Map<string, number>();
  for (const item of value)
    if (
      item &&
      typeof item.productId === "string" &&
      productById.has(item.productId) &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0
    )
      totals.set(
        item.productId,
        Math.min(99, (totals.get(item.productId) || 0) + item.quantity),
      );
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
}
interface ShopContext {
  lines: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  add: (id: string, quantity?: number) => void;
  change: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  notify: (message: string) => void;
  toast: string;
}
const Context = createContext<ShopContext | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    setLines(clean(readJson(KEY, [])));
    setReady(true);
    const listener = (event: StorageEvent) => {
      if (event.key === KEY) setLines(clean(readJson(KEY, [])));
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    if (ready && !writeJson(KEY, lines))
      setToast(
        "Koszyk działa, ale przeglądarka nie pozwala go zapisać na później.",
      );
  }, [lines, ready]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  const add = (id: string, quantity = 1) => {
    const p = productById.get(id);
    if (!p?.available || !Number.isFinite(quantity)) return;
    const qty = Math.max(
      1,
      Math.min(orderSettings.maxQuantity, Math.floor(quantity)),
    );
    setLines((old) => {
      const found = old.find((x) => x.productId === id);
      return found
        ? old.map((x) =>
            x.productId === id
              ? { ...x, quantity: Math.min(99, x.quantity + qty) }
              : x,
          )
        : [...old, { productId: id, quantity: qty }];
    });
    notify(`Dodano: ${p.name}`);
  };
  const change = (id: string, quantity: number) =>
    Number.isFinite(quantity) &&
    setLines((old) =>
      quantity <= 0
        ? old.filter((x) => x.productId !== id)
        : old.map((x) =>
            x.productId === id
              ? {
                  ...x,
                  quantity: Math.max(1, Math.min(99, Math.floor(quantity))),
                }
              : x,
          ),
    );
  return (
    <Context.Provider
      value={{
        lines,
        ready,
        count: lines.reduce((n, x) => n + x.quantity, 0),
        subtotal: lines.reduce(
          (n, x) =>
            n + (productById.get(x.productId)?.priceGrosz || 0) * x.quantity,
          0,
        ),
        cartOpen,
        setCartOpen,
        add,
        change,
        remove: (id) =>
          setLines((old) => old.filter((x) => x.productId !== id)),
        clear: () => setLines([]),
        notify,
        toast,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useShop() {
  const value = useContext(Context);
  if (!value) throw new Error("ShopProvider is missing");
  return value;
}
