export type Role = "admin" | "staff";
export type Status =
  "new" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
export const labels: Record<Status, string> = {
  new: "Nowe",
  accepted: "Przyjęte",
  preparing: "W przygotowaniu",
  ready: "Gotowe",
  delivered: "Zakończone",
  cancelled: "Anulowane",
};
export const next: Partial<Record<Status, { status: Status; label: string }>> =
  {
    new: { status: "accepted", label: "Przyjmij" },
    accepted: { status: "preparing", label: "Rozpocznij przygotowanie" },
    preparing: { status: "ready", label: "Gotowe" },
    ready: { status: "delivered", label: "Zakończ" },
  };
export type Item = {
  id: number;
  name: string;
  quantity: number;
  unit_price_grosz: number;
  line_total_grosz: number;
};
export type StaffOrder = {
  id: string;
  number: string;
  status: Status;
  created_at: string;
  updated_at: string;
  customer: { name: string; phone: string };
  fulfillment: "pickup" | "delivery";
  address: Record<string, string> | null;
  notes: string;
  preferred_time: string | null;
  subtotal_grosz: number;
  delivery_fee_grosz: number;
  total_grosz: number;
  order_items: Item[];
};
export type MenuProduct = {
  id: string;
  name: string;
  description: string;
  category_id: string;
  price_grosz: number;
  available: boolean;
  updated_at: string;
};
export type Settings = {
  ordering_enabled: boolean;
  delivery_enabled: boolean;
  delivery_fee_grosz: number | null;
  updated_at: string;
};
export const orderColumns =
  "id,number,status,created_at,updated_at,customer,fulfillment,address,notes,preferred_time,subtotal_grosz,delivery_fee_grosz,total_grosz,order_items(id,name,quantity,unit_price_grosz,line_total_grosz)";
