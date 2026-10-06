import { createReviewBoard, listReviewBoards } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Review boards for this project (Review Mode panel). */
export const GET = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  return json({ boards: await listReviewBoards(user.id, id) });
});

/** "Share for review": one link for the selected looks. */
export const POST = route<Ctx>(
  async (req, user, { params }) => {
    const { id } = await params;
    const b = await body<{ assetIds?: unknown; title?: unknown }>(req);
    const ids = Array.isArray(b.assetIds) ? b.assetIds.filter((x): x is string => typeof x === "string") : [];
    const { token } = await createReviewBoard(user.id, id, ids, typeof b.title === "string" ? b.title : undefined);
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    return json({ url: `${origin}/r/${token}`, token }, 201);
  },
  { limit: "edits" },
);
