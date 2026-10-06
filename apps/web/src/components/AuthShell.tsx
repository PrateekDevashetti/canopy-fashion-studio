import Link from "next/link";
import { CanopyMark } from "@/components/ui";

/** Shared frame for Clerk's sign-in / sign-up: Canopy mark, hero still, dark panel. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/hero.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
      <Link href="/" className="absolute top-6 left-6 z-10 flex items-center gap-2.5 text-[14px] font-medium text-fg">
        <CanopyMark size={22} /> Fashion Studio
      </Link>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
