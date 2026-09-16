import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { guestApi } from "./server/vite-api";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }
  return { plugins: [react(), guestApi()] };
});
