import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SSOCallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg text-[13px] text-dim">
      Signing you in…
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
