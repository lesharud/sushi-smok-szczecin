import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { authConfigured, getSupabase, useAuth } from "../shop/auth";
import {
  clearLocalOrders,
  blankProfile,
  listLocalOrders,
  PROFILE_KEY,
  readProfile,
} from "../shop/orders";
import { writeJson, removeStored } from "../shop/storage";
import { useShop } from "../shop/ShopProvider";
import { polishValidation } from "../shop/formValidation";
import { money } from "../shop/catalog";
import type { Address, Order, SavedProfile } from "../shop/types";
const emptyAddress: Address = {
  id: "",
  label: "Dom",
  street: "",
  building: "",
  apartment: "",
  postalCode: "",
  city: "Szczecin",
};
export function AuthPage({ register = false }: { register?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const client = await getSupabase();
      const result = register
        ? await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/account` },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setFailed(false);
      if (result.data.session) navigate("/account");
      else
        setMessage(
          "Sprawdź pocztę i potwierdź adres e-mail, aby dokończyć rejestrację.",
        );
    } catch {
      setFailed(true);
      setMessage(
        register
          ? "Nie udało się zarejestrować. Sprawdź dane i spróbuj ponownie."
          : "Nie udało się zalogować. Sprawdź e-mail i hasło, a następnie spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="shop-main">
      <div className="auth-panel">
        <p className="eyebrow">TWÓJ SUSHI SMOK</p>
        <h1>{register ? "Miło Cię poznać." : "Dobrze Cię widzieć."}</h1>
        {user ? (
          <>
            <p>Jesteś zalogowany jako {user.email}.</p>
            <Link className="button button-primary" to="/account">
              Przejdź do profilu
            </Link>
          </>
        ) : !authConfigured ? (
          <div className="account-notice">
            <h2>Konta już wkrótce.</h2>
            <p>
              Logowanie i rejestracja nie są jeszcze dostępne. Możesz korzystać
              z menu i próbnego zamówienia bez konta.
            </p>
            <Link className="button button-primary" to="/menu">
              Przejdź do menu <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" to="/account">
              Profil na tym urządzeniu
            </Link>
          </div>
        ) : (
          <form {...polishValidation} onSubmit={submit}>
            <label className="form-field">
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>Hasło{register ? " (minimum 12 znaków)" : ""}</span>
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                minLength={register ? 12 : undefined}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {message && <p role={failed ? "alert" : "status"}>{message}</p>}
            <button className="button button-primary" disabled={busy}>
              {busy ? "Chwileczkę…" : register ? "Utwórz konto" : "Zaloguj się"}
            </button>
            <Link className="text-link" to={register ? "/login" : "/register"}>
              {register
                ? "Masz konto? Zaloguj się"
                : "Nie masz konta? Zarejestruj się"}
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
export function AccountPage() {
  const { user, logout } = useAuth();
  const { notify } = useShop();
  const [profile, setProfile] = useState<SavedProfile>(blankProfile),
    [address, setAddress] = useState<Address>(emptyAddress),
    [editing, setEditing] = useState(false);
  useEffect(() => setProfile(readProfile()), []);
  function persist(value: SavedProfile) {
    if (writeJson(PROFILE_KEY, value)) {
      setProfile(value);
      notify("Zapisano na tym urządzeniu.");
    } else
      notify("Nie udało się zapisać danych. Sprawdź ustawienia przeglądarki.");
  }
  function addAddress(e: FormEvent) {
    e.preventDefault();
    persist({
      ...profile,
      addresses: [
        ...profile.addresses.filter((a) => a.id !== address.id),
        { ...address, id: address.id || crypto.randomUUID() },
      ].slice(-5),
    });
    setAddress(emptyAddress);
    setEditing(false);
  }
  return (
    <main id="main" className="shop-main">
      <div className="shop-container">
        <div className="page-heading">
          <p className="eyebrow">TWÓJ SUSHI SMOK</p>
          <h1>Po Twojemu.</h1>
        </div>
        <div className="account-grid">
          <aside className="account-sidebar">
            <h2>{user ? "Twoje konto" : "Twój profil lokalny"}</h2>
            <p>{user ? user.email : "Bez zakładania konta."}</p>
            <Link className="text-link" to="/account/orders">
              Historia próbnych zamówień <ArrowUpRight size={18} />
            </Link>
            {user ? (
              <button
                className="text-link"
                onClick={() =>
                  logout()
                    .then(() => notify("Wylogowano."))
                    .catch(() =>
                      notify("Nie udało się wylogować. Spróbuj ponownie."),
                    )
                }
              >
                Wyloguj się
              </button>
            ) : (
              <Link className="text-link" to="/login">
                {authConfigured ? "Zaloguj się" : "Konta — sprawdź dostępność"}{" "}
                <ArrowUpRight size={18} />
              </Link>
            )}
            <p className="fine-print">
              Dane i historia próbnych zamówień są przechowywane wyłącznie w tej
              przeglądarce. Nie synchronizują się z kontem ani innymi
              urządzeniami.
            </p>
          </aside>
          <div>
            <form
              {...polishValidation}
              className="account-block"
              onSubmit={(e) => {
                e.preventDefault();
                persist(profile);
              }}
            >
              <h2>Twoje dane</h2>
              <p>
                Zapisz je tylko na własnym urządzeniu. Podczas składania
                zamówienia wybierzesz, czy chcesz ich użyć.
              </p>
              <div className="form-grid">
                {(
                  [
                    ["firstName", "Imię", "given-name", "text"],
                    ["lastName", "Nazwisko", "family-name", "text"],
                    ["phone", "Telefon", "tel", "tel"],
                    ["email", "E-mail", "email", "email"],
                  ] as const
                ).map(([key, label, auto, type]) => (
                  <label className="form-field" key={key}>
                    <span>{label}</span>
                    <input
                      type={type}
                      autoComplete={auto}
                      value={profile[key]}
                      maxLength={150}
                      onChange={(e) =>
                        setProfile({ ...profile, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="button button-primary">
                Zapisz dane na tym urządzeniu
              </button>
            </form>
            <section className="account-block">
              <div className="catalog-heading">
                <h2>Zapisane adresy</h2>
                <button
                  className="text-link"
                  onClick={() => {
                    setAddress(emptyAddress);
                    setEditing(!editing);
                  }}
                >
                  <Plus size={18} />
                  Dodaj adres
                </button>
              </div>
              {!profile.addresses.length && !editing && (
                <p>Jeszcze nie masz zapisanych adresów.</p>
              )}
              <div className="address-list">
                {profile.addresses.map((a) => (
                  <article key={a.id}>
                    <h3>{a.label}</h3>
                    <p>
                      {a.street} {a.building}
                      {a.apartment ? ` / ${a.apartment}` : ""}
                      <br />
                      {a.postalCode} {a.city}
                    </p>
                    <button
                      className="text-link"
                      onClick={() => {
                        setAddress(a);
                        setEditing(true);
                      }}
                    >
                      Edytuj
                    </button>
                    <button
                      className="icon-control"
                      aria-label={`Usuń adres: ${a.label}`}
                      onClick={() =>
                        persist({
                          ...profile,
                          addresses: profile.addresses.filter(
                            (x) => x.id !== a.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </article>
                ))}
              </div>
              {editing && (
                <form
                  {...polishValidation}
                  onSubmit={addAddress}
                  className="address-form"
                >
                  <div className="form-grid">
                    {(
                      [
                        ["label", "Nazwa adresu"],
                        ["street", "Ulica"],
                        ["building", "Numer domu"],
                        ["apartment", "Numer mieszkania"],
                        ["postalCode", "Kod pocztowy"],
                        ["city", "Miasto"],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="form-field" key={key}>
                        <span>
                          {label}
                          {key === "apartment" ? " (opcjonalnie)" : ""}
                        </span>
                        <input
                          value={address[key]}
                          required={key !== "apartment"}
                          maxLength={150}
                          pattern={
                            key === "postalCode"
                              ? "[0-9]{2}-[0-9]{3}"
                              : undefined
                          }
                          title={
                            key === "postalCode" ? "Format: 70-781" : undefined
                          }
                          onChange={(e) =>
                            setAddress({ ...address, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button className="button button-primary">
                    Zapisz adres
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setEditing(false)}
                  >
                    Anuluj
                  </button>
                </form>
              )}
            </section>
            <button
              className="text-link"
              onClick={() => {
                removeStored(PROFILE_KEY);
                setProfile(blankProfile);
                notify("Usunięto zapisany profil i adresy.");
              }}
            >
              Usuń zapisany profil i adresy
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const { notify } = useShop();
  useEffect(() => setOrders(listLocalOrders()), []);
  return (
    <main id="main" className="shop-main">
      <div className="shop-container">
        <Link to="/account" className="back-link">
          ← Wróć do profilu
        </Link>
        <div className="page-heading">
          <p className="eyebrow">NA TYM URZĄDZENIU</p>
          <h1>
            Twoje zamówienia.
            <br />
            <em>Na próbę.</em>
          </h1>
        </div>
        <p>
          Historia testowa w tej przeglądarce. Żadne z tych zamówień nie zostało
          wysłane do restauracji.
        </p>
        {orders.length ? (
          <>
            <div className="order-history">
              {orders.map((o) => (
                <Link to={`/order-success/${o.id}`} key={o.id}>
                  <div>
                    <span className="eyebrow">{o.number}</span>
                    <h2>{money(o.totalGrosz ?? o.subtotalGrosz)}</h2>
                    <p>
                      {new Date(o.createdAt).toLocaleDateString("pl-PL")} ·{" "}
                      {o.fulfillment === "pickup"
                        ? "Odbiór osobisty"
                        : "Dostawa — koszt do potwierdzenia"}
                    </p>
                  </div>
                  <ArrowUpRight />
                </Link>
              ))}
            </div>
            <button
              className="text-link"
              onClick={() => {
                clearLocalOrders();
                setOrders([]);
                notify("Usunięto historię z przeglądarki.");
              }}
            >
              Usuń historię z tego urządzenia
            </button>
          </>
        ) : (
          <div className="empty-state">
            <h2>Jeszcze nic tutaj nie ma.</h2>
            <Link to="/menu" className="button button-primary">
              Odkryj menu
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
