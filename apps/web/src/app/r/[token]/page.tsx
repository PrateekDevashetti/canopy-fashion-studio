import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reviewBoardByToken } from "@fashion/core";
import { ReviewBoardView } from "@/components/ReviewBoardView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const b = await reviewBoardByToken((await params).token);
  if (!b) return { title: "Review not found" };
  const cover = b.looks[0]?.asset;
  return { title: `${b.board.title} — Review`, robots: { index: false }, openGraph: { images: cover ? [cover.poster ?? cover.url] : [] } };
}

export default async function ReviewBoardPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ view?: string }> }) {
  const { token } = await params;
  const b = await reviewBoardByToken(token);
  if (!b) notFound();
  return <ReviewBoardView token={token} board={b.board} looks={b.looks as never} viewOnly={(await searchParams).view === "1"} />;
}
