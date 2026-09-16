import { notifications } from "../server/notifications/api.js";
export const maxDuration = 60;
export default { fetch: (request: Request) => notifications(request) };
