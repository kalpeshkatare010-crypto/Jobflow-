import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { AppShell } from './layout/AppShell';
import { NAV_ITEMS } from './layout/nav';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ModulePage, NotFoundPage } from '../features/modules/ModulePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { backendFromEnv } from '../auth/supabaseBackend';
import type { AuthBackend } from '../auth/types';
import {
  ChooseBusinessPage,
  ForgotPasswordPage,
  InvitePage,
  OnboardingPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
} from '../auth/pages';
import { ErrorState, Spinner } from '../components/ui';
import { UpdateNotice } from './pwa/PwaControls';

/**
 * The preview build (`npm run build:preview`) uses hash URLs (#/jobs) so it
 * works from any static host or folder. Production uses clean URLs; Cloudflare
 * Pages serves index.html for every path via public/_redirects.
 */
const useHashRouter = import.meta.env.MODE === 'preview';

function FullPage({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center px-4">{children}</div>;
}

/**
 * Lets people into the app only with a session and a chosen business.
 * Demo mode (no Supabase settings) skips sign-in and shows sample data.
 */
function RequireWorkspace() {
  const { status, workspaces, activeWorkspace, loadError, refreshWorkspaces } = useAuth();
  const location = useLocation();

  if (status === 'demo') return <AppShell />;
  if (status === 'loading') {
    return (
      <FullPage>
        <Spinner label="Opening JobFlow" />
      </FullPage>
    );
  }
  if (status === 'signed_out') {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }
  if (loadError) {
    return (
      <FullPage>
        <ErrorState
          title="Your businesses could not be loaded"
          description={loadError}
          onRetry={() => void refreshWorkspaces()}
        />
      </FullPage>
    );
  }
  if (workspaces.length === 0) return <Navigate to="/onboarding" replace />;
  if (!activeWorkspace) return <Navigate to="/choose-business" replace />;
  return <AppShell />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="sign-in" element={<SignInPage />} />
      <Route path="sign-up" element={<SignUpPage />} />
      <Route path="forgot-password" element={<ForgotPasswordPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="invite/:token" element={<InvitePage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route path="choose-business" element={<ChooseBusinessPage />} />
      <Route element={<RequireWorkspace />}>
        <Route index element={<DashboardPage />} />
        <Route path="settings/*" element={<SettingsPage />} />
        {NAV_ITEMS.filter((item) => item.path !== '/' && item.path !== '/settings').map((item) => (
          <Route key={item.path} path={`${item.path.slice(1)}/*`} element={<ModulePage />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

const defaultBackend = backendFromEnv();

export function App({ backend = defaultBackend }: { backend?: AuthBackend | null }): ReactNode {
  const Router = useHashRouter ? HashRouter : BrowserRouter;
  return (
    <AuthProvider backend={backend}>
      <Router>
        <AppRoutes />
      </Router>
      <UpdateNotice />
    </AuthProvider>
  );
}
