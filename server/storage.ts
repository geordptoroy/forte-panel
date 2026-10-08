// Private object storage helpers. Supports direct S3-compatible storage (MinIO,
// AWS S3, R2, etc.) and keeps Forge presigning as a compatibility fallback.

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getS3Config() {
  if (
    !ENV.storageEndpoint ||
    !ENV.storageBucket ||
    !ENV.storageAccessKey ||
    !ENV.storageSecretKey
  )
    return null;
  return {
    bucket: ENV.storageBucket,
    client: new S3Client({
      endpoint: ENV.storageEndpoint,
      region: ENV.storageRegion,
      forcePathStyle: ENV.storageForcePathStyle,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: ENV.storageAccessKey,
        secretAccessKey: ENV.storageSecretKey,
      },
    }),
  };
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) return null;
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (
    key.length > 512 ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    /%(?:2e|2f|5c)/i.test(key)
  )
    throw new Error("Invalid storage key");
  const segments = key.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === ".."))
    throw new Error("Invalid storage key");
  return key;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const s3 = getS3Config();
  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return { key, url: `/manus-storage/${key}` };
  }

  const forge = getForgeConfig();
  if (!forge)
    throw new Error(
      "Storage config missing: configure FORTE_STORAGE_* or BUILT_IN_FORGE_*"
    );
  const presignUrl = new URL("v1/storage/presign/put", forge.forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forge.forgeKey}` },
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!uploadResp.ok)
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const s3 = getS3Config();
  if (s3)
    return getSignedUrl(
      s3.client,
      new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
      { expiresIn: 300 }
    );

  const forge = getForgeConfig();
  if (!forge)
    throw new Error(
      "Storage config missing: configure FORTE_STORAGE_* or BUILT_IN_FORGE_*"
    );
  const getUrl = new URL("v1/storage/presign/get", forge.forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forge.forgeKey}` },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = (await resp.json()) as { url: string };
  if (!url) throw new Error("Forge returned empty signed URL");
  return url;
}

export async function storageRead(
  relKey: string,
  maxBytes = 8 * 1024 * 1024
): Promise<Buffer> {
  const key = normalizeKey(relKey);
  const s3 = getS3Config();
  if (s3) {
    const result = await s3.client.send(
      new GetObjectCommand({ Bucket: s3.bucket, Key: key })
    );
    if (Number(result.ContentLength) > maxBytes)
      throw new Error("Private media exceeds the allowed size");
    const body = result.Body as unknown as
      | (AsyncIterable<Uint8Array> & { destroy?: () => void })
      | undefined;
    if (!body || typeof body[Symbol.asyncIterator] !== "function")
      throw new Error("Private media body is unavailable");
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of body) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        body.destroy?.();
        throw new Error("Private media exceeds the allowed size");
      }
      chunks.push(Buffer.from(chunk));
    }
    if (!totalBytes) throw new Error("Private media is empty");
    return Buffer.concat(chunks, totalBytes);
  }

  const signedUrl = await storageGetSignedUrl(key);
  const response = await fetch(signedUrl, {
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Private media download failed (${response.status})`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Private media exceeds the allowed size");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Private media body is unavailable");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Private media exceeds the allowed size");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!totalBytes) throw new Error("Private media is empty");
  return Buffer.concat(chunks, totalBytes);
}
