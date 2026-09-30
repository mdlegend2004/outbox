import { NavLink, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Clock, Send, type LucideIcon } from "lucide-react";
import { useEmailStats } from "../../api/hooks";
import { Button } from "../ui/Button";
import { UserMenu } from "./UserMenu";
import { SlackCard } from "../integrations/SlackCard";

function NavItem({ to, icon: Icon, label, count }: { to: string; icon: LucideIcon; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
          isActive ? "bg-brand-soft font-semibold text-ink" : "text-ink hover:bg-surface",
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs font-normal text-ink-muted">{count}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { data: stats } = useEmailStats();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-4 border-r border-line px-3 py-4">
      <div className="px-2 font-logo text-2xl font-bold tracking-tight text-ink">ONB</div>
      <UserMenu />
      <Button variant="outline" fullWidth onClick={() => navigate("/compose")}>
        Compose
      </Button>

      <nav className="flex flex-col gap-1">
        <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Core</div>
        <NavItem to="/scheduled" icon={Clock} label="Scheduled" count={stats?.scheduled} />
        <NavItem to="/sent" icon={Send} label="Sent" count={stats?.sent} />
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <SlackCard />
        <a
          href="/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="px-3 text-xs text-ink-muted underline-offset-2 hover:text-brand hover:underline"
        >
          Open live queue dashboard ↗
        </a>
      </div>
    </aside>
  );
}
