import { BrowserRouter, HashRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { AppShell } from './layout/AppShell';
import { NAV_ITEMS } from './layout/nav';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ModulePage, NotFoundPage } from '../features/modules/ModulePage';

/**
 * The preview build (`npm run build:preview`) uses hash URLs (#/jobs) so it
 * works from any static host or folder. Production uses clean URLs; Cloudflare
 * Pages serves index.html for every path via public/_redirects.
 */
const useHashRouter = import.meta.env.MODE === 'preview';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        {NAV_ITEMS.filter((item) => item.path !== '/').map((item) => (
          <Route key={item.path} path={`${item.path.slice(1)}/*`} element={<ModulePage />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App(): ReactNode {
  const Router = useHashRouter ? HashRouter : BrowserRouter;
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
