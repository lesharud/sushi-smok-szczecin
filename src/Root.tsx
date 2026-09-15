import { useEffect, useRef } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import App from "./App";
import Shell from "./shop/Shell";
import { ShopProvider } from "./shop/ShopProvider";
import { AuthProvider } from "./shop/auth";
import { ShopFooter } from "./shop/components";
import { MenuPage, ProductPage, NotFound } from "./pages/Menu";
import CartPage from "./pages/Cart";
import CheckoutPage, { SuccessPage } from "./pages/Checkout";
import { AccountPage, AuthPage, OrdersPage } from "./pages/Account";
import { products, categories } from "./shop/catalog";
export function pageTitle(path: string) {
  if (path === "/") return "Sushi Smok — sushi z charakterem | Szczecin";
  const product = products.find((p) => path === `/menu/danie/${p.slug}`);
  const cat = categories.find((c) => path === `/menu/kategoria/${c.id}`);
  return `${product?.name || cat?.name || { "/menu": "Menu", "/cart": "Koszyk", "/checkout": "Zamówienie testowe", "/account": "Twój profil", "/login": "Logowanie", "/register": "Rejestracja", "/account/orders": "Historia zamówień" }[path] || (path.startsWith("/order-success/") ? "Podsumowanie zamówienia" : "Nie znaleziono strony")} | Sushi Smok`;
}
function RouteEffects() {
  const { pathname, hash, key } = useLocation();
  const navigation = useNavigationType();
  const previous = useRef("");
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    document.title = pageTitle(pathname);
    const isPublic =
      pathname === "/" ||
      pathname === "/menu" ||
      products.some((p) => pathname === `/menu/danie/${p.slug}`) ||
      categories.some((c) => pathname === `/menu/kategoria/${c.id}`);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content =
      isPublic && import.meta.env.VITE_SITE_INDEXABLE === "true"
        ? "index, follow"
        : "noindex, nofollow";
    const canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (canonical) canonical.href = new URL(pathname, canonical.href).href;
    const ogTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    if (ogTitle) ogTitle.content = document.title;
    const ogUrl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:url"]',
    );
    if (ogUrl && canonical) ogUrl.content = canonical.href;
    const betweenCategories =
      /^\/menu(?:\/kategoria\/[^/]+)?$/.test(previous.current) &&
      /^\/menu(?:\/kategoria\/[^/]+)?$/.test(pathname);
    previous.current = pathname;
    const id = requestAnimationFrame(() => {
      if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
      else if (navigation === "POP" && positions.current.has(key))
        window.scrollTo({
          top: positions.current.get(key)!,
          behavior: "instant",
        });
      else if (!betweenCategories)
        window.scrollTo({ top: 0, behavior: "instant" });
    });
    const save = () => positions.current.set(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", save);
    };
  }, [pathname, hash, key, navigation]);
  return null;
}
export default function Root() {
  const { pathname } = useLocation();
  return (
    <ShopProvider>
      <AuthProvider>
        <RouteEffects />
        <Shell />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/menu/kategoria/:category" element={<MenuPage />} />
          <Route
            path="/menu/danie/:slug"
            element={<ProductPage key={pathname} />}
          />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-success/:id" element={<SuccessPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage register />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/orders" element={<OrdersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        {pathname !== "/" && <ShopFooter />}
      </AuthProvider>
    </ShopProvider>
  );
}
