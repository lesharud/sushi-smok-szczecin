import { handle } from "../server/orders.js";
export default { fetch: (request: Request) => handle(request, "receipt") };
