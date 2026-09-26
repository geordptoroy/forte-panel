import { config } from "./config.js";
import { InstanceManager } from "./instance-manager.js";
import { createServer } from "./server.js";

const manager = new InstanceManager();
const server = createServer(manager);
server.listen(config.port, "0.0.0.0", () => console.log(`[forte-whatsapp] listening on ${config.port}`));
void manager.start().catch((error) => console.error("[forte-whatsapp] initial connection failed", error));

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => { await manager.stop(); server.close(); process.exit(0); });
