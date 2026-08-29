import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";
import { LAYOUT } from "./springs";

const labelExitPixels = 130;
const labelVariants = {
  enter: (direction: number) => ({ x: `${direction * 110}%` }),
  center: { x: "0%" },
  exit: (direction: number) => ({ x: direction * -labelExitPixels }),
};

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export function TabBar({
  tabs,
  activeId,
  onChange,
  className,
}: {
  tabs: readonly Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const previousIndex = useRef(activeIndex);
  const reducedMotion = useReducedMotion();
  const direction = activeIndex >= previousIndex.current ? 1 : -1;
  const active = tabs[activeIndex];

  useEffect(() => {
    previousIndex.current = activeIndex;
  }, [activeIndex]);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-[var(--shadow-floating)]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium outline-none transition-colors",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="oa-tab-pill"
                transition={reducedMotion ? { duration: 0 } : LAYOUT}
                className="absolute inset-0 rounded-full bg-secondary"
                aria-hidden="true"
              />
            ) : null}
            {tab.icon ? (
              <span className="relative z-10 [&_svg]:size-4" aria-hidden="true">
                {tab.icon}
              </span>
            ) : null}
            {selected && active ? (
              <span className="relative z-10 overflow-hidden">
                <AnimatePresence custom={direction} initial={false} mode="popLayout">
                  <motion.span
                    key={active.id}
                    custom={direction}
                    variants={labelVariants}
                    initial={reducedMotion ? "center" : "enter"}
                    animate="center"
                    exit={reducedMotion ? "center" : "exit"}
                    transition={reducedMotion ? { duration: 0 } : LAYOUT}
                    className="block whitespace-nowrap"
                  >
                    {active.label}
                  </motion.span>
                </AnimatePresence>
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
