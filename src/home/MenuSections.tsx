import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowLeft, ArrowRight, Plus, Check } from "lucide-react";
import { categories, products, money } from "../shop/catalog";
import { useShop } from "../shop/ShopProvider";
import { ProductImage } from "../shop/components";
import type { Product } from "../shop/types";
import { restaurant } from "../data";
import { useEditorialTransition } from "./useEditorialTransition";

function HomeProduct({
  product,
  editorial = false,
}: {
  product: Product;
  editorial?: boolean;
}) {
  const { add } = useShop();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const description =
    product.ingredients?.join(" • ") ||
    product.description
      .replace(/^\d+\s*szt\.?\s*/i, "")
      .replace(/\n\s*/g, " ")
      .trim();
  return (
    <article
      className={`home-product ${editorial ? "home-product-editorial" : ""}`}
    >
      <Link
        to={`/menu/danie/${product.slug}`}
        className="home-product-photo"
        aria-label={`Zobacz: ${product.name}`}
      >
        <ProductImage product={product} />
        {product.pieces && (
          <span className="home-pieces">{product.pieces} szt.</span>
        )}
        <span className="home-photo-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="home-product-body">
        <h3>
          <Link
            to={`/menu/danie/${product.slug}`}
            className="home-product-title"
          >
            {product.name}
          </Link>
        </h3>
        <div className="home-composition">
          <span className="home-field-label">
            {product.categoryId === "zestawy" ? "W ZESTAWIE" : "SKŁAD"}
          </span>
          <p>{description || "Zapytaj nas o szczegółowy skład."}</p>
        </div>
        <div className="home-product-meta">
          <span>
            {product.pieces ? `${product.pieces} szt.` : "Porcja"}
            {product.weightGrams ? ` · ${product.weightGrams} g` : ""}
          </span>
          <Link to={`/menu/danie/${product.slug}`}>
            Szczegóły <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="home-product-purchase">
          <strong>{money(product.priceGrosz)}</strong>
          <button
            className={`home-add ${added ? "is-added" : ""}`}
            disabled={!product.available}
            aria-label={`Dodaj do koszyka: ${product.name}`}
            onClick={() => {
              add(product.id);
              setAdded(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setAdded(false), 1400);
            }}
          >
            {added ? <Check size={16} /> : <Plus size={16} />}
            <span>
              {!product.available
                ? "Niedostępne"
                : added
                  ? "Dodano"
                  : "Dodaj do koszyka"}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
const discoveryCategories = [
  "filadelfia",
  "smok",
  "futomaki",
  "maki-roll",
  "nigiri",
  "zestawy",
]
  .map((id) => categories.find((c) => c.id === id)!)
  .filter(Boolean);
export function MenuDiscovery() {
  const transition = useEditorialTransition({
    category: discoveryCategories[0].id,
    page: 0,
  });
  const { category, page } = transition.value;
  function navigate(nextCategory: string, nextPage: number) {
    if (nextCategory === category && nextPage === page) return;
    const next = products
      .filter((p) => p.categoryId === nextCategory)
      .slice(nextPage * 2, nextPage * 2 + 2);
    void transition.change(
      { category: nextCategory, page: nextPage },
      nextCategory === category
        ? nextPage < page
          ? -1
          : 1
        : discoveryCategories.findIndex((c) => c.id === nextCategory) <
            discoveryCategories.findIndex((c) => c.id === category)
          ? -1
          : 1,
      next.flatMap((p) => (p.image ? [p.image] : [])),
    );
  }
  const filtered = products.filter((p) => p.categoryId === category);
  const start = page * 2;
  const shown = filtered.slice(start, start + 2);
  const cat = categories.find((c) => c.id === category)!;
  return (
    <section
      className="menu-discovery shop-container"
      id="menu"
      aria-labelledby="menu-title"
    >
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">
            <span>01 /</span> NASZE MENU
          </p>
          <h2 id="menu-title">
            Znajdź swój <em>smak.</em>
          </h2>
        </div>
        <div>
          <p>
            Jedna rolka czy cały zestaw?
            <br />
            Wybierz, poznaj skład, dodaj do koszyka.
          </p>
          <Link className="text-link" to="/menu">
            Zobacz pełne menu <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
      <div className="discovery-navigation">
        <div
          className="discovery-tabs"
          role="group"
          aria-label="Kategorie w naszym menu"
        >
          {discoveryCategories.map((c) => (
            <button
              key={c.id}
              aria-pressed={category === c.id}
              disabled={transition.busy}
              onClick={(e) => {
                navigate(c.id, 0);
                e.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                  behavior: "instant",
                });
              }}
            >
              {c.name}
              <span>
                {products.filter((p) => p.categoryId === c.id).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="discovery-content"
        {...transition.motion}
        aria-busy={transition.busy}
      >
        <div className="discovery-status">
          <h3>{cat.name}</h3>
          <span role="status">
            {start + 1}–{Math.min(start + 2, filtered.length)} z{" "}
            {filtered.length} pozycji
          </span>
          <div className="home-arrows">
            <button
              className="icon-control"
              disabled={transition.busy || page === 0}
              onClick={() => navigate(category, page - 1)}
              aria-label="Poprzednie dania"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-control"
              disabled={transition.busy || start + 2 >= filtered.length}
              onClick={() => navigate(category, page + 1)}
              aria-label="Następne dania"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="discovery-grid">
          {shown.map((p) => (
            <HomeProduct key={p.id} product={p} />
          ))}
        </div>
      </div>
      <div className="discovery-footer">
        <p>
          Ceny według menu Wolt. Informacje o alergenach:{" "}
          <a href={restaurant.phoneHref}>{restaurant.phone}</a>.
        </p>
        <Link className="text-link" to={`/menu/kategoria/${category}`}>
          Cała kategoria: {cat.name} <ArrowUpRight size={16} />
        </Link>
      </div>
    </section>
  );
}
export function SharingSets() {
  const rail = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [firstVisible, setFirstVisible] = useState(0);
  const sets = products
    .filter((p) => p.categoryId === "zestawy" && p.image)
    .slice(0, 5);
  const scrolling = useRef(false);
  const frame = useRef(0);
  const [moving, setMoving] = useState(false);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function stopScroll() {
    cancelAnimationFrame(frame.current);
    scrolling.current = false;
    setMoving(false);
    rail.current?.style.removeProperty("scroll-snap-type");
  }
  function move(direction: number) {
    const el = rail.current;
    if (!el || scrolling.current) return;
    const card = el.firstElementChild as HTMLElement;
    const gap = parseFloat(getComputedStyle(el).columnGap);
    const start = el.scrollLeft;
    const target = Math.max(
      0,
      Math.min(
        el.scrollWidth - el.clientWidth,
        start + direction * (card.offsetWidth + gap),
      ),
    );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.scrollLeft = target;
      return;
    }
    scrolling.current = true;
    setMoving(true);
    el.style.scrollSnapType = "none";
    const began = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - began) / 720);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      el!.scrollLeft = start + (target - start) * ease;
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else stopScroll();
    }
    frame.current = requestAnimationFrame(tick);
  }
  return (
    <section
      className="home-more sharing-section shop-container"
      aria-labelledby="sharing-title"
    >
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">WIĘCEJ DO PODZIELENIA</p>
          <h2 id="sharing-title">Wieczór w dobrym towarzystwie.</h2>
        </div>
        <Link className="text-link" to="/menu/kategoria/zestawy">
          Wszystkie zestawy <ArrowUpRight size={18} />
        </Link>
      </div>
      <div
        className="sharing-rail"
        data-moving={moving}
        aria-busy={moving}
        ref={rail}
        onTouchStart={stopScroll}
        onWheel={stopScroll}
        onKeyDown={stopScroll}
        role="region"
        aria-label="Zestawy do podzielenia"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement;
          const stride =
            card.offsetWidth + parseFloat(getComputedStyle(el).columnGap);
          setFirstVisible(Math.round(el.scrollLeft / stride));
          setProgress(
            el.scrollWidth > el.clientWidth
              ? el.scrollLeft / (el.scrollWidth - el.clientWidth)
              : 0,
          );
        }}
      >
        {sets.map((p) => (
          <HomeProduct key={p.id} product={p} editorial />
        ))}
      </div>
      <div className="sharing-controls">
        <span
          className="sharing-index"
          role="status"
          aria-label="Pozycja zestawu"
        >
          {String(firstVisible + 1).padStart(2, "0")}{" "}
          <i>/ {String(sets.length).padStart(2, "0")}</i>
        </span>
        <p>
          Na wspólny stół. <span>Przesuń, aby zobaczyć więcej.</span>
        </p>
        <div className="sharing-progress" aria-hidden="true">
          <i style={{ transform: `translateX(${progress * 200}%)` }} />
        </div>
        <div className="home-arrows">
          <button
            className="icon-control"
            disabled={moving || progress < 0.01}
            onClick={() => move(-1)}
            aria-label="Poprzednie zestawy"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="icon-control"
            disabled={moving || progress > 0.99}
            onClick={() => move(1)}
            aria-label="Następne zestawy"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
