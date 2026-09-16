import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { adminClient as db } from "./client";
import { useResource } from "./useResource";
import type { Role } from "./types";
import Orders from "./Orders";
import Menu from "./Menu";
import Settings from "./Settings";
import "./admin.css";
export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const { pathname } = useLocation();
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    let alive = true;
    const { data } = db.auth.onAuthStateChange((_event, value) => {
      if (alive) {
        setSession(value);
        setReady(true);
      }
    });
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (alive) {
          if (error)
            setError("Nie udało się przywrócić sesji. Zaloguj się ponownie.");
          setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setError("Nie udało się przywrócić sesji.");
          setReady(true);
        }
      });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const access = useResource<Role | null>(
    session?.user.id || "anonymous",
    async () => {
      if (!session || !db) return null;
      const { data, error } = await db
        .from("staff_profiles")
        .select("role,active")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.active ? (data.role as Role) : null;
    },
    10000,
  );
  const logout = async () => {
    setError("");
    const result = await db?.auth.signOut({ scope: "local" });
    if (result?.error)
      setError(
        "Nie udało się wylogować. Sprawdź połączenie i spróbuj ponownie.",
      );
  };
  if (!db)
    return (
      <main className="admin-app">
        <div className="admin-login">
          <h1>Panel Sushi SMOK</h1>
          <p role="alert">
            Panel nie jest jeszcze skonfigurowany. Skontaktuj się z
            administratorem.
          </p>
          <Link to="/">Wróć na stronę</Link>
        </div>
      </main>
    );
  if (!ready)
    return (
      <main className="admin-app">
        <p role="status">Przywracanie sesji…</p>
      </main>
    );
  if (!session)
    return pathname != "/admin/login" ? (
      <Navigate to="/admin/login" replace />
    ) : (
      <Login initialError={error} />
    );
  if (!access.updated && !access.error)
    return (
      <main className="admin-app">
        <p role="status">Sprawdzanie uprawnień…</p>
      </main>
    );
  if (!access.data || access.error)
    return (
      <main className="admin-app">
        <div className="admin-login">
          <h1>Panel Sushi SMOK</h1>
          <p role="alert">
            {access.error ||
              "To konto nie ma dostępu do panelu restauracji. Skontaktuj się z administratorem."}
          </p>
          <button onClick={access.refresh}>Spróbuj ponownie</button>
          <button onClick={logout}>Wyloguj</button>
          {error && <p role="alert">{error}</p>}
        </div>
      </main>
    );
  const role = access.data;
  return (
    <div className="admin-app" key={session.user.id}>
      <header className="admin-header">
        <Link to="/admin" className="admin-brand">
          SUSHI SMOK <small>{role === "admin" ? "ADMIN" : "ZESPÓŁ"}</small>
        </Link>
        <nav aria-label="Panel restauracji">
          <NavLink to="/admin/orders">Zamówienia</NavLink>
          <NavLink to="/admin/kitchen">Kuchnia</NavLink>
          {role === "admin" && (
            <>
              <NavLink to="/admin/menu">Menu</NavLink>
              <NavLink to="/admin/settings">Ustawienia</NavLink>
            </>
          )}
          <button onClick={logout}>Wyloguj</button>
        </nav>
      </header>
      <main id="main" className="admin-main">
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <Routes>
          <Route index element={<Navigate to="/admin/orders" replace />} />
          <Route
            path="login"
            element={<Navigate to="/admin/orders" replace />}
          />
          <Route path="orders" element={<Orders />} />
          <Route path="kitchen" element={<Orders kitchen />} />
          <Route
            path="menu"
            element={role === "admin" ? <Menu /> : <Denied />}
          />
          <Route
            path="settings"
            element={role === "admin" ? <Settings /> : <Denied />}
          />
          <Route path="*" element={<Denied />} />
        </Routes>
      </main>
    </div>
  );
}
function Denied() {
  return (
    <section>
      <h1>Brak dostępu</h1>
      <Link to="/admin/orders">Wróć do zamówień</Link>
    </section>
  );
}
function Login({ initialError }: { initialError: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await db!.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (error)
        setError(
          "Nie udało się zalogować. Sprawdź e-mail i hasło lub spróbuj ponownie później.",
        );
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-app">
      <form className="admin-login" onSubmit={submit}>
        <p className="admin-eyebrow">SUSHI SMOK / ZESPÓŁ</p>
        <h1>Panel restauracji</h1>
        <p>Dostęp wyłącznie dla uprawnionych pracowników.</p>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={busy}
          />
        </label>
        <label>
          Hasło
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <button className="admin-primary" disabled={busy}>
          {busy ? "Logowanie…" : "Zaloguj się"}
        </button>
        <Link to="/">Wróć na stronę</Link>
      </form>
    </main>
  );
}
