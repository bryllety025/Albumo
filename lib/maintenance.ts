// Temporary "under maintenance" switch. While it is on, every page request is answered with the maintenance page
// (see proxy.ts) and every /api request with a 503 (see next.config.ts); both are served by app/maintenance/route.ts.
//
// It is on unless MAINTENANCE_MODE=false is set in the environment, e.g. in .env.local to keep working on
// localhost while the deployed app stays in maintenance. The rewrites in next.config.ts are fixed at build time
// while proxy.ts reads it at run time, so for a deployment the variable has to be there for the build and for
// `next start` (an .env file does both), and the app needs a rebuild to pick a change up.
//
// To end the maintenance for good, remove the whole thing: this file, app/maintenance/, the MAINTENANCE_MODE
// block at the top of proxy.ts and the rewrites() in next.config.ts.
export const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE !== "false";
