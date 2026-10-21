import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Compact status badge with immediate help outside scrolling tables. */
export function StatusBadge({
  label,
  description,
  tone = "secondary",
  className = "ms-1",
  testId,
  ariaLabel,
}: {
  label: string;
  description: string;
  tone?: "danger" | "warning" | "info" | "secondary";
  className?: string;
  testId?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <>
      <span
        ref={trigger}
        className={`badge text-bg-${tone} status-badge ${className}`}
        tabIndex={0}
        data-testid={testId}
        aria-label={ariaLabel ?? description}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {label}
      </span>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="injury-tooltip"
            ref={(el) => {
              if (!el || !trigger.current) return;
              const box = trigger.current.getBoundingClientRect();
              const width = el.offsetWidth;
              const height = el.offsetHeight;
              el.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
              const top =
                box.bottom + 6 + height <= window.innerHeight - 8
                  ? box.bottom + 6
                  : box.top - height - 6;
              el.style.top = `${Math.max(8, top)}px`;
            }}
          >
            {description}
          </div>,
          document.body,
        )}
    </>
  );
}
