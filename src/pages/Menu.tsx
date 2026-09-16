import { useState, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Search, X, ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { products, categories, money, normalizeSearch } from "../shop/catalog";
import {
  ProductCard,
  ProductImage,
  Quantity,
  EmptyState,
  OrderNotice,
} from "../shop/components";
import { useShop } from "../shop/ShopProvider";
import { restaurant } from "../data";
export function MenuPage() {
  const { category } = useParams();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const selected = category || "zestawy";
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = tabs.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (active && tabs.current)
      tabs.current.scrollLeft =
        active.offsetLeft - tabs.current.offsetLeft - 16;
  }, [selected]);
  const cat = categories.find((c) => c.id === selected);
  if (category && !cat) return <NotFound />;
  const filtered = products.filter(
    (p) =>
      (query || selected === "wszystkie" || p.categoryId === selected) &&
      normalizeSearch(`${p.name} ${p.description}`).includes(
        normalizeSearch(query),
      ),
  );
  return (
    <main id="main" className="shop-main menu-page">
      <div className="shop-container">
        <div className="menu-intro">
          <div>
            <p className="eyebrow">SUSHI SMOK / MENU</p>
            <h1>
              Na mały głód.
              <br />
              <em>Na wielki wieczór.</em>
            </h1>
          </div>
          <p>
            Od jednej rolki do wspólnego stołu.
            <br />
            Znajdź swój ulubiony zestaw.
          </p>
        </div>
        <OrderNotice />
        <div className="catalog-tools">
          <label className="menu-search">
            <Search size={20} />
            <span className="sr-only">Szukaj w menu</span>
            <input
              type="search"
              value={query}
              placeholder="Na co masz ochotę?"
              onChange={(e) =>
                setParams(e.target.value ? { q: e.target.value } : {}, {
                  replace: true,
                })
              }
            />
            {query && (
              <button
                type="button"
                onClick={() => setParams({}, { replace: true })}
                aria-label="Wyczyść wyszukiwanie"
              >
                <X size={18} />
              </button>
            )}
          </label>
          <nav ref={tabs} className="category-tabs" aria-label="Kategorie menu">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/menu/kategoria/${c.id}`}
                aria-current={!query && selected === c.id ? "page" : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="catalog-heading">
          <h2>{query ? "Wyniki wyszukiwania" : cat?.name}</h2>
          <span>
            {filtered.length} {filtered.length === 1 ? "pozycja" : "pozycji"} w
            menu
          </span>
        </div>
        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nie znaleźliśmy tego smaku."
            text="Spróbuj innej nazwy lub składnika. Możesz też wrócić do zestawów."
          />
        )}
        <p className="catalog-source">
          Menu i ceny na podstawie oferty Sushi Smok na Wolt z 14.09.2026.
          Dostępność i ceny mogą się zmienić. Informacje o alergenach:{" "}
          <a href={restaurant.phoneHref}>{restaurant.phone}</a>.
        </p>
      </div>
    </main>
  );
}
export function ProductPage() {
  const { slug } = useParams();
  const p = products.find((x) => x.slug === slug);
  const [quantity, setQuantity] = useState(1);
  const { add } = useShop();
  if (!p) return <NotFound />;
  const category = categories.find((c) => c.id === p.categoryId);
  return (
    <main id="main" className="shop-main product-page">
      <div className="shop-container">
        <Link className="back-link" to={`/menu/kategoria/${p.categoryId}`}>
          <ArrowLeft size={17} />
          Wróć do menu
        </Link>
        <div className="product-detail">
          <div className="detail-visual">
            <ProductImage product={p} eager />
          </div>
          <div className="detail-copy">
            <p className="eyebrow">{category?.name} / SUSHI SMOK</p>
            <h1>{p.name}</h1>
            <div className="detail-meta">
              <strong>{money(p.priceGrosz)}</strong>
              {p.pieces && <span>{p.pieces} szt.</span>}
              {p.weightGrams && <span>{p.weightGrams} g</span>}
            </div>
            <h2>Co znajdziesz w środku</h2>
            <p className="detail-description">
              {p.description || "Zapytaj nas o szczegółowy skład tego dania."}
            </p>
            {p.ingredients && <p>{p.ingredients.join(", ")}</p>}
            <div className="allergen-note">
              <h3>Masz pytanie o skład lub alergeny?</h3>
              <p>
                {p.allergens
                  ? p.allergens.join(", ")
                  : "Przed zamówieniem skontaktuj się z restauracją, aby potwierdzić skład i informacje o alergenach."}
              </p>
              <a href={restaurant.phoneHref}>{restaurant.phone} ↗</a>
            </div>
            <div className="detail-actions">
              <Quantity value={quantity} onChange={setQuantity} name={p.name} />
              <button
                className="button button-primary"
                disabled={!p.available}
                onClick={() => add(p.id, quantity)}
              >
                <Plus size={19} />
                {p.available ? "Dodaj do koszyka" : "Niedostępne"}
                <span>{money(p.priceGrosz * quantity)}</span>
              </button>
            </div>
            <p className="fine-print">
              Podana cena pochodzi z menu Wolt. Aktualną cenę i dostępność
              sprawdzamy podczas wysyłania zamówienia.
            </p>
          </div>
        </div>
        <section className="related-products">
          <div className="catalog-heading">
            <h2>Jeszcze jeden dobry wybór.</h2>
            <Link className="text-link" to="/menu">
              Całe menu <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="product-rail">
            {products
              .filter((x) => x.categoryId === p.categoryId && x.id !== p.id)
              .slice(0, 4)
              .map((x) => (
                <ProductCard product={x} key={x.id} />
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
export function NotFound() {
  return (
    <main id="main" className="shop-main">
      <EmptyState
        title="Nie ma takiej strony."
        text="Wróć do menu i znajdź coś dla siebie."
      />
    </main>
  );
}
