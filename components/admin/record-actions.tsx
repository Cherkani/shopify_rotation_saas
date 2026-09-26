import { Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function RecordActions({ edit, remove, children }: { edit?: () => void; remove?: () => void; children?: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1">
    {edit ? <Button type="button" variant="outline" size="sm" onClick={edit}><Pencil /> Edit</Button> : null}
    {remove ? <Button type="button" variant="ghost" size="icon" aria-label="Delete record" onClick={remove}><Trash2 className="size-4 text-red-300" /></Button> : null}
    {children}
  </div>;
}
