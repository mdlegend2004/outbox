import { useEffect } from "react";
import { Outlet, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { queryKeys } from "../../api/hooks";

const SLACK_MESSAGES: Record<string, () => void> = {
  connected: () => toast.success("Slack connected — check your channel for a confirmation message."),
  cancelled: () => toast.info("Slack connection cancelled."),
  error: () => toast.error("Couldn't connect Slack. Please try again."),
};

export function AppLayout() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  // Result of the Slack OAuth round-trip (?slack=connected|cancelled|error)
  useEffect(() => {
    const slack = params.get("slack");
    if (!slack) return;
    SLACK_MESSAGES[slack]?.();
    qc.invalidateQueries({ queryKey: queryKeys.slack });
    params.delete("slack");
    setParams(params, { replace: true });
  }, [params, setParams, qc]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
