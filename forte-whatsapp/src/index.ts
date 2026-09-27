import { config } from "./config.js";
import { InstanceRegistry } from "./instance-registry.js";
import { createServer } from "./server.js";

async function main() {
  const registry = new InstanceRegistry();
  await registry.initialize();
  const server = createServer(registry);
  server.listen(config.port, "0.0.0.0", () =>
    console.log(`[forte-whatsapp] listening on ${config.port}`)
  );

  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void (async () => {
        await registry.stopAll();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
      })();
    });
}

void main().catch(error => {
  console.error("[forte-whatsapp] startup failed", error);
  process.exitCode = 1;
});
