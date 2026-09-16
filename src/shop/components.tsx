import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, ArrowUpRight, Trash2, ShoppingBag } from "lucide-react";
import Dragon from "../Dragon";
import { restaurant } from "../data";
import { money, productById } from "./catalog";
import { useShop } from "./ShopProvider";
import type { Product } from "./types";
export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${footer ? "brand-footer" : ""}`}
      aria-label="Sushi Smok — strona główna"
    >
      <Dragon className="brand-dragon" />
      <span className="brand-words">
        Sushi<span>Smok</span>
      </span>
    </Link>
  );
}
export function OrderLink({
  className = "",
  label = "Zamów online",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link className={`button button-primary ${className}`} to="/menu">
      {label}
      <ArrowUpRight size={18} />
    </Link>
  );
}
export function ProductImage({
  product,
  eager = false,
}: {
  product: Product;
  eager?: boolean;
}) {
  return product.image ? (
    <img
      src={product.image}
      alt={product.name}
      width="800"
      height="600"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  ) : (
    <div className="product-placeholder">
      <Dragon />
      <span>Zdjęcie wkrótce</span>
    </div>
  );
}
export function Quantity({
  value,
  onChange,
  name = "dania",
}: {
  value: number;
  onChange: (value: number) => void;
  name?: string;
}) {
  return (
    <div className="quantity" role="group" aria-label={`Liczba: ${name}`}>
      <button
        type="button"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label={`Zmniejsz liczbę: ${name}`}
      >
        <Minus size={16} />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        disabled={value >= 99}
        onClick={() => onChange(value + 1)}
        aria-label={`Zwiększ liczbę: ${name}`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const { add } = useShop();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <article className="product-card">
      <Link
        className="product-visual"
        to={`/menu/danie/${product.slug}`}
        aria-label={`Zobacz: ${product.name}`}
      >
        <ProductImage product={product} />
        {product.pieces && (
          <span className="product-pieces">{product.pieces} szt.</span>
        )}
        <span className="product-arrow">
          <ArrowUpRight />
        </span>
      </Link>
      <div className="product-copy">
        <h3>
          <Link to={`/menu/danie/${product.slug}`}>{product.name}</Link>
        </h3>
        <p>{product.description || "Poznaj tę pozycję z naszego menu."}</p>
        <div className="product-bottom">
          <strong>{money(product.priceGrosz)}</strong>
          <button
            className={`add-button ${added ? "is-added" : ""}`}
            disabled={!product.available}
            onClick={() => {
              add(product.id);
              setAdded(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setAdded(false), 1400);
            }}
            aria-label={`Dodaj do koszyka: ${product.name}`}
          >
            <Plus size={18} />
            <span>
              {product.available ? (added ? "Dodano" : "Dodaj") : "Niedostępne"}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
export function EmptyState({
  title = "Twój koszyk czeka na coś dobrego.",
  text = "Wybierz rolki lub zestaw i ułóż zamówienie po swojemu.",
}: {
  title?: string;
  text?: string;
}) {
  const { setCartOpen } = useShop();
  return (
    <div className="empty-state">
      <ShoppingBag size={42} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link
        className="button button-primary"
        to="/menu"
        onClick={() => setCartOpen(false)}
      >
        Odkryj menu <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}
export function CartItems() {
  const { lines, change, remove, setCartOpen } = useShop();
  return (
    <ul className="cart-items">
      {lines.map((line) => {
        const p = productById.get(line.productId)!;
        return (
          <li key={p.id}>
            <Link
              to={`/menu/danie/${p.slug}`}
              onClick={() => setCartOpen(false)}
              className="cart-image"
            >
              <ProductImage product={p} />
            </Link>
            <div className="cart-item-copy">
              <Link to={`/menu/danie/${p.slug}`}>{p.name}</Link>
              <span>{money(p.priceGrosz)} / porcja</span>
              <Quantity
                value={line.quantity}
                name={p.name}
                onChange={(q) => change(p.id, q)}
              />
            </div>
            <div className="cart-item-end">
              <strong>{money(p.priceGrosz * line.quantity)}</strong>
              <button
                type="button"
                className="icon-control"
                onClick={() => remove(p.id)}
                aria-label={`Usuń: ${p.name}`}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
export function OrderNotice() {
  return (
    <aside className="demo-notice">
      <span className="status-dot" />
      <p>
        <strong>Zamów bez konta.</strong> Dostępność zamawiania sprawdzisz w
        kasie. Możesz też{" "}
        <a href={restaurant.orderUrl} target="_blank" rel="noopener noreferrer">
          zamówić na Wolt ↗
        </a>
        .
      </p>
    </aside>
  );
}
export function ShopFooter() {
  return (
    <footer className="shop-footer">
      <Brand />
      <p>Pomarańczowa 7 · Szczecin</p>
      <a href={restaurant.phoneHref}>{restaurant.phone}</a>
      <a href={restaurant.instagram} target="_blank" rel="noopener noreferrer">
        Instagram ↗
      </a>
      <span>© {new Date().getFullYear()} Sushi Smok</span>
    </footer>
  );
}
