import { randomBytes } from "node:crypto";

const PAIRING_CODE_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTVWXYZ";

export function createPairingCode() {
  let value = randomBytes(5).readUIntBE(0, 5);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code = `${PAIRING_CODE_ALPHABET[value % 32]}${code}`;
    value = Math.floor(value / 32);
  }
  return code;
}

export async function requestPairingCodeWithAcceptedRestart(
  code: string,
  waitForSocketOpen: () => Promise<void>,
  request: (code: string) => Promise<string>,
  pairingWasAccepted: () => boolean
) {
  await waitForSocketOpen();
  try {
    return await request(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pairingWasAccepted() && /^Connection Closed$/i.test(message.trim()))
      return code;
    throw error;
  }
}
