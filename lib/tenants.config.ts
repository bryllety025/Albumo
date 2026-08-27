// Single source of truth for which tenants (subdomains) exist and their
// public-facing event details. AWS credentials and the S3 bucket are shared
// across every tenant (see .env) — the only thing that separates tenants in
// storage is the S3 key prefix, which is always the tenant_id itself.
//
// To add a new subdomain: add its host label as a key here, then point
// <label>.albumo.net at this deployment.
export type TenantId = "app" | "demo" | "ellenandbryllewedding";

export type TenantMeta = {
  tenantId: TenantId;
  // Displayed as the page title, home-screen badge, PWA name, and
  // notification title for this tenant.
  eventName: string;
  eventShortName: string;
};

export const TENANTS: Record<TenantId, TenantMeta> = {
  app: {
    tenantId: "app",
    eventName: "Ellen and Brylle Wedding",
    eventShortName: "E&B Wedding",
  },
  demo: {
    tenantId: "demo",
    eventName: "Albumo Demo",
    eventShortName: "Demo",
  },
  ellenandbryllewedding: {
    tenantId: "ellenandbryllewedding",
    eventName: "Ellen and Brylle Wedding",
    eventShortName: "E&B Wedding",
  },
};

export const TENANT_IDS = Object.keys(TENANTS) as TenantId[];
