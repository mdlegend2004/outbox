import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLogout, useMe } from "../../api/hooks";
import { Avatar } from "../ui/Avatar";
import { Popover } from "../ui/Popover";

export function UserMenu() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const onLogout = async () => {
    try {
      await logout.mutateAsync();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      className="w-full"
      anchor={
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition-colors hover:bg-[#f0f0f0]"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Avatar name={user.name} src={user.avatarUrl} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-ink-muted">{user.email}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
        </button>
      }
    >
      <div className="p-1">
        <button
          onClick={onLogout}
          disabled={logout.isPending}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </Popover>
  );
}
