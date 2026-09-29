import {
  OPERATIONAL_WHATSAPP_PROVIDER,
  assertOperationalWhatsappProvider,
  type OperationalWhatsappProvider,
} from "../integrations/baileys-policy";

type MessageMetadata = Record<string, unknown> | null | undefined;

export type ReplyRoute = {
  provider: OperationalWhatsappProvider;
  instanceId?: string;
  jid?: string;
  usedLegacyFallback: boolean;
};

/**
 * Replies follow the instance recorded on the latest inbound message. Legacy
 * messages without routing metadata may use an explicitly selected instance;
 * no provider or global channel default is consulted.
 */
export function resolveReplyRoute(input: {
  latestInbound?: {
    provider?: string | null;
    metadata?: MessageMetadata;
  };
  defaultInstanceId?: string;
}): ReplyRoute {
  const latest = input.latestInbound;
  const provider = assertOperationalWhatsappProvider(
    latest?.provider ?? OPERATIONAL_WHATSAPP_PROVIDER
  );
  const instanceId =
    typeof latest?.metadata?.instanceId === "string" &&
    latest.metadata.instanceId.trim()
      ? latest.metadata.instanceId.trim()
      : input.defaultInstanceId;
  const jid =
    typeof latest?.metadata?.jid === "string" && latest.metadata.jid.trim()
      ? latest.metadata.jid.trim()
      : undefined;

  return {
    provider,
    ...(instanceId ? { instanceId } : {}),
    ...(jid ? { jid } : {}),
    usedLegacyFallback: !latest?.metadata?.instanceId,
  };
}
