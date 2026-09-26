import { describe, expect, it } from "vitest";
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret } from "./llm-providers";

describe("secret safety", () => {
  it("encrypts provider secrets at rest and decrypts only on the server", () => {
    const secret = "sk-beta-provider-secret-123456";
    const encrypted = encryptProviderSecret(secret);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptProviderSecret(encrypted)).toBe(secret);
  });

  it("masks both encrypted and legacy plaintext credentials", () => {
    const secret = "papi-secret-abcdef";
    const encrypted = encryptProviderSecret(secret);

    expect(maskProviderSecret(encrypted)).toBe("••••••••cdef");
    expect(maskProviderSecret(secret)).toBe("••••••••cdef");
    expect(maskProviderSecret(encrypted)).not.toContain(secret);
  });

  it("does not recover tampered ciphertext", () => {
    const encrypted = encryptProviderSecret("sensitive-value");
    const tampered = `${encrypted.slice(0, -1)}x`;

    expect(decryptProviderSecret(tampered)).toBe("");
    expect(maskProviderSecret(tampered)).toBe("");
  });
});
