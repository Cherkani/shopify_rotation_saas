import { FileChartColumnIncreasing, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon = FileChartColumnIncreasing, action, className }: EmptyStateProps) {
  return <div className={`ops-empty-state ${className ?? ""}`}><div className="ops-empty-state-icon"><Icon aria-hidden="true" /></div><h3 className="mt-5 text-balance font-serif text-xl font-semibold text-foreground">{title}</h3><p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div>;
}
