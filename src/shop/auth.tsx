import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const authConfigured = Boolean(url && key);
let clientPromise: Promise<SupabaseClient> | undefined;
export function getSupabase() {
  if (!authConfigured)
    throw new Error(
      "Logowanie nie jest jeszcze dostępne. Możesz zamówić bez konta.",
    );
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key),
  );
  return clientPromise;
}
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}>({ user: null, loading: false, logout: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(authConfigured);
  useEffect(() => {
    if (!authConfigured) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    getSupabase()
      .then(async (client) => {
        const { data } = await client.auth.getSession();
        if (!alive) return;
        setUser(data.session?.user ?? null);
        setLoading(false);
        const { data: listener } = client.auth.onAuthStateChange(
          (_event, session) => {
            if (alive) setUser(session?.user ?? null);
          },
        );
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);
  const logout = async () => {
    const client = await getSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
