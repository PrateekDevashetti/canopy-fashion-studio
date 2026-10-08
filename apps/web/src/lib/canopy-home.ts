/**
 * Where "back" goes from a Fashion Studio project: Canopy's home, whose Recent
 * Projects lists Fashion Studio projects next to canvases (see
 * app/api/canopy/projects). Override with NEXT_PUBLIC_CANOPY_HOME_URL.
 */
export const CANOPY_HOME = process.env.NEXT_PUBLIC_CANOPY_HOME_URL || "https://app.trycanopy.space/home";

/**
 * Canopy frames Fashion Studio at /studio/fashion. Inside that frame "back" must
 * leave the frame (never load Canopy inside it) and return to the Canopy that
 * framed it (staging or production), read from the referrer. Standalone, it goes
 * to CANOPY_HOME.
 */
export function goCanopyHome(e?: { preventDefault(): void }) {
  e?.preventDefault();
  let href = CANOPY_HOME;
  const framed = typeof window !== "undefined" && window.top !== window.self;
  if (framed && document.referrer) {
    try {
      const origin = new URL(document.referrer).origin;
      if (/(^|\.)trycanopy\.space$/.test(new URL(origin).hostname) || /^https:\/\/floraxfauna[a-z0-9-]*-prateekdevashettis-projects\.vercel\.app$/.test(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        href = `${origin}/home`;
      }
    } catch {
      /* keep CANOPY_HOME */
    }
  }
  if (framed && window.top) window.top.location.href = href;
  else window.location.assign(href);
}
