import { lookup as lookupHostname } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";

export type LlmProviderId =
  | "nvidia_nim"
  | "google_gemini"
  | "openai_compatible";

const BUILT_IN_HOSTS: Record<LlmProviderId, ReadonlySet<string>> = {
  nvidia_nim: new Set(["integrate.api.nvidia.com"]),
  google_gemini: new Set(["generativelanguage.googleapis.com"]),
  openai_compatible: new Set(),
};
const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".test",
  ".example",
  ".invalid",
  ".onion",
  ".lan",
  ".home",
];

function normalizedHostname(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isLocalHostname(hostname: string) {
  const normalized = normalizedHostname(hostname);
  return (
    normalized === "localhost" ||
    LOCAL_SUFFIXES.some(suffix => normalized.endsWith(suffix))
  );
}

function configuredHostAllowlist() {
  return new Set(
    (process.env.FORTE_LLM_ALLOWED_HOSTS ?? "")
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean)
      .flatMap(entry => {
        try {
          const url = new URL(`https://${entry}`);
          if (
            url.pathname !== "/" ||
            url.search ||
            url.hash ||
            url.username ||
            url.password
          )
            return [];
          const hostname = normalizedHostname(url.hostname);
          if (!hostname || isIP(hostname) || isLocalHostname(hostname)) return [];
          return [url.port ? `${hostname}:${url.port}` : hostname];
        } catch {
          return [];
        }
      })
  );
}

export function assertAllowedLlmBaseUrl(
  provider: LlmProviderId,
  value: string
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A URL do provider LLM é inválida");
  }
  const hostname = normalizedHostname(url.hostname);
  if (url.protocol !== "https:")
    throw new Error("Providers LLM só podem usar HTTPS");
  if (url.username || url.password)
    throw new Error("A URL do provider LLM não pode conter usuário ou senha");
  if (url.search || url.hash)
    throw new Error("A URL do provider LLM não pode conter query ou fragmento");
  if (!hostname || isIP(hostname) || isLocalHostname(hostname))
    throw new Error("Hosts locais ou IPs literais não são permitidos para providers LLM");

  const hostPort = url.port ? `${hostname}:${url.port}` : hostname;
  const trustedBuiltInHost =
    BUILT_IN_HOSTS[provider].has(hostname) && (!url.port || url.port === "443");
  if (!trustedBuiltInHost && !configuredHostAllowlist().has(hostPort))
    throw new Error(
      `Host LLM não autorizado: configure-o explicitamente em FORTE_LLM_ALLOWED_HOSTS`
    );
  return url;
}

function assertPublicAddress(address: string) {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    throw new Error("O DNS do provider LLM devolveu um endereço inválido");
  }
  if (parsed.range() !== "unicast")
    throw new Error("O DNS do provider LLM resolveu para uma rede não pública");
}

async function resolvePublicAddresses(hostname: string) {
  const normalized = normalizedHostname(hostname);
  if (isIP(normalized) || isLocalHostname(normalized))
    throw new Error("Hosts locais ou IPs literais não são permitidos para providers LLM");
  const addresses = await lookupHostname(normalized, {
    all: true,
    verbatim: true,
  });
  if (addresses.length === 0)
    throw new Error("O DNS do provider LLM não devolveu endereços");
  for (const address of addresses) assertPublicAddress(address.address);
  return addresses;
}

export async function validateLlmTarget(provider: LlmProviderId, value: string) {
  const url = assertAllowedLlmBaseUrl(provider, value);
  await resolvePublicAddresses(url.hostname);
  return url;
}

function guardedDnsLookup(hostname: string, options: any, callback: any) {
  void resolvePublicAddresses(hostname)
    .then(addresses => {
      const requestedFamily =
        typeof options === "number" ? options : Number(options?.family ?? 0);
      const candidates = requestedFamily
        ? addresses.filter(address => address.family === requestedFamily)
        : addresses;
      if (candidates.length === 0) {
        const error = Object.assign(new Error("Nenhum endereço DNS público da família pedida"), {
          code: "ENOTFOUND",
        });
        if (options?.all) callback(error, []);
        else callback(error, "", 0);
        return;
      }
      if (options?.all) callback(null, candidates);
      else callback(null, candidates[0]!.address, candidates[0]!.family);
    })
    .catch(error => {
      const safeError = Object.assign(
        new Error(
          error instanceof Error
            ? error.message
            : "O destino DNS do provider LLM foi bloqueado"
        ),
        { code: "EACCES" }
      );
      if (options?.all) callback(safeError, []);
      else callback(safeError, "", 0);
    });
}

export function createGuardedLlmAgent() {
  return new Agent({
    connect: { lookup: guardedDnsLookup as any },
    connectTimeout: 10_000,
    headersTimeout: 15_000,
    bodyTimeout: 30_000,
    maxResponseSize: 10 * 1024 * 1024,
    maxOrigins: 1,
    maxRequestsPerClient: 1,
    pipelining: 0,
  });
}

export function buildLlmEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  const versionedPath = basePath.endsWith("/v1") ? basePath : `${basePath}/v1`;
  url.pathname = `${versionedPath}/chat/completions`.replace(/^\/\/+/g, "/");
  url.search = "";
  url.hash = "";
  return url;
}
