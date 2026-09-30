import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useScheduleCampaign, useSenders } from "../api/hooks";
import { formatFull } from "../lib/format";
import { Button, IconButton } from "../components/ui/Button";
import { FieldRow, NumberBox } from "../components/ui/Input";
import { RecipientInput } from "../components/compose/RecipientInput";
import { RichTextEditor } from "../components/compose/RichTextEditor";
import { SendLaterPopover } from "../components/compose/SendLaterPopover";
import { SenderSelect } from "../components/compose/SenderSelect";

export function ComposePage() {
  const navigate = useNavigate();
  const { data: senders = [], isLoading: sendersLoading } = useSenders();
  const schedule = useScheduleCampaign();

  const [senderId, setSenderId] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState({ html: "", empty: true });
  const [delaySeconds, setDelaySeconds] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [startAt, setStartAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!senderId && senders.length) setSenderId(senders[0].id);
  }, [senders, senderId]);

  const validationError = !senderId
    ? "Pick a sender"
    : recipients.length === 0
      ? "Add at least one recipient"
      : !subject.trim()
        ? "Subject is required"
        : body.empty
          ? "Email body is empty"
          : startAt && startAt.getTime() < Date.now() - 60_000
            ? "Start time is in the past"
            : null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validationError) return toast.error(validationError);
    schedule.mutate(
      {
        senderId,
        recipients,
        subject: subject.trim(),
        body: body.html,
        startAt: startAt?.toISOString(),
        delaySeconds: Number(delaySeconds) || 0,
        hourlyLimit: hourlyLimit ? Number(hourlyLimit) : undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(
            `${r.scheduled} email${r.scheduled === 1 ? "" : "s"} scheduled · first at ${formatFull(r.firstAt)}`,
          );
          navigate("/scheduled");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      // A stray Enter in a text field must never schedule a whole campaign.
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && e.preventDefault()}
      className="flex h-full flex-col overflow-y-auto"
    >
      <header className="flex items-center gap-3 px-6 py-4">
        <IconButton label="Back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5 text-ink" />
        </IconButton>
        <h1 className="flex-1 text-xl font-medium text-ink">Compose New Email</h1>
        {startAt && <span className="text-xs text-ink-muted">Starts {formatFull(startAt.toISOString())}</span>}
        <SendLaterPopover value={startAt} onChange={setStartAt} />
        <Button type="submit" variant="outline" size="sm" className="px-5" loading={schedule.isPending}>
          {startAt ? "Send Later" : "Send"}
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-6 pb-10">
        <FieldRow label="From" htmlFor="sender" underline={false}>
          <SenderSelect senders={senders} value={senderId} onChange={setSenderId} loading={sendersLoading} />
        </FieldRow>

        <FieldRow label="To" htmlFor="recipients">
          <RecipientInput value={recipients} onChange={setRecipients} />
        </FieldRow>

        <FieldRow label="Subject" htmlFor="subject">
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            maxLength={300}
            className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </FieldRow>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3 text-sm text-ink">
          <label className="flex items-center gap-3">
            Delay between 2 emails
            <NumberBox
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
              placeholder="00"
              max={86400}
              aria-describedby="delay-unit"
            />
            <span id="delay-unit" className="text-xs text-ink-muted">sec</span>
          </label>
          <label className="flex items-center gap-3">
            Hourly Limit
            <NumberBox
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              placeholder="00"
              min={1}
              title="Max emails from this campaign per hour (the sender's global cap still applies)"
            />
          </label>
        </div>

        <RichTextEditor onChange={(html, empty) => setBody({ html, empty })} />
      </div>
    </form>
  );
}
