import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const cardClipPath =
  "shape(from var(--card-clip-radius) 0px, line to calc(100% - var(--card-clip-radius)) 0px, curve to 100% var(--card-clip-radius) with calc(100% - var(--card-clip-handle)) 0px / 100% var(--card-clip-handle), line to 100% calc(100% - var(--card-clip-radius)), curve to calc(100% - var(--card-clip-radius)) 100% with 100% calc(100% - var(--card-clip-handle)) / calc(100% - var(--card-clip-handle)) 100%, line to var(--card-clip-radius) 100%, curve to 0px calc(100% - var(--card-clip-radius)) with var(--card-clip-handle) 100% / 0px calc(100% - var(--card-clip-handle)), line to 0px var(--card-clip-radius), curve to var(--card-clip-radius) 0px with 0px var(--card-clip-handle) / var(--card-clip-handle) 0px, close)";

type SquircleStyle = CSSProperties & {
  "--card-clip-handle"?: string;
  "--card-clip-path"?: string;
  "--card-clip-radius"?: string;
};

export function SquircleSurface({
  className,
  style,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="squircle-surface"
      className={cn(
        "relative flex min-w-0 flex-col rounded-[26px] bg-card text-card-foreground",
        "[--card-clip-handle:2.25px] [--card-clip-radius:14px] [clip-path:var(--card-clip-path)] [corner-shape:squircle]",
        "sm:rounded-[50px] sm:[--card-clip-handle:3px] sm:[--card-clip-radius:20px]",
        className,
      )}
      style={{ "--card-clip-path": cardClipPath, ...style } as SquircleStyle}
      {...props}
    >
      {children}
    </div>
  );
}

export function SquircleCard({
  title,
  icon,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <SquircleSurface className={cn("border border-border p-1 shadow-[var(--shadow-resting)]", className)}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-2.5">
        <span className="text-muted-foreground [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-sm font-medium text-foreground/80">{title}</h2>
      </div>
      <SquircleSurface
        className={cn(
          "overflow-hidden rounded-[22px] border border-border bg-background [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]",
          contentClassName,
        )}
      >
        {children}
      </SquircleSurface>
    </SquircleSurface>
  );
}

export function SquircleCardRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-10 items-center justify-between gap-3 px-4 text-sm transition-colors hover:bg-accent", className)}>
      <span className="min-w-0 truncate">{label}</span>
      {value !== undefined ? (
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      ) : null}
    </div>
  );
}
