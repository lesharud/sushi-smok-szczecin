import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Only public publishable keys are accepted. Never put server credentials in VITE_*.
export const adminClient =
  url && key?.startsWith("sb_publishable_")
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "sushi-smok:staff-auth",
        },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              cache: "no-store",
              signal: init?.signal || AbortSignal.timeout(15000),
            }),
        },
      })
    : null;
export function errorText(error: unknown) {
  const code = (error as { message?: string })?.message;
  if (code === "STALE_WRITE")
    return "Dane zmieniły się na innym ekranie. Odśwież widok i spróbuj ponownie.";
  if (code === "INVALID_TRANSITION")
    return "Ten etap zamówienia nie jest już dostępny. Odśwież widok.";
  if (code === "ADMIN_REQUIRED" || code === "STAFF_REQUIRED")
    return "Brak uprawnień. Skontaktuj się z administratorem.";
  return "Nie udało się wykonać operacji. Sprawdź połączenie i spróbuj ponownie.";
}
