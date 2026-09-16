import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ShoppingBag,
  X,
  ArrowUpRight,
  Phone,
  Home,
  UtensilsCrossed,
} from "lucide-react";
import Dragon from "../Dragon";
import { restaurant as r } from "../data";
import { Brand, OrderLink, CartItems, EmptyState } from "./components";
import { money } from "./catalog";
import { useShop } from "./ShopProvider";
export function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const elements = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]',
    ),
  ].filter((e) => e.getClientRects().length);
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
export function Sheet({
  open,
  close,
  label,
  children,
  className = "",
}: {
  open: boolean;
  close: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      ref.current?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={trapFocus}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {children}
    </dialog>
  );
}
export default function Shell() {
  const [open, setOpen] = useState(false),
    [scrolled, setScrolled] = useState(false);
  const { count, subtotal, cartOpen, setCartOpen, toast } = useShop();
  const location = useLocation();
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    setOpen(false);
    setCartOpen(false);
  }, [location.pathname, location.hash]);
  return (
    <>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="nav-inner">
          <Brand />
          <Link className="header-location" to="/#kontakt">
            SZCZECIN <span>—</span> POMARAŃCZOWA 7
          </Link>
          <div className="nav-actions">
            <OrderLink />
            <button
              className="header-cart icon-control"
              onClick={() => setCartOpen(true)}
              aria-label={`Otwórz koszyk, liczba produktów: ${count}`}
            >
              <ShoppingBag size={21} />
              <span className="cart-count">{count}</span>
            </button>
            <button
              className="menu-toggle"
              onClick={() => setOpen(true)}
              aria-label="Otwórz menu nawigacji"
              aria-expanded={open}
              aria-controls="mobile-menu"
            >
              <span>MENU</span>
              <span className="menu-glyph" aria-hidden="true">
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
      </header>
      <Sheet
        open={open}
        close={() => setOpen(false)}
        label="Menu nawigacji"
        className="mobile-menu"
      >
        <div className="mobile-menu-inner" id="mobile-menu">
          <div className="mobile-menu-top">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="overlay-brand"
            >
              SUSHI SMOK<span>SZCZECIN</span>
            </Link>
            <button
              className="overlay-close"
              onClick={() => setOpen(false)}
              aria-label="Zamknij menu"
            >
              <span>ZAMKNIJ</span>
              <X />
            </button>
          </div>
          <div className="overlay-body">
            <nav aria-label="Nawigacja główna">
              {[
                ["/menu", "Menu"],
                ["/#o-nas", "O nas"],
                ["/#galeria", "Dobre chwile"],
                ["/#kontakt", "Kontakt"],
              ].map(([to, name], index) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  style={{ "--item-index": index } as React.CSSProperties}
                >
                  <small>0{index + 1}</small>
                  <span>{name}</span>
                  <ArrowUpRight />
                </Link>
              ))}
            </nav>
            <div className="overlay-aside">
              <Dragon className="overlay-dragon" />
              <p className="eyebrow">MAŁE KAWAŁKI. WIELKI SMAK.</p>
              <OrderLink />
              <a
                className="text-link"
                href={r.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram ↗
              </a>
            </div>
          </div>
          <div className="overlay-bottom">
            <a href={r.mapUrl} target="_blank" rel="noopener noreferrer">
              {r.address}
              <br />
              {r.city}
            </a>
            <div>
              <span>Nd. – czw. 12:00 – 21:00</span>
              <span>Pt. – sob. 12:00 – 22:00</span>
            </div>
            <a href={r.phoneHref}>
              <Phone size={16} />
              {r.phone}
            </a>
          </div>
        </div>
      </Sheet>
      <Sheet
        open={cartOpen}
        close={() => setCartOpen(false)}
        label="Twój koszyk"
        className="cart-sheet"
      >
        <div className="sheet-inner">
          <div className="sheet-heading">
            <div>
              <p className="eyebrow">TWÓJ WYBÓR</p>
              <h2>
                Koszyk <small>({count})</small>
              </h2>
            </div>
            <button
              className="icon-control"
              onClick={() => setCartOpen(false)}
              aria-label="Zamknij koszyk"
            >
              <X />
            </button>
          </div>
          {count ? (
            <>
              <div className="sheet-scroll">
                <CartItems />
                <Link
                  to="/menu"
                  className="text-link"
                  onClick={() => setCartOpen(false)}
                >
                  Dobierz coś jeszcze <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="sheet-summary">
                <p>
                  <span>Wartość dań</span>
                  <strong>{money(subtotal)}</strong>
                </p>
                <small>Sposób odbioru wybierzesz w kolejnym kroku.</small>
                <Link className="button button-primary" to="/checkout">
                  Przejdź do kasy <ArrowUpRight size={18} />
                </Link>
                <Link to="/cart" className="cart-page-link">
                  Zobacz cały koszyk
                </Link>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </Sheet>
      <nav className="bottom-nav" aria-label="Nawigacja mobilna">
        <Link
          to="/"
          aria-current={location.pathname === "/" ? "page" : undefined}
        >
          <Home size={20} />
          <span>Start</span>
        </Link>
        <Link
          to="/menu"
          aria-current={
            location.pathname.startsWith("/menu") ? "page" : undefined
          }
        >
          <UtensilsCrossed size={20} />
          <span>Menu</span>
        </Link>
        <button onClick={() => setCartOpen(true)}>
          <span className="bottom-cart-icon">
            <ShoppingBag size={20} />
            <b>{count}</b>
          </span>
          <span>Koszyk</span>
        </button>
        <Link to="/#kontakt">
          <Phone size={20} />
          <span>Kontakt</span>
        </Link>
      </nav>
      <div
        className={`shop-toast ${toast ? "shown" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </>
  );
}
