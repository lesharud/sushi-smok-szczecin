import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handle } from "./orders.js";
import { catalog } from "./catalog.js";
import { notifications } from "./notifications/api.js";

async function middleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const path = (req.url || "").split("?")[0];
  if (!path.startsWith("/api/")) return next();
  const action = {
    "/api/orders": "create",
    "/api/order-receipt": "receipt",
    "/api/order-settings": "settings",
  }[path] as "create" | "receipt" | "settings" | undefined;
  if (
    !action &&
    ![
      "/api/catalog",
      "/api/notifications",
      "/api/notification-worker",
    ].includes(path)
  ) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"error":{"code":"NOT_FOUND"}}');
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(",") : value);
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: chunks.length ? Buffer.concat(chunks) : undefined }
        : {}),
    });
    const response =
      path === "/api/notifications" || path === "/api/notification-worker"
        ? await notifications(request)
        : path === "/api/catalog"
          ? await catalog(request)
          : await handle(request, action!);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.statusCode = response.status;
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      '{"error":{"code":"ORDERING_UNAVAILABLE","message":"Zamówienia online są chwilowo niedostępne."}}',
    );
  }
}
export function guestApi(): Plugin {
  return {
    name: "guest-order-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
