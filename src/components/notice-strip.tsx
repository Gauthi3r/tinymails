import type { ReactNode } from "react";
import { cn } from "./cn";

export function NoticeStrip({
  claim,
  children,
  action,
  className,
}: {
  claim: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm leading-6 text-muted-foreground">
        <span className="font-medium text-foreground">{claim}</span> {children}
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
