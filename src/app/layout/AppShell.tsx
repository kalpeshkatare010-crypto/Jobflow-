import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { readPreference, writePreference } from '../../lib/storage';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { findNavItem } from './nav';
import type { SyncState } from './SyncIndicator';
import { DEMO_SESSION } from '../../features/dashboard/demoData';

/**
 * Until sign-in exists (Milestone 2) the shell runs as a demo session and the
 * sync indicator says "Not connected". It never pretends data is in the cloud.
 */
const SYNC_STATE: SyncState = { kind: 'not_connected' };

export function AppShell() {
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
  const firstName = DEMO_SESSION.userName.split(' ')[0];

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
          sync={SYNC_STATE}
          userName={DEMO_SESSION.userName}
          businessName={DEMO_SESSION.businessName}
        />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <Outlet />
        </main>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-500">
          <span>© 2026 RK Digitals. All rights reserved.</span>
          <span>JobFlow v{__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}
