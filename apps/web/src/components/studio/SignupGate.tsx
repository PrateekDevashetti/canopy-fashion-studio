"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useSignUp } from "@clerk/nextjs";
import { CanopyMark, Spinner } from "@/components/ui";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const DONE = "/api/guest/claim";

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden>
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  );
}

function OAuthButtons() {
  const { signUp } = useSignUp();
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (strategy: "oauth_google" | "oauth_microsoft") => {
    setBusy(strategy);
    try {
      if (!signUp) throw new Error("not ready");
      const r = await signUp.sso({ strategy, redirectUrl: DONE, redirectCallbackUrl: "/sso-callback" });
      if (r?.error) throw r.error;
    } catch {
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent(DONE)}`;
    }
  };
  return (
    <>
      <button className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#e9e9e9] text-[13.5px] font-medium text-black hover:bg-white" onClick={() => void go("oauth_google")}>
        {busy === "oauth_google" ? <Spinner size={14} /> : <GoogleIcon />} Google
      </button>
      <button className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#e9e9e9] text-[13.5px] font-medium text-black hover:bg-white" onClick={() => void go("oauth_microsoft")}>
        {busy === "oauth_microsoft" ? <Spinner size={14} /> : <MicrosoftIcon />} Microsoft
      </button>
    </>
  );
}

/** "Sign up to try out Fashion Studio!" — shown when a signed-out demo user tries a real action. */
export function SignupGate({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  return createPortal(
    <div className="fixed inset-0 z-[96] flex animate-fade-in items-center justify-center bg-black/55 backdrop-blur-[3px]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-[540px] max-w-[92vw] animate-pop overflow-hidden rounded-[18px] border border-line-2 bg-[#121212] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_85%_40%,rgba(255,120,40,0.35),transparent_60%),radial-gradient(ellipse_40%_60%_at_95%_80%,rgba(0,180,200,0.25),transparent_60%)]" />
        <button aria-label="Close" className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-dim hover:bg-white/10 hover:text-fg" onClick={onClose}>
          <X size={16} />
        </button>
        <div className="relative flex w-[290px] flex-col items-center px-8 py-9 text-center">
          <CanopyMark size={28} />
          <h2 className="mt-4 text-[19px] font-medium text-fg">Sign up to try out Fashion Studio!</h2>
          <div className="mt-5 w-full">
            {clerkOn ? (
              <OAuthButtons />
            ) : (
              <a href="/sign-up" className="flex h-10 w-full items-center justify-center rounded-[10px] bg-[#e9e9e9] text-[13.5px] font-medium text-black">
                Create account
              </a>
            )}
          </div>
          <div className="my-3 text-[11.5px] text-mute">OR</div>
          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = `/sign-up?redirect_url=${encodeURIComponent(DONE)}${email ? `&email_address=${encodeURIComponent(email)}` : ""}`;
            }}
          >
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" className="field h-10 w-full px-3" />
            <button className="mt-2 h-10 w-full rounded-[10px] bg-[#262626] text-[13px] text-fg-2 hover:bg-[#2e2e2e]">Continue with email</button>
          </form>
          <a href={`/sign-in?redirect_url=${encodeURIComponent(DONE)}`} className="mt-4 text-[12px] text-dim hover:text-fg">
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
