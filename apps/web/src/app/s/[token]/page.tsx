import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assetByShareToken, fileUrl, reviewThread } from "@fashion/core";
import { SharedView } from "@/components/SharedView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const a = await assetByShareToken((await params).token);
  return a ? { title: a.name || "Shared look", openGraph: { images: [fileUrl(a.media === "video" ? a.posterKey : (a.previewKey ?? a.storageKey))!] } } : { title: "Not found" };
}

export default async function SharedPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ review?: string }> }) {
  const { token } = await params;
  const a = await assetByShareToken(token);
  if (!a) notFound();
  const review = (await searchParams).review === "1";
  return (
    <SharedView
      token={token}
      asset={{ name: a.name, media: a.media, url: fileUrl(a.media === "video" ? a.storageKey : (a.previewKey ?? a.storageKey))!, poster: fileUrl(a.posterKey), width: a.width, height: a.height, mime: a.mime }}
      review={review}
      initialComments={review ? await reviewThread(a.id) : []}
    />
  );
}
