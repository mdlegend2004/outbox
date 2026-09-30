export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
}

export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";
export type EmailTab = "scheduled" | "sent";

export interface EmailItem {
  id: string;
  campaignId: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  rescheduleCount: number;
  lastError: string | null;
  previewUrl: string | null;
  from: { name: string; email: string };
  snippet: string;
}

export interface EmailDetail extends EmailItem {
  body: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  source: "elasticsearch" | "database";
}

export interface EmailStats {
  scheduled: number;
  sent: number;
  failed: number;
}

export interface ScheduleRequest {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt?: string;
  delaySeconds: number;
  hourlyLimit?: number;
}

export interface ScheduleResponse {
  campaignId: string;
  scheduled: number;
  firstAt: string;
  lastAt: string;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
}
