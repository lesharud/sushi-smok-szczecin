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
import { EmptyState } from "../shop/components";
import {
  getOrder,
  orderRepository,
  orderSettings,
  pendingAttempt,
  finishAttempt,
} from "../shop/orders";
import { restaurant } from "../data";
import type { Order } from "../shop/types";

const initial = {
  name: "",
  phone: "",
  street: "",
  building: "",
  apartment: "",
  postalCode: "",
  city: "Szczecin",
};
type Fields = typeof initial;
type Settings = Awaited<ReturnType<typeof orderSettings>>;
export default function CheckoutPage() {
  const { lines, complete, ready } = useShop();
  const navigate = useNavigate();
  const [fields, setFields] = useState(initial);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(
    "pickup",
  );
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const lock = useRef(false);
  const activeLines = (retry && pendingAttempt()?.request.items) || lines;
  const subtotal = activeLines.reduce(
    (sum, line) =>
      sum + (productById.get(line.productId)?.priceGrosz || 0) * line.quantity,
    0,
  );
  const deliveryFee = fulfillment === "pickup" ? 0 : settings?.deliveryFeeGrosz;
  const loadSettings = () => {
    setSettingsError("");
    orderSettings()
      .then(setSettings)
      .catch(() =>
        setSettingsError(
          "Zamówienia online są chwilowo niedostępne. Spróbuj ponownie lub zadzwoń do nas.",
        ),
      );
  };
  useEffect(() => {
    loadSettings();
    const attempt = pendingAttempt();
    if (attempt) {
      const input = attempt.request;
      setFields({ ...initial, ...input.customer, ...(input.address || {}) });
      setFulfillment(input.fulfillment);
      setNotes(input.notes);
      setRetry(true);
      if (input.preferredTime) {
        const date = new Date(input.preferredTime);
        if (Number.isFinite(date.getTime()))
          setTime(
            new Date(date.getTime() - date.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16),
          );
      }
    }
  }, []);
  function input(
    name: keyof Fields,
    label: string,
    autoComplete: string,
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
          name={name}
          value={fields[name]}
          autoComplete={autoComplete}
          type={type}
          required={required}
          maxLength={
            name === "phone"
              ? 24
              : name === "building" || name === "apartment"
                ? 30
                : name === "name" || name === "city"
                  ? 100
                  : 150
          }
          aria-labelledby={`${name}-label`}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          onChange={(event) => {
            setFields((old) => ({ ...old, [name]: event.target.value }));
            setErrors((old) => ({ ...old, [name]: "" }));
          }}
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
    if (!pendingAttempt()) {
      const next: Record<string, string> = {};
      if (fields.name.trim().length < 2 || !/\p{L}/u.test(fields.name))
        next.name = "Podaj swoje imię.";
      if (
        !/^\+?[\d ()-]{9,24}$/.test(fields.phone.trim()) ||
        !/^\+?\d{9,15}$/.test(fields.phone.replace(/[ ()-]/g, ""))
      )
        next.phone = "Podaj poprawny numer telefonu (9–15 cyfr).";
      if (fulfillment === "delivery") {
        for (const key of ["street", "building", "postalCode", "city"] as const)
          if (!fields[key].trim()) next[key] = "Uzupełnij to pole.";
        if (!/^\d{2}-\d{3}$/.test(fields.postalCode))
          next.postalCode = "Podaj kod w formacie 70-781.";
      }
      if (
        time &&
        (!Number.isFinite(new Date(time).getTime()) ||
          new Date(time).getTime() <= Date.now())
      )
        next.time = "Wybierz przyszłą datę i godzinę.";
      setErrors(next);
      if (Object.keys(next).length) {
        requestAnimationFrame(() =>
          document.getElementById(Object.keys(next)[0])?.focus(),
        );
        return;
      }
    }
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const result = await orderRepository.submit(lines, {
        customer: { name: fields.name.trim(), phone: fields.phone.trim() },
        fulfillment,
        address:
          fulfillment === "delivery"
            ? {
                street: fields.street.trim(),
                building: fields.building.trim(),
                apartment: fields.apartment.trim(),
                postalCode: fields.postalCode.trim(),
                city: fields.city.trim(),
              }
            : null,
        notes: notes.trim(),
        preferredTime: time ? new Date(time).toISOString() : null,
      });
      complete(result.submitted);
      navigate(`/order-success/${result.key}`, {
        replace: true,
        state: { order: result.order },
      });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać zamówienia. Spróbuj ponownie.",
      );
      setRetry(Boolean(pendingAttempt()));
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
        ) : !activeLines.length ? (
          <EmptyState />
        ) : (
          <>
            {settingsError && (
              <div className="demo-notice" role="alert">
                <p>
                  {settingsError}{" "}
                  <a href={restaurant.phoneHref}>{restaurant.phone}</a>
                </p>
                <button className="text-link" onClick={loadSettings}>
                  Spróbuj ponownie
                </button>
              </div>
            )}
            {settings && !settings.orderingEnabled && (
              <p role="status">
                Zamówienia online są teraz wstrzymane. Zadzwoń:{" "}
                <a href={restaurant.phoneHref}>{restaurant.phone}</a>.
              </p>
            )}
            {retry && (
              <p role="status" className="demo-notice">
                Sprawdzamy poprzednią próbę. Ponowienie wyśle te same dane i nie
                utworzy drugiego zamówienia.
              </p>
            )}
            <form
              className="checkout-layout"
              onSubmit={submit}
              noValidate
              aria-busy={busy}
            >
              <div className="checkout-fields">
                <fieldset disabled={busy || retry}>
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
                        disabled={!settings?.deliveryEnabled}
                        checked={fulfillment === "delivery"}
                        onChange={() => setFulfillment("delivery")}
                      />
                      <MapPin />
                      <span>
                        Dostawa
                        <small>
                          {settings?.deliveryEnabled
                            ? money(settings.deliveryFeeGrosz!)
                            : "Dostawa online chwilowo niedostępna"}
                        </small>
                      </span>
                    </label>
                  </div>
                </fieldset>
                <fieldset disabled={busy || retry}>
                  <legend>
                    <span>02</span> Twoje dane
                  </legend>
                  <div className="form-grid">
                    {input("name", "Imię", "given-name")}
                    {input("phone", "Telefon", "tel", "tel")}
                  </div>
                </fieldset>
                {fulfillment === "delivery" && (
                  <fieldset disabled={busy || retry}>
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
                <fieldset disabled={busy || retry}>
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
                      onChange={(event) => setTime(event.target.value)}
                      aria-invalid={Boolean(errors.time)}
                      aria-describedby="time-help"
                    />
                    <small id="time-help">
                      {errors.time ||
                        "Pozostaw puste, aby zamówić jak najszybciej. Termin wymaga potwierdzenia restauracji."}
                    </small>
                  </label>
                  <label className="form-field">
                    <span>Uwagi do zamówienia (opcjonalnie)</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Co powinniśmy wiedzieć?"
                    />
                  </label>
                </fieldset>
              </div>
              <aside className="order-summary checkout-summary">
                <p className="eyebrow">TWÓJ KOSZYK</p>
                <h2>Dobrze wybrane.</h2>
                <ul className="receipt-items">
                  {activeLines.map((line) => {
                    const p = productById.get(line.productId);
                    return (
                      <li key={line.productId}>
                        <span>
                          {line.quantity} × {p?.name || "Danie"}
                        </span>
                        <strong>
                          {money((p?.priceGrosz || 0) * line.quantity)}
                        </strong>
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
                    {deliveryFee == null ? "Niedostępna" : money(deliveryFee)}
                  </span>
                </div>
                <div className="sum-row total">
                  <span>Razem</span>
                  <strong>{money(subtotal + (deliveryFee || 0))}</strong>
                </div>
                <p className="fine-print">
                  Ceny i dostępność są sprawdzane przy wysyłaniu. Ostateczną
                  kwotę zobaczysz w potwierdzeniu. Płatności online nie są
                  pobierane.
                </p>
                {failure && (
                  <p role="alert" className="field-error">
                    {failure}
                  </p>
                )}
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || (!retry && !settings?.orderingEnabled)}
                >
                  {busy
                    ? "Wysyłanie zamówienia…"
                    : retry
                      ? "Ponów wysłanie zamówienia"
                      : "Potwierdź zamówienie"}
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
  const { complete } = useShop();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    getOrder(id || "")
      .then((value) => {
        if (!active) return;
        const pending = pendingAttempt();
        if (pending && pending.key === id) {
          complete(pending.request.items);
          finishAttempt();
        }
        setOrder(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Nie udało się odczytać potwierdzenia.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return (
    <main id="main" className="shop-main">
      <div className="shop-container success-container">
        {!order ? (
          error ? (
            <>
              <p role="alert">{error}</p>
              <button
                className="button button-primary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Sprawdź ponownie
              </button>
              <Link to="/menu" className="text-link">
                Wróć do menu
              </Link>
            </>
          ) : (
            <p role="status">Wczytywanie potwierdzenia…</p>
          )
        ) : (
          <>
            <div className="success-mark">
              <Check size={34} />
            </div>
            <p className="eyebrow">{order.number}</p>
            <h1>
              Zamówienie zapisane.
              <br />
              <em>Dziękujemy.</em>
            </h1>
            <p>
              System zapisał Twoje zamówienie. To potwierdzenie zapisu, nie
              rozpoczęcia przygotowania.
            </p>
            <div className="receipt">
              <h2>Twoje podsumowanie</h2>
              <ul className="receipt-items">
                {order.items.map((item) => (
                  <li key={item.productId}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>{money(item.lineTotalGrosz)}</strong>
                  </li>
                ))}
              </ul>
              <div className="sum-row">
                <span>
                  {order.fulfillment === "pickup"
                    ? "Odbiór osobisty"
                    : "Dostawa"}
                </span>
                <strong>{money(order.deliveryFeeGrosz)}</strong>
              </div>
              <div className="sum-row total">
                <span>Razem</span>
                <strong>{money(order.totalGrosz)}</strong>
              </div>
              {order.fulfillment === "pickup" && (
                <p>Odbiór osobisty: Pomarańczowa 7, Szczecin</p>
              )}
              <p className="fine-print">
                Nie pobraliśmy płatności online. Nie wysyłamy jeszcze
                powiadomień e-mail ani SMS. W sprawie realizacji zadzwoń do
                restauracji i podaj numer zamówienia.
              </p>
            </div>
            <a className="button button-primary" href={restaurant.phoneHref}>
              Zadzwoń do Sushi Smok <ArrowUpRight size={18} />
            </a>
            <Link className="text-link" to="/menu">
              Wróć do menu <ArrowUpRight size={18} />
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
