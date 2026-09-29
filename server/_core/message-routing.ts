import type { WhatsappProvider } from "../integrations/contracts";
import {
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
 * Replies follow the provider and instance recorded on the latest inbound
 * message. The workspace default is only a legacy fallback when old messages
 * have no routing metadata at all.
 */
export function resolveReplyRoute(input: {
  latestInbound?: {
    provider?: WhatsappProvider | null;
    metadata?: MessageMetadata;
  };
  defaultProvider: WhatsappProvider;
  defaultInstanceId?: string;
}): ReplyRoute {
  const latest = input.latestInbound;
  const provider = assertOperationalWhatsappProvider(
    latest?.provider ?? input.defaultProvider
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
