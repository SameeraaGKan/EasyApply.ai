import "server-only";
import crypto from "node:crypto";

/**
 * Application-level column encryption for extra-sensitive profile fields
 * (voluntary EEO disclosures — plan Section 7 security table). AES-256-GCM,
 * ciphertext layout `iv(12) || ciphertext || authTag(16)`, base64-encoded
 * as one string for storage in a text column.
 *
 * This exact layout is mirrored in agent-service/app/crypto.py — the
 * Form-Filler agent needs to decrypt these fields too (it reads profiles
 * directly from Neon), so both sides must produce/consume byte-identical
 * ciphertexts. Round-trip cross-language compatibility is verified in
 * agent-service's test suite setup, not just assumed.
 */

function getKey(): Buffer {
  const raw = process.env.PROFILE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("PROFILE_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PROFILE_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)");
  }
  return key;
}

export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function decryptField(encoded: string): string {
  const key = getKey();
  const combined = Buffer.from(encoded, "base64");
  if (combined.length < 12 + 16) {
    throw new Error("Malformed encrypted field");
  }
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Pass-through for null/empty values — EEO fields are voluntary, so
 * "not provided" must round-trip as null, not as an encrypted empty string. */
export function encryptNullable(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  return encryptField(plaintext);
}

export function decryptNullable(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  return decryptField(encoded);
}
