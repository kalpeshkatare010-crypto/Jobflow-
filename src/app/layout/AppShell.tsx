import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { ErrorBoundary } from '../ErrorBoundary';
import { SubscriptionBanner } from '../../features/billing/PlanSection';
import { readPreference, writePreference } from '../../lib/storage';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { findNavItem } from './nav';
import { DEMO_SESSION } from '../../features/dashboard/demoData';
import { useAuth } from '../../auth/AuthProvider';
import { LocalDataProvider, useLocalData } from '../../offline/LocalDataProvider';
import { clearHomeScreenWidgets, useHomeScreenWidgets } from '../widgets';
import { ROLE_LABEL } from '../../auth/types';

/** The shell plus the business's local database and sync engine. */
export function AppShell() {
  return (
    <LocalDataProvider>
      <Shell />
    </LocalDataProvider>
  );
}

function Shell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => readPreference('sidebarCollapsed', false));
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      writePreference('sidebarCollapsed', !value);
      return !value;
    });
  }, []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const current = findNavItem(location.pathname);
  const isDashboard = location.pathname === '/';
  const auth = useAuth();
  const local = useLocalData();
  useHomeScreenWidgets();
  const isDemo = auth.status === 'demo';
  const userName = isDemo ? DEMO_SESSION.userName : auth.user?.fullName || auth.user?.email || 'Signed in';
  const businessName = isDemo ? DEMO_SESSION.businessName : (auth.activeWorkspace?.name ?? '');
  const firstName = userName.split(/[\s@]/)[0];

  useEffect(() => {
    document.title = current && !isDashboard ? `${current.label} - JobFlow` : 'JobFlow';
  }, [current, isDashboard]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div className="flex min-w-0 flex-1 flex-col px-4 pt-4 pb-6 sm:px-6 lg:pt-5 lg:pr-6 lg:pl-1">
        <Header
          title={isDashboard ? `Welcome back, ${firstName}` : (current?.label ?? 'Page not found')}
          subtitle={isDashboard ? "Here's what is happening on your shop floor." : current?.summary}
          onOpenMenu={() => setMobileOpen(true)}
          sync={local.syncState}
          onRetrySync={local.engine ? () => void local.engine?.syncNow() : undefined}
          userName={userName}
          businessName={businessName}
          roleLabel={auth.activeWorkspace ? ROLE_LABEL[auth.activeWorkspace.role] : undefined}
          onSignOut={
            isDemo
              ? undefined
              : () => {
                  clearHomeScreenWidgets();
                  void auth.signOut();
                }
          }
          canSwitchBusiness={auth.workspaces.length > 1}
        />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <div key={location.pathname} className="animate-page-in">
            <ErrorBoundary key={location.pathname}>
              <SubscriptionBanner />
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-500">
          <span>© 2026 RK Digitals. All rights reserved.</span>
          <span>JobFlow v{__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}
