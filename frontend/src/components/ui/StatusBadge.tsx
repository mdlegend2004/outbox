import clsx from "clsx";
import { AlertCircle, Clock } from "lucide-react";
import type { EmailItem } from "../../api/types";
import { formatPillTime } from "../../lib/format";

/** Status pill from the Figma list rows: orange clock+time for scheduled, grey "Sent", red "Failed". */
export function StatusBadge({ email }: { email: Pick<EmailItem, "status" | "scheduledAt" | "sentAt"> }) {
  const base = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";
  switch (email.status) {
    case "scheduled":
    case "sending":
      return (
        <span className={clsx(base, "border border-warn-line bg-warn-soft text-warn")}>
          <Clock className="h-3 w-3" />
          {email.status === "sending" ? "Sending…" : formatPillTime(email.scheduledAt)}
        </span>
      );
    case "sent":
      return <span className={clsx(base, "bg-surface text-ink-muted")}>Sent</span>;
    case "failed":
      return (
        <span className={clsx(base, "bg-danger-soft text-danger")}>
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      );
  }
}
