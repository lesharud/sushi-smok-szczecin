export interface Category {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
}
export interface Product {
  id: string;
  slug: string;
  sourceId: string;
  categoryId: string;
  name: string;
  description: string;
  ingredients: string[] | null;
  weightGrams: number | null;
  pieces: number | null;
  priceGrosz: number;
  allergens: string[] | null;
  image: string | null;
  sourceImage: string | null;
  available: boolean;
  sourceUrl: string;
  verifiedAt: string;
}
export interface CartLine {
  productId: string;
  quantity: number;
}
export interface Customer {
  name: string;
  phone: string;
}
export interface Address {
  street: string;
  building: string;
  apartment: string;
  postalCode: string;
  city: string;
}
export interface CheckoutInput {
  customer: Customer;
  fulfillment: "pickup" | "delivery";
  address: Address | null;
  notes: string;
  preferredTime: string | null;
}
export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceGrosz: number;
  lineTotalGrosz: number;
  image: string | null;
}
export interface Order {
  id: string;
  number: string;
  createdAt: string;
  status:
    "new" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
  items: OrderItem[];
  subtotalGrosz: number;
  deliveryFeeGrosz: number;
  totalGrosz: number;
  fulfillment: "pickup" | "delivery";
}
