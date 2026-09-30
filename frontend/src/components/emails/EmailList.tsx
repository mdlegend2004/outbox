import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import type { EmailItem } from "../../api/types";
import { nameFromEmail } from "../../lib/format";
import { StatusBadge } from "../ui/StatusBadge";

function EmailRow({ email }: { email: EmailItem }) {
  const navigate = useNavigate();
  const open = () => navigate(`/emails/${email.id}`);
  return (
    <li
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="group flex h-14 cursor-pointer items-center gap-4 border-b border-line px-6 text-sm transition-colors hover:bg-surface focus:bg-surface focus:outline-none"
    >
      <div className="w-48 shrink-0 truncate" title={email.toEmail}>
        <span className="text-ink-muted">To: </span>
        <span className="text-ink">{nameFromEmail(email.toEmail)}</span>
      </div>
      <StatusBadge email={email} />
      <div className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-ink">{email.subject}</span>
        {email.snippet && <span className="text-ink-faint"> - {email.snippet}</span>}
      </div>
      {email.rescheduleCount > 0 && email.status === "scheduled" && (
        <span
          className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-muted"
          title="Moved to a later hour window because an hourly limit was reached"
        >
          rate-limited
        </span>
      )}
      <Star className="h-4 w-4 shrink-0 text-ink-faint/60 group-hover:text-ink-faint" />
    </li>
  );
}

export function EmailList({ items }: { items: EmailItem[] }) {
  return (
    <ul>
      {items.map((e) => (
        <EmailRow key={e.id} email={e} />
      ))}
    </ul>
  );
}

export function EmailListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading emails">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex h-14 items-center gap-4 border-b border-line px-6">
          <div className="h-3 w-40 animate-pulse rounded bg-surface" />
          <div className="h-5 w-28 animate-pulse rounded-full bg-surface" />
          <div className="h-3 flex-1 animate-pulse rounded bg-surface" />
        </li>
      ))}
    </ul>
  );
}
