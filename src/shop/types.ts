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
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}
export interface Address {
  id: string;
  label: string;
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
  preferredTime: string;
  payment: "cash" | "card";
  remember: boolean;
}
export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceGrosz: number;
  image: string | null;
}
export interface Order {
  id: string;
  number: string;
  createdAt: string;
  status: "demo";
  items: OrderItem[];
  subtotalGrosz: number;
  deliveryFeeGrosz: number | null;
  totalGrosz: number | null;
  customer: Customer | null;
  address: Address | null;
  fulfillment: "pickup" | "delivery";
  payment: "cash" | "card";
  notes: string;
  preferredTime: string;
}
export interface SavedProfile extends Customer {
  addresses: Address[];
}
