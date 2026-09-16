import { database, json, failure } from "./orders.js";
export async function catalog(request: Request) {
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  try {
    const { data, error } = await database()
      .from("products")
      .select("id,name,description,category_id,price_grosz,available")
      .order("id");
    if (error || !data) return failure("ORDERING_UNAVAILABLE", 503);
    return json({ products: data });
  } catch {
    return failure("ORDERING_UNAVAILABLE", 503);
  }
}
