import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CartItems, EmptyState, OrderNotice } from "../shop/components";
import { useShop } from "../shop/ShopProvider";
import { money } from "../shop/catalog";
export default function CartPage() {
  const { count, subtotal, ready } = useShop();
  return (
    <main id="main" className="shop-main cart-page">
      <div className="shop-container">
        <Link to="/menu" className="back-link">
          <ArrowLeft size={17} />
          Wróć do menu
        </Link>
        <div className="page-heading">
          <p className="eyebrow">TWÓJ WYBÓR / SUSHI SMOK</p>
          <h1>
            Dobry apetyt.
            <br />
            <em>Dobry koszyk.</em>
          </h1>
        </div>
        {!ready ? (
          <p role="status">Wczytywanie koszyka…</p>
        ) : !count ? (
          <EmptyState />
        ) : (
          <div className="cart-layout">
            <CartItems />
            <aside className="order-summary">
              <p className="eyebrow">PODSUMOWANIE</p>
              <h2>Wszystko, co lubisz.</h2>
              <div className="sum-row">
                <span>Wartość dań ({count})</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <p>
                Koszt dostawy wymaga potwierdzenia. Sposób odbioru wybierzesz w
                kolejnym kroku.
              </p>
              <Link
                to="/checkout"
                className="button button-primary cart-checkout"
              >
                Przejdź do kasy <ArrowUpRight size={18} />
              </Link>
              <OrderNotice />
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
