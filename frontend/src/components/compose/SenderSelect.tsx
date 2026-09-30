import { ChevronDown } from "lucide-react";
import type { Sender } from "../../api/types";

export function SenderSelect({
  senders,
  value,
  onChange,
  loading,
}: {
  senders: Sender[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="relative inline-flex">
      <select
        id="sender"
        value={value}
        disabled={loading || senders.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md bg-surface pl-3 pr-8 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30"
      >
        {loading && <option>Loading senders…</option>}
        {senders.map((s) => (
          <option key={s.id} value={s.id}>
            {s.email}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-ink-faint" />
    </div>
  );
}
