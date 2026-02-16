import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PAYLOAD_VERSION = "v1";

function decodeKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const asBase64Url = Buffer.from(trimmed, "base64url");
  if (asBase64Url.length === 32) {
    return asBase64Url;
  }

  const asBase64 = Buffer.from(trimmed, "base64");
  if (asBase64.length === 32) {
    return asBase64;
  }

  const asUtf8 = Buffer.from(trimmed, "utf8");
  if (asUtf8.length === 32) {
    return asUtf8;
  }

  throw new Error(
    "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (hex, base64/base64url, or raw 32-char string)",
  );
}

const encryptionKey = decodeKey(env.TOKEN_ENCRYPTION_KEY);

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PAYLOAD_VERSION}.${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptToken(payload: string): string {
  const [version, ivRaw, authTagRaw, ciphertextRaw] = payload.split(".");

  if (
    version !== PAYLOAD_VERSION ||
    !ivRaw ||
    !authTagRaw ||
    !ciphertextRaw
  ) {
    throw new Error("Invalid encrypted token payload format");
  }

  const iv = Buffer.from(ivRaw, "base64url");
  const authTag = Buffer.from(authTagRaw, "base64url");
  const ciphertext = Buffer.from(ciphertextRaw, "base64url");

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error("Invalid encrypted token IV length");
  }

  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted token auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
