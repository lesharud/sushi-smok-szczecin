// Build-time safeguard only. Never print values: VITE_* is embedded in browser assets.
export function assertPublicEnv(env: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_") || !value) continue;
    let role: unknown;
    try {
      role = JSON.parse(
        Buffer.from(value.split(".")[1] || "", "base64url").toString(),
      ).role;
    } catch {
      /* Not a legacy JWT. */
    }
    if (
      /SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD/.test(name) ||
      value.trim().startsWith("sb_secret_") ||
      role === "service_role"
    )
      throw new Error(
        `Server credentials must not be set in ${name}. Remove this public environment variable.`,
      );
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key && !key.startsWith("sb_publishable_"))
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY must contain a public sb_publishable_ key.",
    );
}
