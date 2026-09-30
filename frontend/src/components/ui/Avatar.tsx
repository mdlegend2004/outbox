import { useState } from "react";
import clsx from "clsx";
import { initials } from "../../lib/format";

const COLORS = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const color = COLORS[(name.charCodeAt(0) || 0) % COLORS.length];
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", color)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={name}
    >
      {initials(name) || "?"}
    </span>
  );
}
