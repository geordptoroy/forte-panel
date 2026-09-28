export async function requestPairingCodeWhenReady(
  waitUntilReady: () => Promise<void>,
  request: () => Promise<string>
) {
  await waitUntilReady();
  return request();
}

export function clearUnregisteredPairingCredentials(creds: {
  registered?: boolean;
  me?: unknown;
  pairingCode?: string;
}) {
  if (creds.registered) return false;
  const hasPendingPairing = creds.me != null || creds.pairingCode != null;
  if (!hasPendingPairing) return false;
  delete creds.me;
  delete creds.pairingCode;
  return true;
}
