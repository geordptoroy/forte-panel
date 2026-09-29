export type WhatsAppDirectoryLookup = (
  ...phoneNumbers: string[]
) => Promise<Array<{ jid: string; exists: boolean }> | undefined>;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function nationalDigits(input: string) {
  let digits = digitsOnly(input);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 11) digits = digits.slice(1);
  return digits;
}

/**
 * Returns conservative Brazilian candidates, keeping the exact user input first.
 * We never silently rewrite a number without asking WhatsApp which candidate exists.
 */
export function brazilianPhoneCandidates(input: string) {
  const digits = nationalDigits(input);
  if (!digits) return [];

  const candidates = new Set<string>();
  const add = (national: string) => {
    if (national.length >= 8) candidates.add(`${national}@s.whatsapp.net`);
  };
  const isBrazilian = digits.length === 10 || digits.length === 11;

  if (!isBrazilian) {
    candidates.add(`${digits}@s.whatsapp.net`);
    return [...candidates];
  }

  add(digits);
  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (subscriber.length === 8 && /^[6-9]/.test(subscriber))
    add(`${ddd}9${subscriber}`);
  if (subscriber.length === 9 && subscriber.startsWith("99"))
    add(`${ddd}${subscriber.slice(1)}`);

  return [...candidates];
}

export async function resolveRecipientJid(
  input: string,
  lookup: WhatsAppDirectoryLookup
) {
  if (input.includes("@")) return input;
  const candidates = brazilianPhoneCandidates(input);
  if (candidates.length === 0) throw new Error("Telefone de destino inválido");
  const results = await lookup(...candidates);
  const match = results?.find(result => result.exists);
  return match?.jid ?? candidates[0];
}
