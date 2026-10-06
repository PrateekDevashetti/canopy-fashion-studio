import { closeReviewBoard } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ boardId: string }> };

/** Close a review link (it stops working for reviewers). */
export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  await closeReviewBoard(user.id, (await params).boardId);
  return json({ ok: true });
});
