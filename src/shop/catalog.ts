import data from "./catalog.json";
import type { Category, Product } from "./types";
export const products = data.products as Product[];
export const categories = (data.categories as Category[]).sort((a, b) =>
  a.id === "zestawy" ? -1 : b.id === "zestawy" ? 1 : a.sortOrder - b.sortOrder,
);
export const productById = new Map(products.map((p) => [p.id, p]));
export const money = (grosz: number) =>
  new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(grosz / 100);
export const normalizeSearch = (text: string) =>
  text
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export const highlights = [
  "filadelfia-z-lososiem",
  "pomaranczowy-smok",
  "zestaw-mini-smok",
  "double-shrimp",
  "pieczony-set",
  "party-set",
];
export const orderSettings = {
  maxQuantity: 99,
  currency: "PLN",
};
