import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { BAILEYS_LOG_REDACTION_PATHS } from "./logger.js";

describe("Baileys log redaction", () => {
  it("redacts pairing secrets, history notifications, phone numbers and raw XML in child logs", async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = pino(
      {
        level: "info",
        redact: {
          paths: [...BAILEYS_LOG_REDACTION_PATHS],
          censor: "[REDACTED]",
        },
      },
      destination
    );

    logger.child({ instanceId: "test-instance" }).info(
      {
        node: {
          devicePairingData: {
            eIdent: "secret-identity-key",
            eSkeyVal: "secret-signed-key",
            eSkeySig: "secret-signature",
          },
          attrs: { jid: "5511999999999@s.whatsapp.net" },
        },
        helloMsg: { clientHello: { ephemeral: "secret-ephemeral" } },
        pairingCode: "secret-pairing-code",
        phone: "+5511999999999",
        histNotification: {
          mediaKey: "secret-history-media-key",
          directPath: "/secret/encrypted/history-media-path",
          fileSha256: "secret-history-file-hash",
          fileEncSha256: "secret-encrypted-file-hash",
          encHandle: "secret-history-enc-handle",
        },
        xml: "secret-raw-protocol-node",
      },
      "test log"
    );
    await new Promise<void>(resolve => setImmediate(resolve));

    const output = lines.join("");
    for (const secret of [
      "secret-identity-key",
      "secret-signed-key",
      "secret-signature",
      "secret-ephemeral",
      "secret-pairing-code",
      "+5511999999999",
      "5511999999999@s.whatsapp.net",
      "secret-history-media-key",
      "/secret/encrypted/history-media-path",
      "secret-history-file-hash",
      "secret-encrypted-file-hash",
      "secret-history-enc-handle",
      "secret-raw-protocol-node",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
