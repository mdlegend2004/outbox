import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import { useEmail } from "../api/hooks";
import { formatFull } from "../lib/format";
import { Avatar } from "../components/ui/Avatar";
import { Button, IconButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { FullPageSpinner } from "../components/ui/Spinner";
import { StatusBadge } from "../components/ui/StatusBadge";

export function EmailDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: email, isLoading, isError, error, refetch } = useEmail(id);
  const safeBody = useMemo(() => (email ? DOMPurify.sanitize(email.body) : ""), [email]);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !email) {
    return (
      <EmptyState
        icon={<RotateCw className="h-6 w-6" />}
        title="Couldn't load this email"
        description={error?.message}
        action={<Button variant="outline" onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  const when = email.sentAt ?? email.scheduledAt;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5 text-ink" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium text-ink">{email.subject}</h1>
        <StatusBadge email={email} />
      </header>

      <article className="mx-auto w-full max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-start gap-3">
          <Avatar name={email.from.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              <span className="font-semibold text-ink">{email.from.name}</span>{" "}
              <span className="text-ink-muted">&lt;{email.from.email}&gt;</span>
            </div>
            <div className="text-xs text-ink-muted">to {email.toEmail}</div>
          </div>
          <div className="shrink-0 text-right text-xs text-ink-muted">
            <div>{formatFull(when)}</div>
            <div>{email.sentAt ? "sent" : "scheduled"}</div>
          </div>
        </div>

        <div className="email-body text-sm leading-6 text-ink" dangerouslySetInnerHTML={{ __html: safeBody }} />

        <dl className="mt-8 grid grid-cols-[140px_1fr] gap-y-2 rounded-xl bg-surface p-4 text-xs">
          <dt className="text-ink-muted">Status</dt>
          <dd className="text-ink">{email.status}</dd>
          <dt className="text-ink-muted">Scheduled for</dt>
          <dd className="text-ink">{formatFull(email.scheduledAt)}</dd>
          {email.sentAt && (
            <>
              <dt className="text-ink-muted">Sent at</dt>
              <dd className="text-ink">{formatFull(email.sentAt)}</dd>
            </>
          )}
          <dt className="text-ink-muted">Attempts</dt>
          <dd className="text-ink">{email.attempts}</dd>
          {email.rescheduleCount > 0 && (
            <>
              <dt className="text-ink-muted">Rate-limit deferrals</dt>
              <dd className="text-ink">{email.rescheduleCount}</dd>
            </>
          )}
          {email.lastError && (
            <>
              <dt className="text-ink-muted">Last error</dt>
              <dd className="text-danger">{email.lastError}</dd>
            </>
          )}
          {email.previewUrl && (
            <>
              <dt className="text-ink-muted">Ethereal preview</dt>
              <dd>
                <a
                  href={email.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  Open delivered message <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </>
          )}
        </dl>
      </article>
    </div>
  );
}
