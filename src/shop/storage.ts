export function readJson<T>(key: string, fallback: T, session = false): T {
  if (typeof window === "undefined") return fallback;
  try {
    return (
      JSON.parse(
        (session ? sessionStorage : localStorage).getItem(key) || "null",
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function writeJson(
  key: string,
  value: unknown,
  session = false,
): boolean {
  try {
    (session ? sessionStorage : localStorage).setItem(
      key,
      JSON.stringify(value),
    );
    return true;
  } catch {
    return false;
  }
}
export function removeStored(key: string, session = false) {
  try {
    (session ? sessionStorage : localStorage).removeItem(key);
  } catch {
    /* Storage can be disabled by browser policy. */
  }
}
