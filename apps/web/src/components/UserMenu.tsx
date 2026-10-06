"use client";

import { UserButton } from "@clerk/nextjs";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function UserMenu({ name, email }: { name: string; email: string }) {
  if (clerkOn) return <UserButton appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />;
  return (
    <span title={email} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a2a2a] text-[12px] font-medium text-fg">
      {(name || email || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
