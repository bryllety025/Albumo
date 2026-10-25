import type { NextConfig } from "next";
import { MAINTENANCE_MODE } from "./lib/maintenance";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // proxy.ts skips /api on purpose (see the note on its matcher), so during maintenance the API routes are covered
  // here instead: a 503 the app's upload retry understands. See lib/maintenance.ts.
  async rewrites() {
    if (!MAINTENANCE_MODE) return [];
    return { beforeFiles: [{ source: "/api/:path*", destination: "/maintenance" }] };
  },
};

export default nextConfig;
