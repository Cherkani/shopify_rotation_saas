"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowLeftRight, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? "Could not sign in");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next") ?? "/admin";
    router.push(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
    router.refresh();
  }

  return (
    <main className="landing-shell relative min-h-screen overflow-hidden px-4 py-5 text-[#f5f0e8] sm:p-8">
      <div className="landing-noise" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between"><Link href="/" className="group flex items-center gap-3"><span className="landing-mark"><ArrowLeftRight className="size-4" /></span><span className="font-serif text-xl font-semibold">Target<em className="not-italic text-[#f2c96d]">Flow</em></span></Link><Link href="/" className="flex items-center gap-2 text-sm text-[#aaa196] transition hover:text-[#f2c96d]"><ArrowLeft className="size-4" />Back to site</Link></header>
        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
          <section className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-[#f2c96d]">Operator access</p><h1 className="landing-display mt-5 text-4xl leading-[1.05] sm:text-6xl">A calm place to run <em>complex traffic.</em></h1><p className="mt-6 max-w-md text-base leading-7 text-[#aaa196]">Control destinations, targets, order signals, and the one campaign link your customers use.</p><div className="mt-10 grid max-w-md gap-3 sm:grid-cols-2"><div className="border border-white/10 bg-black/10 p-4"><ShieldCheck className="size-5 text-[#f2c96d]" /><p className="mt-5 text-sm font-medium">Protected workspace</p><p className="mt-1 text-xs leading-5 text-[#aaa196]">Credentialed, server-side administration.</p></div><div className="border border-white/10 bg-black/10 p-4"><Radio className="size-5 text-emerald-300" /><p className="mt-5 text-sm font-medium">Live operations</p><p className="mt-1 text-xs leading-5 text-[#aaa196]">Targets and routing update without redeploying.</p></div></div></section>
          <section className="landing-console w-full max-w-md justify-self-end"><div className="landing-console-top"><span className="text-xs font-semibold uppercase tracking-[.18em] text-[#aaa196]">Secure sign in</span><span className="flex items-center gap-2 text-xs text-emerald-300"><span className="size-2 rounded-full bg-emerald-300" />Operations</span></div><div className="p-6 sm:p-8"><h2 className="font-serif text-3xl">Welcome back.</h2><p className="mt-2 text-sm leading-6 text-[#aaa196]">Use the administrator credentials created for this workspace.</p><form onSubmit={submit} className="mt-7 space-y-5"><div className="space-y-2"><Label htmlFor="email" className="text-[#f5f0e8]">Email</Label><Input id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="border-white/15 bg-black/15 text-[#f5f0e8] placeholder:text-[#80786e]" /></div><div className="space-y-2"><Label htmlFor="password" className="text-[#f5f0e8]">Password</Label><Input id="password" required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="border-white/15 bg-black/15 text-[#f5f0e8]" /></div>{error && <p role="alert" className="border border-red-300/35 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>}<Button disabled={loading} className="landing-primary-cta w-full" type="submit"><LockKeyhole />{loading ? "Signing in…" : "Enter control room"}</Button></form></div><div className="landing-console-footer"><span>Encrypted session</span><span>TargetFlow OS</span></div></section>
        </div>
      </div>
    </main>
  );
}
