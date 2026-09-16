import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { assertPublicEnv } from "./server/public-env";
import { guestApi } from "./server/vite-api";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  assertPublicEnv(env);
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "NOTIFICATION_WORKER_SECRET",
    "SITE_URL",
  ]) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
  return { plugins: [react(), guestApi()] };
});
