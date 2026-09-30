import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { isEmail, mergeRecipients, parseLeads } from "../../lib/leads";

const VISIBLE_CHIPS = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function Chip({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="group inline-flex h-6 items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-2 text-xs text-ink">
      {email}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${email}`}
        className="hidden text-ink-muted hover:text-ink group-hover:inline-flex"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function RecipientInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const commitDraft = () => {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return;
    const valid = parts.filter(isEmail);
    const invalid = parts.filter((p) => !isEmail(p));
    if (valid.length) onChange(mergeRecipients(value, valid));
    if (invalid.length) toast.error(`Not a valid email: ${invalid.join(", ")}`);
    setDraft(invalid.join(" "));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", "Tab", " "].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast.error("File is too large (max 5 MB)");
    const leads = parseLeads(await file.text());
    if (!leads.length) return toast.error(`No email addresses found in ${file.name}`);
    const merged = mergeRecipients(value, leads);
    onChange(merged);
    toast.success(`${leads.length} email address${leads.length === 1 ? "" : "es"} detected in ${file.name}`);
  };

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div className="flex w-full items-start gap-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {shown.map((email) => (
          <Chip key={email} email={email} onRemove={() => onChange(value.filter((v) => v !== email))} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-6 items-center rounded-full border border-brand/40 bg-brand-soft px-2 text-xs font-medium text-brand"
          >
            +{hidden}
          </button>
        )}
        {expanded && value.length > VISIBLE_CHIPS && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-ink-muted hover:underline">
            show less
          </button>
        )}
        <input
          id="recipients"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            const leads = parseLeads(text);
            if (leads.length > 1) {
              e.preventDefault();
              onChange(mergeRecipients(value, leads));
            }
          }}
          placeholder={value.length ? "" : "recipient@example.com"}
          className="h-6 min-w-[160px] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <Upload className="h-4 w-4" /> Upload List
        </button>
        {value.length > 0 && (
          <span className="text-xs text-ink-muted" aria-live="polite">
            {value.length} email{value.length === 1 ? "" : "s"} detected
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
    </div>
  );
}
