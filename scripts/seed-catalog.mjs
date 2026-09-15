import { readFile, writeFile } from "node:fs/promises";
const { categories, products } = JSON.parse(
  await readFile("src/shop/catalog.json", "utf8"),
);
const sql = (value) =>
  value === null
    ? "null"
    : typeof value === "boolean" || typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
let output =
  "-- Generated catalog snapshot. Review owner edits before re-running.\nbegin;\n";
for (const c of categories)
  output += `insert into public.categories (id,name,description,sort_order) values (${[c.id, c.name, c.description, c.sortOrder].map(sql).join(",")}) on conflict (id) do nothing;\n`;
for (const p of products)
  output += `insert into public.products (id,category_id,slug,name,description,price_grosz,weight_grams,pieces,image,available,source_url,verified_at) values (${[p.id, p.categoryId, p.slug, p.name, p.description, p.priceGrosz, p.weightGrams, p.pieces, p.image, p.available, p.sourceUrl, p.verifiedAt].map(sql).join(",")}) on conflict (id) do nothing;\n`;
await writeFile("supabase/seed.sql", output + "commit;\n");
