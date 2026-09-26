import Link from "next/link";
import { ArrowRight, Check, ChevronRight, CircleDot, Gauge, LockKeyhole, Route, ShieldCheck, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";

const principles = [
  ["One link per group", "Create a dedicated campaign route for each group of stores. Every link has one clear destination set."],
  ["Rotation you can explain", "Use equal or custom verified-sales steps to control the sequence without hiding the decision logic."],
  ["Ready means verified", "Stores without a Shopify webhook key are visibly blocked before they can receive routed traffic."],
] as const;

export default function HomePage() {
  return <main id="main-content" className="landing-shell min-h-dvh overflow-hidden text-stone-100">
    <a className="landing-skip-link" href="#main">Skip to content</a>
    <div className="landing-noise" aria-hidden="true" />
    <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
      <Link href="/" className="group flex items-center gap-3" aria-label="TargetFlow home">
        <span className="landing-mark" aria-hidden="true"><Route className="size-4" /></span>
        <span className="text-sm font-semibold tracking-[0.16em] text-stone-100">TARGETFLOW</span>
      </Link>
      <nav aria-label="Primary navigation" className="flex items-center gap-2">
        <a href="#how-it-works" className="hidden rounded-full px-4 py-2 text-sm text-stone-400 transition-colors hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:block">How it works</a>
        <Button asChild size="sm" className="landing-nav-cta"><Link href="/admin">Open control room <ArrowRight aria-hidden="true" /></Link></Button>
      </nav>
    </header>

    <section id="main" className="relative z-10 mx-auto grid w-full max-w-7xl gap-14 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[0.98fr_1.02fr] lg:items-center lg:gap-20 lg:px-10 lg:pb-24 lg:pt-24">
      <div className="max-w-2xl">
        <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-amber-300"><CircleDot className="size-3.5" aria-hidden="true" /> Commerce routing, made legible</p>
        <h1 className="landing-display text-balance text-5xl leading-[0.96] tracking-[-0.055em] text-stone-50 sm:text-6xl lg:text-7xl">One campaign.<br /><em>Every store</em> in balance.</h1>
        <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">TargetFlow gives every group of Shopify stores its own campaign link. Route visitors through transparent rotation steps, protect incomplete destinations, and see what happened in one operating view.</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg" className="landing-primary-cta"><Link href="/admin">Enter the control room <ArrowRight aria-hidden="true" /></Link></Button><Button asChild variant="outline" size="lg" className="landing-secondary-cta"><a href="#how-it-works">See the routing model <ChevronRight aria-hidden="true" /></a></Button></div>
        <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-stone-400"><span className="flex items-center gap-2"><Check className="size-4 text-amber-300" aria-hidden="true" /> One-hop redirects</span><span className="flex items-center gap-2"><Check className="size-4 text-amber-300" aria-hidden="true" /> Independent store controls</span><span className="flex items-center gap-2"><Check className="size-4 text-amber-300" aria-hidden="true" /> Attribution-aware</span></div>
      </div>

      <div className="landing-console" aria-label="Illustration of the traffic routing workflow">
        <div className="landing-console-top"><span className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-stone-400"><span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" /> GROUP ROUTE LIVE</span><span className="text-xs text-stone-500">CUSTOM SALES</span></div>
        <div className="landing-route-map">
          <div className="landing-source"><span className="landing-icon-wrap"><Gauge className="size-5" aria-hidden="true" /></span><div><p>Meta campaign</p><span>One group link</span></div></div>
          <div className="landing-route-line" aria-hidden="true"><span /></div>
          <div className="landing-router-node"><span className="landing-router-orbit" aria-hidden="true" /><span className="landing-icon-wrap"><Workflow className="size-5" aria-hidden="true" /></span><div><p>TargetFlow</p><span>Rotation profile</span></div></div>
          <div className="landing-store-grid"><StoreNode name="Northline" progress="62" target="Step 1" state="Receiving" /><StoreNode name="Fieldwork" progress="91" target="Step 1" state="Next" muted /><StoreNode name="Archway" progress="34" target="Step 2" state="Queued" /></div>
        </div>
        <div className="landing-console-footer"><span><LockKeyhole className="size-3.5" aria-hidden="true" /> Signed click ID</span><span><ShieldCheck className="size-3.5" aria-hidden="true" /> Webhook-ready stores only</span></div>
      </div>
    </section>

    <section className="relative z-10 border-y border-white/10 bg-black/15" aria-label="Operating principles"><div className="mx-auto grid max-w-7xl divide-y divide-white/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">{principles.map(([title, description], index) => <article key={title} className="py-7 md:px-8 md:first:pl-0 md:last:pr-0"><p className="text-xs font-medium tracking-[0.2em] text-amber-300">0{index + 1}</p><h2 className="mt-3 text-lg font-medium text-stone-100">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-stone-400">{description}</p></article>)}</div></section>

    <section id="how-it-works" className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20 lg:px-10 lg:py-28"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">The operating system</p><h2 className="landing-display mt-5 text-4xl leading-none tracking-[-0.04em] text-stone-100 sm:text-5xl">Built for an operation that needs to know <em>why.</em></h2></div><div className="grid gap-4 sm:grid-cols-3"><Step number="01" title="Create the group" body="Choose the stores and give the group its own campaign slug and dedicated link." /><Step number="02" title="Set the sales step" body="Keep a store active for one verified sale or choose a custom verified-sale count for each store." /><Step number="03" title="Read the result" body="Watch redirects, orders, revenue, conversion, and webhook readiness in the overview." /></div></section>

    <section className="relative z-10 mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:px-10"><div className="landing-final-cta"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Ready when your stores are</p><h2 className="landing-display mt-4 max-w-xl text-4xl leading-none tracking-[-0.04em] text-stone-50 sm:text-5xl">Make your campaign link work as hard as the operation behind it.</h2></div><Button asChild size="lg" className="landing-primary-cta shrink-0"><Link href="/admin">Open TargetFlow <ArrowRight aria-hidden="true" /></Link></Button></div></section>
    <footer className="relative z-10 mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><span>TargetFlow · Store routing with transparent controls.</span><Link className="transition-colors hover:text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" href="/api/health">System health</Link></footer>
  </main>;
}

function StoreNode({ name, progress, target, state, muted = false }: { name: string; progress: string; target: string; state: string; muted?: boolean }) {
  return <div className={`landing-store-node ${muted ? "landing-store-muted" : ""}`}><div className="flex items-start justify-between gap-3"><span className="landing-store-name">{name}</span><span className="text-[10px] uppercase tracking-[0.14em] text-stone-500">{state}</span></div><div className="mt-4 flex items-end justify-between gap-3"><span className="text-sm text-stone-300">{target.includes("$") ? `${target} goal` : target}</span><strong className="text-lg font-medium text-stone-100">{progress}%</strong></div><progress className="landing-progress mt-2" value={progress} max="100" aria-label={`${name} progress`} /></div>;
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return <article className="border-l border-amber-300/60 pl-5"><p className="text-xs font-medium tracking-[0.18em] text-amber-300">{number}</p><h3 className="mt-3 text-base font-medium text-stone-100">{title}</h3><p className="mt-2 text-sm leading-6 text-stone-400">{body}</p></article>;
}
