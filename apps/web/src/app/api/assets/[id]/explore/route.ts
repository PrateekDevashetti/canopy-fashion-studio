import { isPublished, publishToExplore, unpublishFromExplore } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, _user, { params }) => json({ published: await isPublished((await params).id) }));

/** Publish to Explore. */
export const POST = route<Ctx>(
  async (req, user, { params }) => {
    const b = await body<{ title?: unknown }>(req).catch(() => ({}) as { title?: unknown });
    await publishToExplore(user.id, (await params).id, typeof b.title === "string" ? b.title : undefined);
    return json({ published: true }, 201);
  },
  { limit: "edits" },
);

export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  await unpublishFromExplore(user.id, (await params).id);
  return json({ published: false });
});
