import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveTenantId } from "@/lib/tenant";

// Resolves the tenant once per request from the Host header and forwards it
// as x-tenant-id so Server Components, generateMetadata, manifest, and
// Route Handlers can all read the same value without re-parsing the host.
export function proxy(request: NextRequest) {
  const tenantId = resolveTenantId(request.headers.get("host"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", tenantId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw.js).*)"],
};
