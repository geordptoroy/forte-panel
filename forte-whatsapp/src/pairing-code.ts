import { Browsers } from "baileys";

export async function requestPairingCodeWhenReady(
  waitUntilReady: () => Promise<void>,
  request: () => Promise<string>
) {
  await waitUntilReady();
  return request();
}

/** WhatsApp validates the companion display more strictly for phone pairing. */
export function getBaileysBrowser() {
  return Browsers.ubuntu("Chrome");
}

/** A pending, unaccepted pairing has neither an account identity nor signal identities. */
export function clearUnregisteredPairingCredentials(creds: {
  registered?: boolean;
  me?: unknown;
  pairingCode?: string;
  account?: unknown;
  signalIdentities?: unknown[];
}) {
  if (
    creds.registered ||
    creds.account != null ||
    (creds.signalIdentities?.length ?? 0) > 0
  )
    return false;
  const hasPendingPairing = creds.me != null || creds.pairingCode != null;
  if (!hasPendingPairing) return false;
  delete creds.me;
  delete creds.pairingCode;
  return true;
}

export function shouldUseRemoteLogout(
  logoutRequested: boolean,
  pairingAwaitingAcceptance: boolean
) {
  return logoutRequested && !pairingAwaitingAcceptance;
}

export function getStatusAfterSocketClose(
  loggedOut: boolean,
  acceptedPairingRestart: boolean
): "logged_out" | "connecting" | "disconnected" {
  if (loggedOut) return "logged_out";
  if (acceptedPairingRestart) return "connecting";
  return "disconnected";
}
