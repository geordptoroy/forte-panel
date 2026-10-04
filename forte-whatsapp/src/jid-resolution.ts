import type { WASocket } from "baileys";

type LidMapping = {
  getLIDForPN: (pn: string) => Promise<string | null>;
};

type SocketWithLidMapping = WASocket & {
  signalRepository?: {
    lidMapping?: LidMapping;
  };
  getUSyncDevices?: (
    jids: string[],
    useCache: boolean,
    ignoreZeroDevices: boolean
  ) => Promise<unknown>;
};

function normalizePhoneNumber(value: string) {
  return value.replace(/\D/g, "");
}

function candidatePhoneNumbers(digits: string) {
  const candidates = [digits];
  if (!digits.startsWith("55")) return candidates;

  const local = digits.slice(2);
  if (local.length === 11 && local[2] === "9") {
    candidates.push(`55${local.slice(0, 2)}${local.slice(3)}`);
  } else if (local.length === 10) {
    candidates.push(`55${local.slice(0, 2)}9${local.slice(2)}`);
  }
  return candidates;
}

/**
 * Resolve a user-supplied phone number to the LID preferred by Baileys v7.
 * Explicit JIDs are preserved because inbound messages/contact mappings already
 * carry the authoritative PN/LID choice in that form.
 */
export async function resolveOutboundJid(
  socket: WASocket,
  phoneOrJid: string
): Promise<string> {
  const value = phoneOrJid.trim();
  if (value.includes("@")) return value;

  const digits = normalizePhoneNumber(value);
  if (!digits) throw new Error("WhatsApp recipient is empty");

  const pns = candidatePhoneNumbers(digits).map(
    candidate => `${candidate}@s.whatsapp.net`
  );
  const socketWithMapping = socket as SocketWithLidMapping;
  const lidMapping = socketWithMapping.signalRepository?.lidMapping;

  if (lidMapping) {
    for (const pn of pns) {
      const cachedLid = await lidMapping.getLIDForPN(pn);
      if (cachedLid) return cachedLid;
    }
  }

  // Baileys' own device USync path retrieves and stores PN/LID pairs when the
  // local mapping cache does not have the recipient yet. This is deliberately
  // best-effort: an unknown recipient still falls back to the normal PN JID.
  if (typeof socketWithMapping.getUSyncDevices === "function") {
    try {
      await socketWithMapping.getUSyncDevices(pns, false, true);
      for (const pn of pns) {
        const resolvedLid = await lidMapping?.getLIDForPN(pn);
        if (resolvedLid) return resolvedLid;
      }
    } catch {
      // Let sendMessage produce the normal Baileys error for an unknown PN.
    }
  }

  return pns[0];
}
