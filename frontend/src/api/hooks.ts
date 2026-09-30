import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  EmailDetail,
  EmailItem,
  EmailStats,
  EmailTab,
  Paginated,
  ScheduleRequest,
  ScheduleResponse,
  Sender,
  SlackStatus,
  User,
} from "./types";

export const queryKeys = {
  me: ["me"] as const,
  senders: ["senders"] as const,
  stats: ["emails", "stats"] as const,
  emails: (tab: EmailTab, q: string, page: number) => ["emails", "list", tab, q, page] as const,
  email: (id: string) => ["emails", "detail", id] as const,
  slack: ["slack"] as const,
};

/** Lists auto-refresh so you can watch scheduled emails move to "Sent" live. */
const LIVE_REFRESH_MS = 5000;

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<{ user: User }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<{ user: User }>("/auth/login", body),
    onSuccess: (r) => qc.setQueryData(queryKeys.me, r.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(queryKeys.me, null);
    },
  });
}

export function useSenders() {
  return useQuery({
    queryKey: queryKeys.senders,
    queryFn: () => api.get<{ senders: Sender[] }>("/senders").then((r) => r.senders),
    staleTime: 60_000,
  });
}

export function useEmailStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api.get<EmailStats>("/emails/stats"),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmails(tab: EmailTab, q: string, page: number, pageSize = 25) {
  return useQuery({
    queryKey: queryKeys.emails(tab, q, page),
    queryFn: () => {
      const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      return api.get<Paginated<EmailItem>>(`/emails?${params}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useEmail(id: string) {
  return useQuery({
    queryKey: queryKeys.email(id),
    queryFn: () => api.get<{ email: EmailDetail }>(`/emails/${id}`).then((r) => r.email),
    refetchInterval: (q) => (q.state.data && ["scheduled", "sending"].includes(q.state.data.status) ? LIVE_REFRESH_MS : false),
  });
}

export function useScheduleCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleRequest) => api.post<ScheduleResponse>("/campaigns", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });
}

export function useSlackStatus() {
  return useQuery({
    queryKey: queryKeys.slack,
    queryFn: () => api.get<SlackStatus>("/integrations/slack"),
  });
}

export function useDisconnectSlack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del("/integrations/slack"),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.slack }),
  });
}

export function useTestSlack() {
  return useMutation({ mutationFn: () => api.post("/integrations/slack/test") });
}
