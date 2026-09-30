import { useState } from "react";
import { Clock } from "lucide-react";
import clsx from "clsx";
import { Popover } from "../ui/Popover";
import { Button, IconButton } from "../ui/Button";
import { toLocalInputValue, tomorrowAt } from "../../lib/format";

const PRESETS: { label: string; at: () => Date }[] = [
  { label: "Tomorrow", at: () => tomorrowAt(9) },
  { label: "Tomorrow, 10:00 AM", at: () => tomorrowAt(10) },
  { label: "Tomorrow, 11:00 AM", at: () => tomorrowAt(11) },
  { label: "Tomorrow, 3:00 PM", at: () => tomorrowAt(15) },
];

/** Clock icon → "Send Later" popover from the Figma compose screen. */
export function SendLaterPopover({ value, onChange }: { value: Date | null; onChange: (d: Date | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ? toLocalInputValue(value) : "");

  const openPopover = () => {
    setDraft(value ? toLocalInputValue(value) : "");
    setOpen(true);
  };

  const commit = () => {
    onChange(draft ? new Date(draft) : null);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="w-72 p-3"
      anchor={
        <IconButton
          label="Send later"
          onClick={() => (open ? setOpen(false) : openPopover())}
          className={clsx(value && "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand")}
        >
          <Clock className="h-4 w-4" />
        </IconButton>
      }
    >
      <h3 className="mb-2 text-sm font-semibold text-ink">Send Later</h3>
      <input
        type="datetime-local"
        aria-label="Pick date & time"
        value={draft}
        min={toLocalInputValue(new Date())}
        onChange={(e) => setDraft(e.target.value)}
        className="mb-2 h-9 w-full border-b border-line bg-transparent text-sm text-ink outline-none focus:border-brand"
      />
      <ul className="mb-3">
        {PRESETS.map((p) => {
          const v = toLocalInputValue(p.at());
          return (
            <li key={p.label}>
              <button
                type="button"
                onClick={() => setDraft(v)}
                className={clsx(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface",
                  draft === v && "bg-brand-soft",
                )}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2">
        {value && (
          <button
            type="button"
            className="mr-auto text-xs text-ink-muted hover:underline"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Send now instead
          </button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="outline" onClick={commit} disabled={!draft}>
          Done
        </Button>
      </div>
    </Popover>
  );
}
