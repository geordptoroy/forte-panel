import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const socketModulePath = fileURLToPath(
  new URL("../node_modules/baileys/lib/Socket/socket.js", import.meta.url)
);

describe("pinned Baileys pairing patch", () => {
  it("waits for WhatsApp's IQ response before persisting credentials or returning the code", () => {
    const source = readFileSync(socketModulePath, "utf8");
    const start = source.indexOf("const requestPairingCode = async");
    const end = source.indexOf("async function generatePairingKey()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const requestMethod = source.slice(start, end);
    const queryIndex = requestMethod.indexOf("await query({");
    const credentialUpdateIndex = requestMethod.indexOf(
      "ev.emit('creds.update'"
    );
    expect(queryIndex).toBeGreaterThanOrEqual(0);
    expect(requestMethod).toContain(
      "Timed out waiting for pairing code response"
    );
    expect(requestMethod).toContain("}, 20_000);");
    expect(requestMethod).toContain("authState.creds.pairingCode = undefined");
    expect(credentialUpdateIndex).toBeGreaterThan(queryIndex);
    expect(requestMethod).not.toContain("await sendNode({");
  });
});
