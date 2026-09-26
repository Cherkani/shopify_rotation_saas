"use client";

import type { ReactNode, RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminDialog({
  dialogRef,
  title,
  eyebrow,
  description,
  children,
  className = "w-[min(94vw,46rem)]",
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return <dialog ref={dialogRef} className={`ops-dialog ${className} border border-white/15 bg-[#201d18] p-0 text-[#f5f0e8] shadow-2xl backdrop:bg-black/70`}>
    <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">{eyebrow}</p> : null}
        <h2 className="mt-1 font-serif text-2xl">{title}</h2>
        {description ? <p className="mt-2 text-sm text-[#aaa196]">{description}</p> : null}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={`Close ${title}`} onClick={() => dialogRef.current?.close()}><X /></Button>
    </header>
    {children}
  </dialog>;
}

export function AdminModal({ dialogRef, children, className = "w-[min(94vw,46rem)]" }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return <dialog ref={dialogRef} className={`ops-dialog ${className} border border-white/15 bg-[#201d18] p-0 text-[#f5f0e8] shadow-2xl backdrop:bg-black/70`}>{children}</dialog>;
}

export function ActionError({ error }: { error?: string }) {
  return error ? <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p> : null;
}
