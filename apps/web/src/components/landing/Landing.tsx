"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/components/ui";
import { FAQ, FOOTER, NAV, SECTIONS_COPY, TOOL_LIST, VALUES, WORKFLOW, type Card } from "./content";

const STUDIO = "/studio";
const SALES = "mailto:hello@trycanopy.space?subject=Fashion%20Studio";
const SIGNUP = "/sign-up?redirect_url=/studio";
const WRAP = "mx-auto w-full max-w-[1600px] px-6 md:px-[89px]";

/** Fade/rise elements in as they scroll into view. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("transition-all duration-700 ease-out", on ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="Canopy Labs — Fashion Studio">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/canopy-mark.svg" alt="" className="h-[30px] w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/canopy-text-white.png" alt="Canopy" className="h-[26px] w-auto" />
    </Link>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 20);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-300", scrolled ? "bg-black/75 backdrop-blur-md" : "bg-black")}>
      <div className={cn(WRAP, "flex h-[80px] items-center gap-10")}>
        <Logo />
        <nav className="hidden items-center gap-[23px] lg:flex" onMouseLeave={() => setOpen(null)}>
          {NAV.map((item) =>
            "items" in item ? (
              <div key={item.label} className="relative" onMouseEnter={() => setOpen(item.label)}>
                <button className="flex items-center gap-1.5 py-6 text-[16px] text-[#c9c9c9] transition-colors hover:text-white" onClick={() => setOpen(open === item.label ? null : item.label)} aria-expanded={open === item.label}>
                  {item.label} <ChevronDown size={14} className={cn("transition-transform", open === item.label && "rotate-180")} />
                </button>
                {open === item.label && (
                  <div className="absolute top-[64px] left-[-16px] w-[300px] animate-pop rounded-[14px] border border-[#262626] bg-[#111] p-2 shadow-2xl">
                    {item.items.map((l) => (
                      <a key={l.label} href={l.href} className="block rounded-[10px] px-3 py-2.5 hover:bg-[#1c1c1c]" onClick={() => setOpen(null)}>
                        <span className="block text-[14.5px] text-white">{l.label}</span>
                        <span className="block text-[12.5px] text-[#8c8c8c]">{l.desc}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <a key={item.label} href={item.href} className="text-[16px] text-[#c9c9c9] transition-colors hover:text-white">
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-[13px]">
          <a href={SALES} className="hidden h-[44px] items-center rounded-[11px] border border-white/90 px-[13px] text-[16px] text-white transition-colors hover:bg-white hover:text-black sm:flex">
            Contact sales
          </a>
          <a href={SIGNUP} className="flex h-[44px] items-center rounded-[11px] bg-white px-[13px] text-[16px] text-black transition-opacity hover:opacity-90">
            Get started for free
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return (
    <section className="relative mt-[80px] h-[582px] overflow-hidden" aria-label="Introducing Fashion Studio">
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/landing/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video className="absolute inset-0 h-full w-full object-cover" src="/landing/hero.mp4" poster="/landing/hero.jpg" autoPlay muted loop playsInline aria-hidden />
      )}
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative flex h-full flex-col items-center justify-center px-6 pb-6 text-center">
        <div className="animate-rise text-[13px] font-medium tracking-[0.25em] text-white/55 uppercase">Introducing</div>
        <h1 className="mt-4 animate-rise font-serif text-[56px] leading-none font-normal text-white italic [animation-delay:80ms] md:text-[78px]">Fashion Studio</h1>
        <p className="mt-6 animate-rise text-[16px] text-white/90 [animation-delay:160ms] md:text-[18.5px]">Take your idea from sketch to finished campaign, all in one place.</p>
        <div className="mt-[46px] flex animate-rise gap-[13px] [animation-delay:240ms]">
          <Link href={STUDIO} className="flex h-[53px] items-center rounded-[10px] bg-[#6cc177] px-[29px] text-[17.5px] text-[#0b1a0d] transition-colors hover:bg-[#7dd087]">
            Go to Fashion Studio
          </Link>
          <a href={SALES} className="flex h-[53px] items-center rounded-[10px] border border-white/85 px-[29px] text-[17.5px] text-white transition-colors hover:bg-white hover:text-black">
            Contact sales
          </a>
        </div>
      </div>
    </section>
  );
}

function BuiltFor() {
  const words = ["Apparel", "Footwear", "Luxury", "E-Commerce", "Sportswear", "Agencies"];
  return (
    <section className="py-[38px] text-center">
      <p className="text-[15.5px] text-[#9a9a9a]">Built for design teams across</p>
      <div className="mt-[22px] flex flex-wrap items-center justify-center gap-x-[42px] gap-y-3 px-6">
        {words.map((w, i) => (
          <span key={w} className={cn("text-[26px] tracking-[-0.01em] text-[#5f5f5f] transition-colors hover:text-[#9a9a9a]", i % 3 === 0 ? "font-serif italic" : i % 3 === 1 ? "font-bold tracking-[0.04em] uppercase text-[21px]" : "font-light")}>
            {w}
          </span>
        ))}
      </div>
    </section>
  );
}

function Workflow() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <section className="pt-[90px]">
      <Reveal>
        <p className="mx-auto max-w-[560px] px-6 text-center text-[24px] leading-[1.35] tracking-[-0.01em] text-[#ececec] md:text-[30px]">Fashion Studio brings every step in one visual workflow. Jump in and use over 10 different purpose-built tools right away.</p>
      </Reveal>
      <Reveal delay={100}>
        <div className="mx-auto mt-[68px] w-[calc(100%-48px)] max-w-[1156px] rounded-[16px] border border-[#2a2a2a] px-[42px] pt-[11px] pb-[60px]">
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {WORKFLOW.map((w, i) => (
              <div key={w.n} className="flex items-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="w-[205px] shrink-0">
                  <div className={cn("overflow-hidden rounded-[6px] transition-all duration-300", hover != null && hover !== i && "opacity-55")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.img} alt={w.label} className={cn("aspect-square w-full object-cover transition-transform duration-500", hover === i && "scale-[1.04]")} />
                  </div>
                  <div className="mt-[7px] flex justify-between text-[10.5px]">
                    <span className="text-[#6cc177]">{w.n}</span>
                    <span className="text-white">{w.label}</span>
                  </div>
                </div>
                {i < WORKFLOW.length - 1 && (
                  <span className="z-10 -mx-[10px] mb-[18px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-[#6cc177] text-[#0b1a0d]">
                    <ArrowRight size={11} strokeWidth={2.5} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Values() {
  return (
    <section className={cn(WRAP, "pt-[63px]")}>
      <div className="grid gap-10 md:grid-cols-3 md:gap-[39px]">
        {VALUES.map((v, i) => (
          <Reveal key={v.n} delay={i * 90} className="border-t border-[#3a3a3a] pt-[18px]">
            <div className="text-[13px] text-[#9a9a9a]">{v.n}</div>
            <h3 className="mt-[13px] text-[29px] font-medium tracking-[-0.015em] text-white">{v.title}</h3>
            <p className="mt-[16px] text-[18px] leading-[1.65] text-[#8f8f8f]">{v.body}</p>
          </Reveal>
        ))}
      </div>
      <div className="mt-[66px] flex justify-center">
        <Link href={STUDIO} className="flex h-[53px] items-center rounded-[10px] border border-white/85 px-[28px] text-[17.5px] text-white transition-colors hover:bg-white hover:text-black">
          Go to Fashion Studio
        </Link>
      </div>
    </section>
  );
}

function SketchMock() {
  return (
    <>
      <div className="absolute top-[47px] bottom-0 left-0 w-[148px] rounded-tr-[10px] border border-[#2d2d2d] bg-[#151515]/95 p-[10px]">
        <div className="flex gap-[6px]">
          <div className="h-[60px] flex-1 rounded-[8px] bg-[#262626]" />
          <div className="h-[60px] flex-1 rounded-[8px] border border-dashed border-[#3a3a3a]" />
        </div>
        <div className="my-3 text-center text-[11px] text-[#cfcfcf]">Concept</div>
        <div className="grid grid-cols-2 gap-[8px]">
          {[
            ["prompt", "Prompt"],
            ["sketch", "Sketch"],
            ["extract", "Extract"],
            ["concept", "Concept"],
          ].map(([i, l]) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={cn("flex h-[52px] w-[52px] items-center justify-center rounded-[10px]", i === "sketch" && "bg-[#1b3320]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/studio/icons/${i}.png`} alt="" className="h-[38px] w-[38px] object-contain" />
              </span>
              <span className={cn("text-[10.5px]", i === "sketch" ? "text-white" : "text-[#8a8a8a]")}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-[260px] rounded-tl-[12px] border border-[#2d2d2d] bg-[#151515]/95 p-[13px]">
        <div className="text-[12.5px] text-white">
          Sketch to Render <span className="ml-1 text-[11px] text-[#7a7a7a]">v1.0</span>
        </div>
        <div className="mt-1 text-[10.5px] leading-[1.4] text-[#8a8a8a]">Turns a hand-drawn fashion sketch into a photorealistic garment render.</div>
        <div className="mt-3 text-[10.5px] text-[#cfcfcf]">Sketch</div>
        <div className="mt-1.5 flex items-center gap-2 rounded-[9px] border border-[#2d2d2d] bg-[#1b1b1b] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/studio/tour/sketch.jpg" alt="" className="h-[34px] w-[34px] rounded-[6px] object-cover" />
          <div>
            <div className="text-[11.5px] text-white">Applying to</div>
            <div className="text-[10.5px] text-[#8a8a8a]">Zip Cardigan Drawing.jpg</div>
          </div>
        </div>
      </div>
    </>
  );
}

function ToolCard({ c }: { c: Card }) {
  const vid = useRef<HTMLVideoElement>(null);
  return (
    <Link
      href={`${STUDIO}?tool=${c.tool}`}
      className="group block rounded-[21px] border border-[#222] bg-[#1b1b1b] p-[13px] transition-colors hover:bg-[#1f1f1f]"
      onMouseEnter={() => void vid.current?.play().catch(() => {})}
      onMouseLeave={() => vid.current?.pause()}
    >
      <div className="relative h-[260px] overflow-hidden rounded-[13px] bg-[#111] md:h-[365px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.img} alt={c.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
        {c.video && <video ref={vid} src={c.video} muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
        {c.mock && <SketchMock />}
      </div>
      <div className="px-[10px] pt-[34px] pb-[12px]">
        <h3 className="text-[24px] font-medium tracking-[-0.01em] text-white">{c.title}</h3>
        <p className="mt-[10px] text-[13px] text-[#a5a5a5]">{c.desc}</p>
        <div className="mt-[30px] flex items-center gap-1 text-[10.5px] font-medium tracking-[0.12em] text-[#6cc177] uppercase">
          Try it now <ArrowRight size={11} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}

function ToolSection({ s }: { s: (typeof SECTIONS_COPY)[number] }) {
  return (
    <section id={s.id} className={cn(WRAP, "scroll-mt-[90px] pt-[118px]")}>
      <Reveal>
        <div className="flex items-baseline gap-[14px]">
          <span className="text-[18px] text-[#6cc177]">{s.n}</span>
          <span className="text-[15px] font-medium tracking-[0.2em] text-[#9a9a9a] uppercase">{s.kicker}</span>
        </div>
        <h2 className="mt-[14px] text-[40px] font-semibold tracking-[-0.025em] text-white md:text-[54px]">{s.title}</h2>
        <div className="mt-[18px] flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="max-w-[820px] text-[19.5px] leading-[1.55] text-[#a5a5a5]">{s.body}</p>
          <Link href={STUDIO} className="group flex shrink-0 items-center gap-2 text-[17.5px] text-white">
            Explore Fashion Studio <ArrowRight size={16} className="text-[#6cc177] transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </Reveal>
      <div className="mt-[24px] grid gap-[23px] md:grid-cols-2">
        {s.cards.map((c, i) => (
          <Reveal key={c.title} delay={(i % 2) * 90}>
            <ToolCard c={c} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ToolList() {
  return (
    <section id="tools" className={cn(WRAP, "scroll-mt-[90px] pt-[150px]")}>
      <Reveal>
        <h2 className="text-[30px] font-semibold tracking-[-0.02em] text-white md:text-[37px]">Every tool you need to make it real.</h2>
      </Reveal>
      <div className="mt-[34px] grid gap-10 md:grid-cols-3 md:gap-[49px]">
        {TOOL_LIST.map((col) => (
          <Reveal key={col.col} className="border-t border-[#3a3a3a] pt-[30px]">
            <div className="font-mono text-[12.5px] tracking-[0.06em] text-[#9a9a9a] uppercase">{col.col}</div>
            <ul className="mt-[30px] flex flex-col gap-[26px]">
              {col.items.map((t) => (
                <li key={t.name}>
                  {t.tool ? (
                    <Link href={`${STUDIO}?tool=${t.tool}`} className="group inline-flex items-center gap-2 text-[18px] font-medium text-white hover:text-[#6cc177]">
                      {t.name}
                    </Link>
                  ) : (
                    <span className={cn("inline-flex items-center gap-2 text-[18px] font-medium", t.soon ? "text-[#8a8a8a]" : "text-white")}>
                      {t.name}
                      {t.soon && <span className="rounded-[4px] border border-[#5a5a5a] px-[6px] py-[1px] text-[9.5px] font-medium tracking-[0.04em] text-[#bdbdbd] uppercase">Soon</span>}
                    </span>
                  )}
                  <p className="mt-[8px] text-[14.5px] leading-[1.45] text-[#9a9a9a]">{t.desc}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number[]>([0]);
  return (
    <section id="faq" className={cn(WRAP, "grid scroll-mt-[90px] gap-10 pt-[180px] md:grid-cols-[1fr_1.9fr] md:gap-[90px]")}>
      <Reveal>
        <h2 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-white md:text-[43px]">
          Frequently asked
          <br />
          questions
        </h2>
        <p className="mt-[30px] max-w-[380px] text-[18px] leading-[1.5] text-[#a5a5a5]">Everything else you might want to know before you talk to our team.</p>
        <Link href={STUDIO} className="group mt-[42px] inline-flex items-center gap-2 text-[17.5px] text-white">
          <span className="underline decoration-white/50 underline-offset-[6px]">Try Fashion Studio now</span>
          <ArrowRight size={15} className="text-[#6cc177] transition-transform group-hover:translate-x-1" />
        </Link>
      </Reveal>
      <div>
        {FAQ.map((f, i) => {
          const on = open.includes(i);
          return (
            <div key={f.q} className="border-b border-[#2e2e2e]">
              <button className="flex w-full items-center justify-between gap-6 py-[30px] text-left" aria-expanded={on} onClick={() => setOpen((o) => (on ? o.filter((x) => x !== i) : [...o, i]))}>
                <span className="text-[18.5px] font-medium text-white">{f.q}</span>
                {on ? <Minus size={16} className="shrink-0 text-[#9a9a9a]" /> : <Plus size={16} className="shrink-0 text-[#9a9a9a]" />}
              </button>
              <div className={cn("grid transition-all duration-300 ease-out", on ? "grid-rows-[1fr] pb-[30px] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  {f.a.map((p) => (
                    <p key={p.slice(0, 20)} className="mb-[26px] text-[17.5px] leading-[1.62] text-[#a5a5a5] last:mb-0">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-6 pt-[200px] pb-[200px] text-center">
      <Reveal>
        <h2 className="text-[44px] leading-[1.12] font-semibold tracking-[-0.03em] text-[#f2f2f2] md:text-[62px]">
          Fashion is pain.
          <br />
          Canopy is seamless.
        </h2>
        <div className="mt-[66px] flex justify-center gap-[14px]">
          <a href={SIGNUP} className="flex h-[54px] items-center rounded-[10px] bg-[#f0f0f0] px-[29px] text-[17.5px] text-black transition-opacity hover:opacity-90">
            Get started free
          </a>
          <a href={SALES} className="flex h-[54px] items-center rounded-[10px] border border-white/85 px-[29px] text-[17.5px] text-white transition-colors hover:bg-white hover:text-black">
            Talk to sales
          </a>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0b0b0b]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/footer.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/70" />
      <div className={cn(WRAP, "relative grid gap-10 pt-[78px] pb-[60px] md:grid-cols-[1.6fr_repeat(5,1fr)]")}>
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/canopy-mark.svg" alt="Canopy" className="h-[30px] w-auto opacity-75" />
            <div className="text-[12.5px] leading-[1.45] text-[#a5a5a5]">
              Copyright © {new Date().getFullYear()} Canopy Labs
              <br />
              All rights reserved.
            </div>
          </div>
        </div>
        {FOOTER.map((c) => (
          <div key={c.title}>
            <div className="text-[16px] font-medium text-white">{c.title}</div>
            <ul className="mt-[18px] flex flex-col gap-[14px]">
              {c.links.map(([l, h]) => (
                <li key={l}>
                  <a href={h} className="text-[15px] text-[#a5a5a5] transition-colors hover:text-white">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative -mb-[3vw] overflow-hidden px-6 text-center font-serif text-[22vw] leading-[0.9] text-white/[0.06] italic select-none">Canopy</div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="outline-none">
      <Hero />
      <BuiltFor />
      <Workflow />
      <Values />
      {SECTIONS_COPY.map((s) => (
        <ToolSection key={s.id} s={s} />
      ))}
      <ToolList />
      <Faq />
      <Cta />
      </main>
      <Footer />
    </div>
  );
}
