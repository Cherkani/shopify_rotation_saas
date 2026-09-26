import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function keyFromEnvironment() {
  const raw = process.env.SHOPIFY_WEBHOOK_ENCRYPTION_KEY ?? process.env.ADMIN_SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("Set SHOPIFY_WEBHOOK_ENCRYPTION_KEY or a 32-character ADMIN_SESSION_SECRET");
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFromEnvironment(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptWebhookSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted webhook secret");
  const decipher = createDecipheriv(algorithm, keyFromEnvironment(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}
