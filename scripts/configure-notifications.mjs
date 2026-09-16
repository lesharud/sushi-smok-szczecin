// Operator helper. --production/--activate-scheduler require explicit owner approval.
// Captures all CLI output; values never appear in stdout/stderr or process arguments.
import { loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const run = (cmd, args, input) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
const env = loadEnv("development", process.cwd(), "");
let folder;
try {
  if (
    !/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN || "") ||
    !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID || "") ||
    !/^\w{32,128}$/.test(env.NOTIFICATION_WORKER_SECRET || "")
  )
    throw Error();
  if (
    !process.argv.includes("--production") &&
    !process.argv.includes("--activate-scheduler")
  ) {
    console.log("Local configuration valid. Production unchanged.");
    process.exit(0);
  }
  const linked = JSON.parse(run("vercel", ["project", "inspect", "--json"]));
  if (linked.name !== "sushi-smok-szczecin") throw Error();
  const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (new URL(env.SUPABASE_URL).hostname !== ref + ".supabase.co")
    throw Error();
  if (process.argv.includes("--activate-scheduler")) {
    // Verify deployed worker authentication before enabling recurring calls. May deliver pending notifications.
    const response = await fetch(
      "https://sushi-smok-szczecin.vercel.app/api/notification-worker",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + env.NOTIFICATION_WORKER_SECRET },
        signal: AbortSignal.timeout(90000),
      },
    );
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw Error();
    folder = mkdtempSync(join(tmpdir(), "smok-notification-"));
    const file = join(folder, "activate.sql");
    writeFileSync(
      file,
      `do $$ begin
   if exists(select 1 from vault.decrypted_secrets where name='sushi_notification_worker_secret' and decrypted_secret <> '${env.NOTIFICATION_WORKER_SECRET}') then raise exception 'EXISTING_SECRET_REQUIRES_REVIEW'; end if;
   if not exists(select 1 from vault.secrets where name='sushi_notification_worker_secret') then
    perform vault.create_secret('${env.NOTIFICATION_WORKER_SECRET}','sushi_notification_worker_secret');
   end if;
  end $$;`,
      { mode: 0o600 },
    );
    run("supabase", ["db", "query", "--linked", "--file", file]);
    console.log("Scheduler activated. Secret values hidden.");
  } else {
    const listing = JSON.parse(
      run("vercel", ["env", "ls", "production", "--json"]),
    );
    const names = new Set((listing.envs || listing).map((x) => x.key));
    const vars = [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "NOTIFICATION_WORKER_SECRET",
    ];
    if (vars.some((name) => names.has(name))) throw Error();
    for (const name of vars) {
      run("vercel", ["env", "add", name, "production"], env[name] + "\n");
      console.log(name + ": added (value hidden)");
    }
    console.log(
      "Production ENV added. Deploy first; then activate with --activate-scheduler.",
    );
  }
} catch {
  console.error(
    "Setup stopped. Values and CLI errors hidden. Check configuration/permissions; existing ENV requires review before overwrite.",
  );
  process.exitCode = 1;
} finally {
  if (folder) rmSync(folder, { recursive: true, force: true });
}
