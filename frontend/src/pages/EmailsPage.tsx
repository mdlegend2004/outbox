import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, ListFilter, RotateCw, Search, Send } from "lucide-react";
import clsx from "clsx";
import { useEmails } from "../api/hooks";
import type { EmailTab } from "../api/types";
import { useDebounced } from "../hooks/useDebounced";
import { EmailList, EmailListSkeleton } from "../components/emails/EmailList";
import { EmptyState } from "../components/ui/EmptyState";
import { Button, IconButton } from "../components/ui/Button";

const PAGE_SIZE = 25;

const EMPTY: Record<EmailTab, { title: string; description: string; icon: JSX.Element }> = {
  scheduled: {
    title: "No scheduled emails",
    description: "Compose a new email and pick a start time — it will show up here until it's sent.",
    icon: <Clock className="h-6 w-6" />,
  },
  sent: {
    title: "No sent emails yet",
    description: "Emails appear here as soon as the scheduler delivers them (or gives up after retries).",
    icon: <Send className="h-6 w-6" />,
  },
};

export function EmailsPage({ tab }: { tab: EmailTab }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading, isError, error, refetch, isFetching } = useEmails(tab, q, page, PAGE_SIZE);

  // Reset paging when switching tab or search
  useEffect(() => setPage(1), [tab, q]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <header className="flex items-center gap-3 px-6 py-3">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-full bg-surface px-4 text-sm text-ink-muted focus-within:ring-2 focus-within:ring-brand/30">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab} emails`}
            className="w-full bg-transparent text-ink outline-none placeholder:text-ink-faint"
            aria-label="Search emails"
          />
        </label>
        <IconButton label="Filter" disabled>
          <ListFilter className="h-4 w-4" />
        </IconButton>
        <IconButton label="Refresh" onClick={() => refetch()}>
          <RotateCw className={clsx("h-4 w-4", isFetching && "animate-spin")} />
        </IconButton>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <EmailListSkeleton />
        ) : isError ? (
          <EmptyState
            icon={<RotateCw className="h-6 w-6" />}
            title="Couldn't load emails"
            description={error.message}
            action={<Button variant="outline" onClick={() => refetch()}>Try again</Button>}
          />
        ) : !data || data.items.length === 0 ? (
          q ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No matches"
              description={`Nothing in ${tab} matches “${q}”.`}
            />
          ) : (
            <EmptyState
              {...EMPTY[tab]}
              action={<Button onClick={() => navigate("/compose")}>Compose New Email</Button>}
            />
          )
        ) : (
          <EmailList items={data.items} />
        )}
      </section>

      {data && data.total > 0 && (
        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-2 text-xs text-ink-muted">
          {data.source === "elasticsearch" && <span className="mr-auto">Search powered by Elasticsearch</span>}
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <IconButton label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <IconButton label="Next page" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </footer>
      )}
    </>
  );
}
