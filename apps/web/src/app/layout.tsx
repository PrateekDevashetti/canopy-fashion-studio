import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Mono, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["300", "400", "500", "600", "700"] });
const mono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", weight: ["300", "400", "500"] });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", style: ["italic", "normal"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Fashion Studio — Canopy Labs", template: "%s · Fashion Studio" },
  description: "Take your idea from sketch to finished campaign, all in one place. Sketch to render, recolor, swap fabrics, dress models and shoot campaigns — by Canopy Labs.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3200"),
  openGraph: { title: "Fashion Studio — Canopy Labs", description: "Take your idea from sketch to finished campaign, all in one place.", images: ["/landing/og.jpg"] },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
  return clerkOn ? (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: "#5bc466", colorBackground: "#141414", borderRadius: "10px", fontFamily: "var(--font-dm-sans)" },
      }}
      localization={{
        signIn: { start: { title: "Sign in to Fashion Studio", subtitle: "Welcome back. Pick up where your collection left off." } },
        signUp: { start: { title: "Create your Canopy account", subtitle: "200 free credits to start. No card needed." } },
      }}
    >
      {body}
    </ClerkProvider>
  ) : (
    body
  );
}
