import { readFile, writeFile, mkdir } from "node:fs/promises";
import { render, pageTitle } from "../.prerender/prerender.js";
import { loadEnv } from "vite";
const file = new URL("../dist/index.html", import.meta.url);
let html = await readFile(file, "utf8");
// Set SITE_URL to the owner's final HTTPS domain before deployment.
// No guessed domain or incorrect canonical URL is published.
const env = loadEnv("production", process.cwd(), "");
const rawUrl = process.env.SITE_URL || env.SITE_URL;
const indexable =
  (process.env.VITE_SITE_INDEXABLE || env.VITE_SITE_INDEXABLE) === "true";
if (indexable && !rawUrl)
  throw new Error("SITE_URL is required for an indexable build");
const sitemapHeader =
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
await writeFile(
  new URL("../dist/robots.txt", import.meta.url),
  "User-agent: *\nDisallow: /\n",
);
await writeFile(
  new URL("../dist/sitemap.xml", import.meta.url),
  `${sitemapHeader}</urlset>`,
);
if (rawUrl) {
  const url = new URL(rawUrl);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("SITE_URL must be an HTTP(S) URL");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "SITE_URL must contain only the origin, without credentials, path, query or fragment",
    );
  if (indexable && url.protocol !== "https:")
    throw new Error("An indexable build requires HTTPS");
  const origin = url.origin;
  html = html.replace(
    'content="/images/og.jpg"',
    `content="${origin}/images/og.jpg"`,
  );
  const schema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: "Sushi Smok",
    alternateName: "SushiSmok",
    url: origin,
    image: `${origin}/images/og.jpg`,
    telephone: "+48880503760",
    openingHours: [
      "Mo 12:00-21:00",
      "Tu 12:00-21:00",
      "We 12:00-21:00",
      "Th 12:00-21:00",
      "Fr 12:00-22:00",
      "Sa 12:00-22:00",
      "Su 12:00-21:00",
    ],
    servesCuisine: ["Sushi", "Kuchnia japońska"],
    address: {
      "@type": "PostalAddress",
      streetAddress: "Pomarańczowa 7",
      addressLocality: "Szczecin",
      postalCode: "70-781",
      addressCountry: "PL",
    },
    sameAs: [
      "https://www.instagram.com/sushismok_s/",
      "https://www.pyszne.pl/menu/sushi-smok",
    ],
  };
  html = html.replace(
    "</head>",
    `<link rel="canonical" href="${origin}/" /><meta property="og:url" content="${origin}/" /><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head>`,
  );
  await writeFile(
    new URL("../dist/robots.txt", import.meta.url),
    indexable
      ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
}
const catalog = JSON.parse(
  await readFile(new URL("../src/shop/catalog.json", import.meta.url), "utf8"),
);
const publicPaths = [
  "/",
  "/menu",
  ...catalog.categories.map((c) => `/menu/kategoria/${c.id}`),
  ...catalog.products.map((p) => `/menu/danie/${p.slug}`),
];
const paths = [
  ...publicPaths,
  "/cart",
  "/checkout",
  "/account",
  "/account/orders",
  "/login",
  "/register",
  "/404",
];
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
for (const path of paths) {
  let page = html
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-route="${path}">${render(path)}</div>`,
    )
    .replace(
      /<title>.*?<\/title>/s,
      `<title>${escape(pageTitle(path))}</title>`,
    )
    .replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*/,
      `$1${escape(pageTitle(path))}`,
    );
  if (path !== "/")
    page = page
      .replace(/<link\s+rel="preload"\s+as="image"[\s\S]*?\/>/, "")
      .replace(/<script type="application\/ld\+json">.*?<\/script>/s, "");
  if (!indexable || !publicPaths.includes(path))
    page = page.replace(
      "</head>",
      '<meta name="robots" content="noindex, nofollow" /></head>',
    );
  if (rawUrl)
    page = page
      .replaceAll(
        `href="${new URL(rawUrl).origin}/"`,
        `href="${new URL(rawUrl).origin}${path}"`,
      )
      .replace(
        `content="${new URL(rawUrl).origin}/"`,
        `content="${new URL(rawUrl).origin}${path}"`,
      );
  const target = new URL(
    `../dist${path === "/" ? "" : path}/`,
    import.meta.url,
  );
  await mkdir(target, { recursive: true });
  await writeFile(new URL("index.html", target), page);
  if (path === "/404")
    await writeFile(new URL("../dist/404.html", import.meta.url), page);
}
const appShell = html
  .replace(/<link rel="canonical"[^>]*>/g, "")
  .replace(/<script type="application\/ld\+json">.*?<\/script>/s, "")
  .replace(/<link\s+rel="preload"\s+as="image"[\s\S]*?\/>/, "")
  .replace(
    "</head>",
    '<meta name="robots" content="noindex, nofollow" /></head>',
  );
await writeFile(new URL("../dist/app.html", import.meta.url), appShell);
if (rawUrl && indexable)
  await writeFile(
    new URL("../dist/sitemap.xml", import.meta.url),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicPaths.map((path) => `<url><loc>${new URL(rawUrl).origin}${path}</loc></url>`).join("")}</urlset>`,
  );
console.log(
  "Prerendered complete Polish HTML." +
    (rawUrl
      ? " Production SEO domain configured."
      : " Set SITE_URL for absolute Open Graph, canonical and sitemap URLs."),
);
