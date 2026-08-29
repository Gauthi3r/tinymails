import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "md" | "sm" | "xs";

const base =
  "inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap font-medium outline-none transition-all " +
  "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 " +
  "active:translate-y-px active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "border border-[color-mix(in_srgb,var(--primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--primary)_90%,#3a3480)] " +
    "text-primary-foreground shadow-[inset_0_1px_0_rgb(254_254_254_/_22%),inset_0_-1px_0_rgb(58_52_128_/_30%)] " +
    "hover:border-[color-mix(in_srgb,var(--primary)_70%,#3a3480)] hover:bg-primary",
  secondary:
    "border border-transparent bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary)_95%,var(--ink))]",
  ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-primary-foreground hover:opacity-90",
};

const sizes: Record<Size, string> = {
  md: "h-9 rounded-lg px-3 py-1.5 text-sm",
  sm: "h-8 rounded-lg px-3 text-sm",
  xs: "h-7 rounded-lg px-2 text-xs",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={loading || disabled}
      aria-disabled={loading || undefined}
      type={type}
      {...props}
    >
      {loading ? (
        <span
          aria-label="Loading"
          role="status"
          className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
