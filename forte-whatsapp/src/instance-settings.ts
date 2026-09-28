export type BaileysInstanceSettings = {
  /** Reject incoming audio/video calls while still connected. */
  rejectCalls: boolean;
  /** Ignore group messages before downloading or forwarding them. */
  rejectGroups: boolean;
  /** Keep call events in the Panel conversation history. */
  logCalls: boolean;
  /** Ignore WhatsApp Status broadcasts instead of treating them as chats. */
  ignoreStatusUpdates: boolean;
};

export const DEFAULT_BAILEYS_INSTANCE_SETTINGS: Readonly<BaileysInstanceSettings> =
  Object.freeze({
    rejectCalls: false,
    // Preserve the current gateway behavior for existing and newly created instances.
    rejectGroups: true,
    logCalls: true,
    ignoreStatusUpdates: true,
  });

const SETTING_KEYS = [
  "rejectCalls",
  "rejectGroups",
  "logCalls",
  "ignoreStatusUpdates",
] as const;

export function normalizeBaileysInstanceSettings(
  value: unknown
): BaileysInstanceSettings {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    rejectCalls:
      typeof input.rejectCalls === "boolean"
        ? input.rejectCalls
        : DEFAULT_BAILEYS_INSTANCE_SETTINGS.rejectCalls,
    rejectGroups:
      typeof input.rejectGroups === "boolean"
        ? input.rejectGroups
        : DEFAULT_BAILEYS_INSTANCE_SETTINGS.rejectGroups,
    logCalls:
      typeof input.logCalls === "boolean"
        ? input.logCalls
        : DEFAULT_BAILEYS_INSTANCE_SETTINGS.logCalls,
    ignoreStatusUpdates:
      typeof input.ignoreStatusUpdates === "boolean"
        ? input.ignoreStatusUpdates
        : DEFAULT_BAILEYS_INSTANCE_SETTINGS.ignoreStatusUpdates,
  };
}

export function parseBaileysInstanceSettings(
  value: unknown
): BaileysInstanceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Configurações WhatsApp inválidas");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== SETTING_KEYS.length ||
    SETTING_KEYS.some(key => typeof input[key] !== "boolean")
  )
    throw new Error("Informe todas as opções como verdadeiro ou falso");
  return normalizeBaileysInstanceSettings(input);
}

export function isGroupJid(jid: string | undefined) {
  return Boolean(jid?.toLowerCase().endsWith("@g.us"));
}

export function isStatusBroadcastJid(jid: string | undefined) {
  return jid?.toLowerCase() === "status@broadcast";
}

export function shouldIgnoreInboundJid(
  settings: BaileysInstanceSettings,
  jid: string | undefined
) {
  return (
    (settings.rejectGroups && isGroupJid(jid)) ||
    (settings.ignoreStatusUpdates && isStatusBroadcastJid(jid))
  );
}

export function shouldRejectIncomingCall(
  settings: BaileysInstanceSettings,
  status: string
) {
  return settings.rejectCalls && status.toLowerCase() === "offer";
}
