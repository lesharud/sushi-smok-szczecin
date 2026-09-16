import { notifications } from "../server/notifications/api.js";
export default { fetch: (request: Request) => notifications(request) };
