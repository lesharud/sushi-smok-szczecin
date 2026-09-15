import sharp from "sharp";
import { readdir } from "node:fs/promises";
for (const name of await readdir("public/images/menu"))
  if (name.endsWith(".jpg"))
    await sharp(`public/images/menu/${name}`)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(`public/images/menu/${name.replace(".jpg", ".webp")}`);
for (const size of [192, 512])
  await sharp("public/favicon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
