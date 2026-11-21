import type { LucideIcon } from 'lucide-react';
import {
  RefreshCw,
  ChartColumn,
  ClipboardList,
  Factory,
  LayoutDashboard,
  LifeBuoy,
  Boxes,
  Settings,
  UserCog,
  Users,
  Workflow,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Shown on the placeholder page until the module is built. */
  summary: string;
  /** Milestone that delivers the working module. */
  milestone: number;
}

/** MVP navigation. Order follows the daily flow: orders, then the floor, then supporting data. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, summary: 'Today across your jobs, stages and stock.', milestone: 9 },
  { path: '/jobs', label: 'Job orders', icon: ClipboardList, summary: 'Create, edit and track every job order and its history.', milestone: 5 },
  { path: '/production', label: 'Production', icon: Factory, summary: 'Record produced and rejected quantities stage by stage.', milestone: 7 },
  { path: '/customers', label: 'Customers', icon: Users, summary: 'Customer profiles, contacts and their job history.', milestone: 4 },
  { path: '/workflows', label: 'Workflows', icon: Workflow, summary: 'Name your own production stages for each kind of work.', milestone: 6 },
  { path: '/employees', label: 'Employees', icon: UserCog, summary: 'Your shop-floor roster for assignments and production entries.', milestone: 4 },
  { path: '/inventory', label: 'Inventory', icon: Boxes, summary: 'Materials, stock movements and low-stock alerts.', milestone: 8 },
  { path: '/reports', label: 'Reports', icon: ChartColumn, summary: 'Job, production, rejection and stock reports with CSV export.', milestone: 9 },
  { path: '/settings', label: 'Settings', icon: Settings, summary: 'Business profile, users and roles, numbering, units and billing.', milestone: 2 },
  { path: '/updates', label: 'Updates', icon: RefreshCw, summary: 'Your JobFlow version, new updates and what is new.', milestone: 12 },
  { path: '/help', label: 'Help & Support', icon: LifeBuoy, summary: 'Guides for setting up workflows, jobs and offline use.', milestone: 12 },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path));
}
