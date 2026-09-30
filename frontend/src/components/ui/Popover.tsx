import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

/** Minimal anchored popover: closes on outside click and Escape. */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = "right",
  className,
}: {
  open: boolean;
  onClose: () => void;
  anchor: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {anchor}
      {open && (
        <div
          role="dialog"
          className={clsx(
            "absolute top-full z-30 mt-2 rounded-xl border border-line bg-white shadow-pop",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
