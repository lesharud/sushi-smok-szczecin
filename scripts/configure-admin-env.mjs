// CLI-only setup. Default: local public values. Production mutation requires explicit opt-in/owner approval.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { loadEnv } from "vite";
const run = (args, input) =>
  execFileSync(args[0], args.slice(1), {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
try {
  const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error();
  const env = loadEnv("development", process.cwd(), "");
  const url = `https://${ref}.supabase.co`;
  if (env.SUPABASE_URL?.replace(/\/$/, "") !== url) throw new Error();
  let pub = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!process.argv.includes("--vercel-production")) {
    const keys = JSON.parse(
      run([
        "supabase",
        "projects",
        "api-keys",
        "--project-ref",
        ref,
        "--output",
        "json",
      ]),
    );
    pub = keys.find(
      (k) =>
        k.type === "publishable" && k.api_key?.startsWith("sb_publishable_"),
    )?.api_key;
  } else if (env.VITE_SUPABASE_URL !== url) throw new Error();
  if (!pub || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(pub)) throw new Error();
  const values = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: pub };
  if (process.argv.includes("--vercel-production")) {
    const project = JSON.parse(run(["vercel", "project", "inspect", "--json"]));
    if (project.name !== "sushi-smok-szczecin") throw new Error();
    const current = JSON.parse(
      run(["vercel", "env", "ls", "production", "--json"]),
    );
    const entries = current.envs || current;
    for (const [name, value] of Object.entries(values)) {
      if (entries.some((v) => v.key === name)) {
        console.log(name + ": already exists; not overwritten");
        continue;
      }
      run(["vercel", "env", "add", name, "production"], value + "\n");
      console.log(name + ": added to Production");
    }
  } else {
    const file = ".env.local";
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error();
    const lines = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(
        (l) =>
          !/^\s*(?:export\s+)?VITE_SUPABASE_(URL|PUBLISHABLE_KEY)\s*=/.test(l),
      );
    fs.writeFileSync(
      file,
      lines.join("\n").trimEnd() +
        "\n" +
        Object.entries(values)
          .map(([k, v]) => k + "=" + v)
          .join("\n") +
        "\n",
      { mode: 0o600 },
    );
    fs.chmodSync(file, 0o600);
    console.log("Local public Admin ENV configured; values not displayed.");
  }
} catch {
  console.error(
    "Admin ENV setup failed. Values and CLI stderr suppressed to protect credentials.",
  );
  process.exitCode = 1;
}
