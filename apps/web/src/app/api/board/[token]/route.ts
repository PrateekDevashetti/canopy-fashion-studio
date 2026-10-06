import { addReview, boardContainsAsset, clientIp, HttpError, rateLimit, reviewBoardByToken, reviewThread } from "@fashion/core";
import { sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

const err = (e: unknown) => (e instanceof HttpError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }));

/** Public review board (anyone with the link). */
export async function GET(_req: Request, { params }: Ctx) {
  const b = await reviewBoardByToken((await params).token);
  if (!b) return Response.json({ error: "This review link is closed or doesn't exist" }, { status: 404 });
  return Response.json(b, { headers: { "cache-control": "no-store" } });
}

/** Comment on / approve one look on the board. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    if (!sameOrigin(req)) throw new HttpError(403, "Cross-origin request blocked");
    if (!(await rateLimit("review", clientIp(req))).ok) throw new HttpError(429, "Too many comments — try again in a minute.");
    const token = (await params).token;
    const b = (await req.json().catch(() => ({}))) as { assetId?: string; author?: string; body?: string; verdict?: string };
    if (typeof b.assetId !== "string" || !(await boardContainsAsset(token, b.assetId))) throw new HttpError(404, "Look not found on this board");
    await addReview(b.assetId, String(b.author ?? ""), String(b.body ?? ""), b.verdict === "approve" || b.verdict === "changes" ? b.verdict : null);
    return Response.json({ comments: await reviewThread(b.assetId) }, { status: 201 });
  } catch (e) {
    return err(e);
  }
}
