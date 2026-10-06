import { addReview, assetByShareToken, HttpError, reviewThread } from "@fashion/core";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

const err = (e: unknown) => (e instanceof HttpError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "Something went wrong" }, { status: 500 }));

/** Public review thread on a shared result (anyone with the link). */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await assetByShareToken((await params).token);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ comments: await reviewThread(a.id) });
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const a = await assetByShareToken((await params).token);
    if (!a) throw new HttpError(404, "Not found");
    const b = (await req.json().catch(() => ({}))) as { author?: string; body?: string; verdict?: string };
    await addReview(a.id, String(b.author ?? ""), String(b.body ?? ""), b.verdict === "approve" || b.verdict === "changes" ? b.verdict : null);
    return Response.json({ comments: await reviewThread(a.id) }, { status: 201 });
  } catch (e) {
    return err(e);
  }
}
