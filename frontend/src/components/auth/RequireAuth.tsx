import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../../api/hooks";
import { FullPageSpinner } from "../ui/Spinner";

export function RequireAuth() {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
