import { createHmac, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

const COOKIE_NAME = "rotator_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type SessionPayload = { email: string; expiresAt: number };

function signingSecret() {
  const env = getEnv();
  return env.ADMIN_SESSION_SECRET ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!;
}

function sign(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

export async function verifyAdminPassword(password: string, encodedHash: string) {
  const [algorithm, n, r, p, encodedSalt, encodedDerivedKey] = encodedHash.split("$");
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !encodedSalt || !encodedDerivedKey) return false;
  const expected = Buffer.from(encodedDerivedKey, "base64url");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(encodedSalt, "base64url"), expected.length, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => error ? reject(error) : resolve(Buffer.from(derivedKey)));
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createAdminSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000 })).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!decoded.email || !Number.isFinite(decoded.expiresAt) || decoded.expiresAt <= Date.now()) return null;
    return { email: decoded.email.toLowerCase(), expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}
