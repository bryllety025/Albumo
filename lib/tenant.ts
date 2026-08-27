import { headers } from "next/headers";
import { TENANTS, TENANT_IDS, type TenantId } from "./tenants.config";

export type { TenantId };

const DEFAULT_TENANT: TenantId = "app";

export type TenantConfig = {
  id: TenantId;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3Bucket: string;
  awsS3Folder: string;
  eventName: string;
  eventShortName: string;
};

function isTenantId(value: string | null): value is TenantId {
  return !!value && (TENANT_IDS as readonly string[]).includes(value);
}

// Maps the first label of the request Host header to a tenant id (e.g.
// "demo.albumo.net" -> "demo"). Unknown hosts (custom domains not yet
// mapped, or localhost during `next dev`) fall back to the default tenant.
export function resolveTenantId(host: string | null): TenantId {
  const label = (host ?? "").split(":")[0].split(".")[0].toLowerCase();
  return isTenantId(label) ? label : DEFAULT_TENANT;
}

function readTenantId(get: (key: string) => string | null): TenantId {
  const fromProxyHeader = get("x-tenant-id");
  return isTenantId(fromProxyHeader) ? fromProxyHeader : resolveTenantId(get("host"));
}

// AWS credentials and the S3 bucket are shared across every tenant (a single
// unprefixed set of env vars) — only the S3 key prefix differs per tenant,
// and it's always the tenant_id itself. Event name/short name come from
// tenants.config.ts.
export function getTenantConfig(id: TenantId): TenantConfig {
  const require = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env var ${key}`);
    return value;
  };

  const { eventName, eventShortName } = TENANTS[id];

  return {
    id,
    awsRegion: require("AWS_REGION"),
    awsAccessKeyId: require("AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: require("AWS_SECRET_ACCESS_KEY"),
    awsS3Bucket: require("AWS_S3_BUCKET"),
    awsS3Folder: id,
    eventName,
    eventShortName,
  };
}

// For Route Handlers, which already have the request object at hand.
export function getTenantConfigFromRequest(request: Request): TenantConfig {
  return getTenantConfig(readTenantId((key) => request.headers.get(key)));
}

// For Server Components / generateMetadata / manifest, which read the
// current request's headers via next/headers instead of taking a request
// param directly.
export async function getRequestTenantConfig(): Promise<TenantConfig> {
  const headerList = await headers();
  return getTenantConfig(readTenantId((key) => headerList.get(key)));
}
