import { toast } from "sonner";
import { navigateTo } from "../../api/client";
import { useDisconnectSlack, useSlackStatus, useTestSlack } from "../../api/hooks";
import { Button } from "../ui/Button";

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#E01E5A" d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 1 1 5.04 0v6.32a2.52 2.52 0 1 1-5.04 0v-6.32Z" />
      <path fill="#36C5F0" d="M8.84 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.84Zm0 1.27a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.32Z" />
      <path fill="#2EB67D" d="M18.96 8.84a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.84Zm-1.27 0a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.32Z" />
      <path fill="#ECB22E" d="M15.16 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 1 1 0-5.04h6.32a2.52 2.52 0 1 1 0 5.04h-6.32Z" />
    </svg>
  );
}

/** "Connect Slack" → real OAuth; alerts fire when an hourly send limit is hit. */
export function SlackCard() {
  const { data, isLoading } = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const test = useTestSlack();

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <SlackLogo /> Slack alerts
      </div>
      {isLoading ? (
        <p className="text-xs text-ink-faint">Checking…</p>
      ) : data?.connected ? (
        <>
          <p className="mb-2 text-xs text-ink-muted">
            Connected to <b>{data.teamName}</b> · {data.channel}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="soft"
              loading={test.isPending}
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: () => toast.success("Test message sent to Slack"),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Test
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => toast.success("Slack disconnected"),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-muted">Get notified when a sender hits its hourly limit.</p>
          <Button
            size="sm"
            variant="outline"
            fullWidth
            disabled={!data?.configured}
            title={data?.configured ? undefined : "Set SLACK_CLIENT_ID / SLACK_CLIENT_SECRET on the backend"}
            onClick={() => navigateTo("/integrations/slack/connect")}
          >
            Connect Slack
          </Button>
        </>
      )}
    </div>
  );
}
