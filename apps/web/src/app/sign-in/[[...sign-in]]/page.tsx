import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect(redirect_url ?? "/studio");
  return (
    <AuthShell>
      <SignIn fallbackRedirectUrl={redirect_url ?? "/studio"} signUpUrl="/sign-up" />
    </AuthShell>
  );
}
