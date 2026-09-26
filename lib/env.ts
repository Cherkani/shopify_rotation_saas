import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SHOPIFY_WEBHOOK_SECRETS_JSON: z.string().min(2).optional(),
  SHOPIFY_WEBHOOK_ENCRYPTION_KEY: z.string().min(32).optional(),
  ROUTER_CLICK_SIGNING_SECRET: z.string().min(32).optional(),
  APP_URL: z.url(),
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
}).refine((value) => Boolean(value.SUPABASE_SECRET_KEY || value.SUPABASE_SERVICE_ROLE_KEY), {
  message: "Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  path: ["SUPABASE_SECRET_KEY"],
});

export type AppEnv = z.infer<typeof serverSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

export function getPublicEnv() {
  const result = publicSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid public environment configuration: ${result.error.message}`);
  return result.data;
}

function getWebhookSecretMap(serialized: string | undefined): Record<string, string> {
  if (!serialized) return {};
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([domain, secret]) =>
      /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain.toLowerCase()) && typeof secret === "string" && secret.length > 0,
    ).map(([domain, secret]) => [domain.toLowerCase(), secret]));
  } catch {
    return {};
  }
}

export function getShopifyWebhookSecret(shopDomain: string): string | null {
  const env = getEnv();
  const normalized = shopDomain.toLowerCase().trim();
  const mappedSecret = getWebhookSecretMap(env.SHOPIFY_WEBHOOK_SECRETS_JSON)[normalized];
  return mappedSecret ?? null;
}
