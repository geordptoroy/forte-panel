import pino from "pino";

export const BAILEYS_LOG_REDACTION_PATHS = [
  "node.devicePairingData",
  "helloMsg.clientHello.ephemeral",
  "creds",
  "authState",
  "pairingCode",
  "code",
  "phone",
  "phoneNumber",
  "node.attrs.jid",
  "attrs.jid",
  "xml",
] as const;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [...BAILEYS_LOG_REDACTION_PATHS],
    censor: "[REDACTED]",
  },
});
