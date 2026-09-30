import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { navigateTo } from "../api/client";
import { useLogin, useMe } from "../api/hooks";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Input";
import { FullPageSpinner } from "../components/ui/Spinner";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  email_not_verified: "Your Google email isn't verified.",
  oauth_failed: "Google sign-in failed. Please try again.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPage() {
  const { data: user, isLoading } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const oauthError = params.get("error");

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true }),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-white px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-line px-10 py-10">
        <h1 className="mb-6 text-center text-3xl font-bold text-ink">Login</h1>

        {oauthError && (
          <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-center text-sm text-danger">
            {OAUTH_ERRORS[oauthError] ?? "Sign-in failed."}
          </p>
        )}

        <Button variant="soft" size="lg" fullWidth onClick={() => navigateTo("/auth/google")}>
          <GoogleIcon /> Login with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <TextInput
            type="email"
            placeholder="Email ID"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextInput
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" size="lg" fullWidth loading={login.isPending} className="mt-3">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
