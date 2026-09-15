import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import { useShop } from "../shop/ShopProvider";
import { money, productById } from "../shop/catalog";
import { DemoNotice, EmptyState } from "../shop/components";
import { getLocalOrder, orderRepository, readProfile } from "../shop/orders";
import { restaurant } from "../data";
import type { Order } from "../shop/types";
type Fields = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street: string;
  building: string;
  apartment: string;
  postalCode: string;
  city: string;
};
const initial: Fields = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  street: "",
  building: "",
  apartment: "",
  postalCode: "",
  city: "Szczecin",
};
export default function CheckoutPage() {
  const { lines, count, subtotal, clear, ready } = useShop();
  const navigate = useNavigate();
  const [fields, setFields] = useState(initial),
    [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup"),
    [payment, setPayment] = useState<"cash" | "card">("cash"),
    [notes, setNotes] = useState(""),
    [time, setTime] = useState(""),
    [remember, setRemember] = useState(false),
    [ack, setAck] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const lock = useRef(false),
    key = useRef("");
  const [hasSaved, setHasSaved] = useState(false);
  useEffect(() => setHasSaved(Boolean(readProfile().firstName)), []);
  const update = (name: keyof Fields, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  };
  function input(
    name: keyof Fields,
    label: string,
    autocomplete: string,
    type = "text",
    required = true,
  ) {
    return (
      <label className="form-field">
        <span id={`${name}-label`}>
          {label}
          {!required && " (opcjonalnie)"}
        </span>
        <input
          id={name}
          aria-labelledby={`${name}-label`}
          name={name}
          value={fields[name]}
          autoComplete={autocomplete}
          type={type}
          required={required}
          maxLength={name === "phone" ? 24 : 150}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          onChange={(e) => update(name, e.target.value)}
        />
        {errors[name] && (
          <small className="field-error" id={`${name}-error`}>
            {errors[name]}
          </small>
        )}
      </label>
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const next: Record<string, string> = {};
    for (const name of [
      "firstName",
      "lastName",
      "phone",
      "email",
      ...(fulfillment === "delivery"
        ? ["street", "building", "postalCode", "city"]
        : []),
    ] as (keyof Fields)[])
      if (!fields[name].trim()) next[name] = "Uzupełnij to pole.";
    if (fields.phone && !/^\+?[\d\s()-]{9,24}$/.test(fields.phone.trim()))
      next.phone = "Podaj poprawny numer telefonu.";
    if (fields.phone.replace(/\D/g, "").length < 9)
      next.phone = "Podaj numer zawierający co najmniej 9 cyfr.";
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
      next.email = "Podaj poprawny adres e-mail.";
    if (fulfillment === "delivery" && !/^\d{2}-\d{3}$/.test(fields.postalCode))
      next.postalCode = "Podaj kod w formacie 70-781.";
    if (
      time &&
      (!Number.isFinite(new Date(time).getTime()) ||
        new Date(time).getTime() < Date.now())
    )
      next.time = "Wybierz przyszłą datę i godzinę.";
    if (!ack) next.ack = "Potwierdź, że rozumiesz tryb testowy.";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document.getElementById(Object.keys(next)[0])?.focus(),
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      key.current ||= crypto.randomUUID();
      const order = await orderRepository.submit(
        lines,
        {
          customer: {
            firstName: fields.firstName.trim(),
            lastName: fields.lastName.trim(),
            phone: fields.phone.trim(),
            email: fields.email.trim(),
          },
          fulfillment,
          address:
            fulfillment === "delivery"
              ? {
                  id: crypto.randomUUID(),
                  label: "Adres dostawy",
                  street: fields.street.trim(),
                  building: fields.building.trim(),
                  apartment: fields.apartment.trim(),
                  postalCode: fields.postalCode,
                  city: fields.city.trim(),
                }
              : null,
          notes,
          preferredTime: time || "Jak najszybciej",
          payment,
          remember,
        },
        key.current,
      );
      clear();
      navigate(`/order-success/${order.id}`, { replace: true });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać zamówienia. Spróbuj ponownie.",
      );
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main id="main" className="shop-main checkout-page">
      <div className="shop-container">
        <Link to="/cart" className="back-link">
          <ArrowLeft size={17} />
          Wróć do koszyka
        </Link>
        <div className="page-heading">
          <p className="eyebrow">JUŻ PRAWIE / SUSHI SMOK</p>
          <h1>
            Ostatni krok.
            <br />
            <em>Twój wieczór.</em>
          </h1>
        </div>
        {!ready ? (
          <p role="status">Wczytywanie koszyka…</p>
        ) : !count ? (
          <EmptyState />
        ) : (
          <>
            <DemoNotice />
            <form className="checkout-layout" onSubmit={submit} noValidate>
              <div className="checkout-fields">
                <fieldset>
                  <legend>
                    <span>01</span> Jak odbierzesz?
                  </legend>
                  <div className="choice-grid">
                    <label
                      className={
                        fulfillment === "pickup" ? "choice selected" : "choice"
                      }
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="pickup"
                        checked={fulfillment === "pickup"}
                        onChange={() => setFulfillment("pickup")}
                      />
                      <ShoppingBag />
                      <span>
                        Odbiór osobisty<small>Pomarańczowa 7, Szczecin</small>
                      </span>
                    </label>
                    <label
                      className={
                        fulfillment === "delivery"
                          ? "choice selected"
                          : "choice"
                      }
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="delivery"
                        checked={fulfillment === "delivery"}
                        onChange={() => setFulfillment("delivery")}
                      />
                      <MapPin />
                      <span>
                        Dostawa<small>Koszt i obszar do potwierdzenia</small>
                      </span>
                    </label>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>
                    <span>02</span> Twoje dane
                  </legend>
                  {hasSaved && (
                    <button
                      className="text-link saved-fill"
                      type="button"
                      onClick={() => {
                        const p = readProfile();
                        const a = p.addresses[0];
                        setFields((f) => ({ ...f, ...p, ...(a || {}) }));
                      }}
                    >
                      Użyj danych zapisanych na tym urządzeniu
                    </button>
                  )}
                  <div className="form-grid">
                    {input("firstName", "Imię", "given-name")}
                    {input("lastName", "Nazwisko", "family-name")}
                    {input("phone", "Telefon", "tel", "tel")}
                    {input("email", "E-mail", "email", "email")}
                  </div>
                  <p className="fine-print">Nie musisz zakładać konta.</p>
                </fieldset>
                {fulfillment === "delivery" && (
                  <fieldset>
                    <legend>
                      <span>03</span> Adres dostawy
                    </legend>
                    <div className="form-grid">
                      {input("street", "Ulica", "address-line1")}
                      {input("building", "Numer domu", "address-line2")}
                      {input(
                        "apartment",
                        "Numer mieszkania",
                        "off",
                        "text",
                        false,
                      )}
                      {input("postalCode", "Kod pocztowy", "postal-code")}
                      {input("city", "Miasto", "address-level2")}
                    </div>
                  </fieldset>
                )}
                <fieldset>
                  <legend>
                    <span>{fulfillment === "delivery" ? "04" : "03"}</span>{" "}
                    Ostatnie szczegóły
                  </legend>
                  <label className="form-field">
                    <span>Preferowana data i godzina (opcjonalnie)</span>
                    <input
                      id="time"
                      type="datetime-local"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      aria-invalid={Boolean(errors.time)}
                      aria-describedby="time-help"
                    />
                    <small id="time-help">
                      {errors.time ||
                        "Pozostaw puste, jeśli chcesz zamówić jak najszybciej. Termin wymaga potwierdzenia restauracji."}
                    </small>
                  </label>
                  <label className="form-field">
                    <span>Uwagi do zamówienia (opcjonalnie)</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Co powinniśmy wiedzieć?"
                    />
                  </label>
                  <label className="form-field">
                    <span>Preferowana płatność — wybór testowy</span>
                    <select
                      value={payment}
                      onChange={(e) =>
                        setPayment(e.target.value as "cash" | "card")
                      }
                    >
                      <option value="cash">Gotówka przy odbiorze</option>
                      <option value="card">Karta przy odbiorze</option>
                    </select>
                    <small>
                      Dostępne metody wymagają potwierdzenia w restauracji. Nie
                      pobieramy danych karty.
                    </small>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>
                      Zapisz moje dane i adres na tym urządzeniu do następnego
                      zamówienia. Nie wybieraj na współdzielonym urządzeniu.
                    </span>
                  </label>
                </fieldset>
              </div>
              <aside className="order-summary checkout-summary">
                <p className="eyebrow">TWÓJ KOSZYK</p>
                <h2>Dobrze wybrane.</h2>
                <ul className="receipt-items">
                  {lines.map((line) => {
                    const p = productById.get(line.productId)!;
                    return (
                      <li key={p.id}>
                        <span>
                          {line.quantity} × {p.name}
                        </span>
                        <strong>{money(p.priceGrosz * line.quantity)}</strong>
                      </li>
                    );
                  })}
                </ul>
                <div className="sum-row">
                  <span>Wartość dań</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div className="sum-row">
                  <span>
                    {fulfillment === "pickup" ? "Odbiór osobisty" : "Dostawa"}
                  </span>
                  <span>
                    {fulfillment === "pickup" ? "0,00 zł" : "Do potwierdzenia"}
                  </span>
                </div>
                <div className="sum-row total">
                  <span>
                    {fulfillment === "pickup" ? "Razem" : "Razem za dania"}
                  </span>
                  <strong>{money(subtotal)}</strong>
                </div>
                {fulfillment === "delivery" && (
                  <p className="fine-print">
                    Końcowa kwota zależy od kosztu dostawy. Podana wartość
                    obejmuje wyłącznie dania.
                  </p>
                )}
                <label className="check-field">
                  <input
                    id="ack"
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    aria-invalid={Boolean(errors.ack)}
                    aria-describedby={errors.ack ? "ack-error" : undefined}
                  />
                  <span>
                    Rozumiem, że to zamówienie testowe, które nie trafi do
                    restauracji.
                  </span>
                </label>
                {errors.ack && (
                  <p className="field-error" id="ack-error">
                    {errors.ack}
                  </p>
                )}
                {failure && (
                  <p role="alert" className="field-error">
                    {failure}
                  </p>
                )}
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Zapisywanie…" : "Potwierdź zamówienie testowe"}
                  <ArrowUpRight size={18} />
                </button>
              </aside>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
export function SuccessPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | undefined>(),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setOrder(getLocalOrder(id || ""));
    setLoaded(true);
  }, [id]);
  if (!loaded)
    return (
      <main id="main" className="shop-main">
        <p className="shop-container" role="status">
          Wczytywanie podsumowania…
        </p>
      </main>
    );
  if (!order)
    return (
      <main id="main" className="shop-main">
        <EmptyState
          title="Nie znaleźliśmy tego podsumowania."
          text="Zamówienia testowe są dostępne na urządzeniu, na którym je zapisano."
        />
      </main>
    );
  return (
    <main id="main" className="shop-main">
      <div className="shop-container success-container">
        <div className="success-mark">
          <Check size={34} />
        </div>
        <p className="eyebrow">{order.number}</p>
        <h1>
          Zapisane.
          <br />
          <em>To była próba.</em>
        </h1>
        <DemoNotice />
        <div className="receipt">
          <h2>Twoje podsumowanie</h2>
          <ul className="receipt-items">
            {order.items.map((i) => (
              <li key={i.productId}>
                <span>
                  {i.quantity} × {i.name}
                </span>
                <strong>{money(i.quantity * i.unitPriceGrosz)}</strong>
              </li>
            ))}
          </ul>
          <div className="sum-row total">
            <span>{order.totalGrosz === null ? "Wartość dań" : "Razem"}</span>
            <strong>{money(order.totalGrosz ?? order.subtotalGrosz)}</strong>
          </div>
          <p>
            <strong>
              {order.fulfillment === "pickup" ? "Odbiór osobisty" : "Dostawa"}
            </strong>
            <br />
            {order.fulfillment === "pickup"
              ? "Pomarańczowa 7, Szczecin"
              : "Koszt dostawy do potwierdzenia."}
          </p>
          {order.customer && (
            <p>
              {order.customer.firstName} {order.customer.lastName}
              <br />
              {order.customer.phone}
              <br />
              {order.customer.email}
            </p>
          )}
          {order.address && (
            <p>
              {order.address.street} {order.address.building}
              {order.address.apartment ? ` / ${order.address.apartment}` : ""}
              <br />
              {order.address.postalCode} {order.address.city}
            </p>
          )}
          <p>
            Preferowany termin:{" "}
            {order.preferredTime === "Jak najszybciej"
              ? order.preferredTime
              : order.preferredTime.replace("T", " ")}
          </p>
          <p>
            Płatność testowa: {order.payment === "cash" ? "gotówka" : "karta"}{" "}
            przy odbiorze.
          </p>
          {order.notes && <p>Uwagi: {order.notes}</p>}
          <p className="fine-print">
            Nie wysłaliśmy potwierdzenia e-mailem. Restauracja nie otrzymała
            tego zamówienia.
          </p>
        </div>
        <a
          href={restaurant.orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button button-primary"
        >
          Zamów naprawdę na Wolt <ArrowUpRight size={18} />
        </a>
        <Link to="/account/orders" className="text-link">
          Historia próbnych zamówień <ArrowUpRight size={17} />
        </Link>
      </div>
    </main>
  );
}
