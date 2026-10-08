import { NextResponse } from "next/server";
import { listProjects } from "@fashion/core";
import { getAccountUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Read-only project list for the Canopy app, so Fashion Studio projects show in
 * Canopy's Recent Projects. Canopy sends its Clerk session token as a Bearer
 * header (same Clerk instance, same user ids); clerkMiddleware authenticates it.
 * Only Canopy's own origins get CORS, and guests get nothing.
 */
const ALLOWED = (process.env.CANOPY_APP_ORIGINS ??
  "https://app.trycanopy.space,https://staging.trycanopy.space,https://trycanopy.space,http://localhost:5173,http://localhost:5197,http://localhost:5198")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Vercel previews of the Canopy app (project floraxfauna).
const PREVIEW = /^https:\/\/floraxfauna[a-z0-9-]*-prateekdevashettis-projects\.vercel\.app$/;

const allowed = (origin: string | null) => !!origin && (ALLOWED.includes(origin) || PREVIEW.test(origin));

function cors(origin: string | null): Record<string, string> {
  if (!allowed(origin)) return {};
  return {
    "access-control-allow-origin": origin!,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: allowed(origin) ? 204 : 403, headers: cors(origin) });
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (origin && !allowed(origin)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  try {
    const user = await getAccountUser();
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401, headers });
    const projects = (await listProjects(user.id)).slice(0, 30).map((p) => ({
      id: p.id,
      name: p.name,
      cover: p.cover,
      updatedAt: p.updatedAt ?? null,
      lastOpenedAt: p.lastOpenedAt ?? null,
    }));
    return NextResponse.json({ projects }, { headers });
  } catch (e) {
    console.error("[api] GET /api/canopy/projects", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500, headers });
  }
}
