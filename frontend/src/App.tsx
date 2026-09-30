import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { EmailsPage } from "./pages/EmailsPage";
import { EmailDetailPage } from "./pages/EmailDetailPage";
import { ComposePage } from "./pages/ComposePage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/scheduled" replace />} />
          <Route path="/scheduled" element={<EmailsPage tab="scheduled" />} />
          <Route path="/sent" element={<EmailsPage tab="sent" />} />
          <Route path="/emails/:id" element={<EmailDetailPage />} />
        </Route>
        <Route path="/compose" element={<ComposePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
