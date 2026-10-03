import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { registerApiRoutes } from "../api";
import { baileysWebhookAuthenticationGuard } from "../baileys-webhook-ingress";
import { BAILEYS_WEBHOOK_MAX_BODY_BYTES } from "../media-limits";
import { createContext } from "./context";
import { securityHeadersForRequest } from "./http-security";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use((req, res, next) => {
    for (const [name, value] of Object.entries(securityHeadersForRequest(req)))
      res.setHeader(name, value);
    next();
  });
  // Keep the default parser small. Large JSON payloads are isolated to the
  // routes whose contracts explicitly carry bounded base64 attachments.
  app.use(
    "/api/v1/webhooks/providers/baileys",
    baileysWebhookAuthenticationGuard,
    express.json({ limit: BAILEYS_WEBHOOK_MAX_BODY_BYTES })
  );
  app.use("/api/trpc/voice.upload", express.json({ limit: "24mb" }));
  app.use("/api/trpc/inbox.uploadAttachment", express.json({ limit: "12mb" }));
  app.use(
    "/api/trpc/platform.uploadAttachment",
    express.json({ limit: "12mb" })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerApiRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
