import { randomBytes, scrypt } from "node:crypto";

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid administrator email address");
  if (!password || password.length < 16) throw new Error("Set ADMIN_PASSWORD to a unique password with at least 16 characters");

  const salt = randomBytes(16);
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(Buffer.from(key)));
  });
  const encodedHash = `scrypt$16384$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
  const escapedEmail = email.replace(/'/g, "''");
  const escapedHash = encodedHash.replace(/'/g, "''");

  console.log(`insert into public.admin_profiles (email, role, enabled, password_hash)
values ('${escapedEmail}', 'admin', true, '${escapedHash}')
on conflict (email) do update set password_hash = excluded.password_hash, enabled = true, updated_at = now();`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
