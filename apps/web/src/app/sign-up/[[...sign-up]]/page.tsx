import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";

export const metadata = { title: "Create your account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string; email_address?: string }> }) {
  const { redirect_url, email_address } = await searchParams;
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect(redirect_url ?? "/studio");
  return (
    <AuthShell>
      <SignUp fallbackRedirectUrl={redirect_url ?? "/studio"} signInUrl="/sign-in" initialValues={email_address ? { emailAddress: email_address } : undefined} />
    </AuthShell>
  );
}
