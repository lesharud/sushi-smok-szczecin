import sharp from "sharp";
import { readdir } from "node:fs/promises";
const dir = new URL("../public/images/", import.meta.url);
const files = (await readdir(dir)).filter(
  (name) => name.endsWith(".jpg") && name !== "og.jpg",
);
for (const file of files) {
  const name = file.replace(".jpg", "");
  const sizes = name === "hero" ? [800, 1440] : [600, 1000];
  for (const width of sizes)
    await sharp(new URL(file, dir).pathname)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(new URL(`${name}-${width}.webp`, dir).pathname);
}
await sharp(new URL("hero.jpg", dir).pathname)
  .resize(1200, 630, { fit: "cover" })
  .jpeg({ quality: 86 })
  .toFile(new URL("og.jpg", dir).pathname);
await sharp(new URL("../public/favicon.svg", import.meta.url).pathname)
  .resize(180, 180)
  .png()
  .toFile(new URL("../public/apple-touch-icon.png", import.meta.url).pathname);
console.log(
  "Responsive WebP images, Open Graph image and touch icon generated.",
);
