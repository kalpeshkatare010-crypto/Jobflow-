import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { NAV_ITEMS } from './nav';
import { Wordmark } from './Logo';
import { InstallAppButton } from '../pwa/PwaControls';

interface NavListProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function NavList({ collapsed, onNavigate }: NavListProps) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'press relative flex h-9 items-center gap-3 rounded-[var(--radius-control)] text-[14px] duration-200',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  // Where you are: a quiet raised row with a thin signal-yellow marker.
                  isActive
                    ? "bg-surface font-medium text-ink-900 ring-1 ring-line before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-signal before:content-['']"
                    : 'text-ink-500 hover:bg-ink-900/5 hover:text-ink-900',
                )
              }
            >
              <Icon aria-hidden className="size-[18px] shrink-0" />
              <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

function Credit({ collapsed }: { collapsed: boolean }) {
  if (collapsed) return null;
  return <p className="px-3 text-[12px] text-ink-500">Developed by RK Digitals</p>;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const DRAWER_EXIT_MS = 200;

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  // Keep the drawer on screen briefly after closing so it can slide out.
  const [drawerMounted, setDrawerMounted] = useState(mobileOpen);
  useEffect(() => {
    if (mobileOpen) {
      setDrawerMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setDrawerMounted(false), DRAWER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop: a column that collapses to icons */}
      <aside
        aria-label="Main"
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col py-5 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[76px] px-3' : 'w-[248px] px-4',
        )}
      >
        <div className={cn('mb-6 flex items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
          <Wordmark collapsed={collapsed} />
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
          <NavList collapsed={collapsed} />
        </nav>
        <div className="flex flex-col gap-3 pt-4">
          <InstallAppButton collapsed={collapsed} />
          <Credit collapsed={collapsed} />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-9 items-center gap-2 rounded-[var(--radius-control)] text-[13px] text-ink-500 hover:bg-ink-900/5 hover:text-ink-900',
              collapsed ? 'justify-center' : 'px-3',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden className="size-4" />
            )}
            <span className={collapsed ? 'sr-only' : undefined}>{collapsed ? 'Expand menu' : 'Collapse menu'}</span>
          </button>
        </div>
      </aside>

      {/* Phone and tablet: a drawer over the page */}
      {mobileOpen || drawerMounted ? (
        <div className="fixed inset-0 z-40 lg:hidden" inert={!mobileOpen || undefined}>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className={cn('absolute inset-0 bg-black/40', mobileOpen ? 'animate-fade-in' : 'animate-fade-out')}
            onClick={onCloseMobile}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            hidden={!mobileOpen && !drawerMounted}
            className={cn(
              'absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col bg-canvas px-4 py-5 shadow-[var(--shadow-pop)]',
              mobileOpen ? 'animate-drawer-in' : 'animate-drawer-out',
            )}
          >
            <div className="mb-6 flex items-center justify-between px-1">
              <Wordmark />
              <button
                ref={closeButton}
                type="button"
                onClick={onCloseMobile}
                className="grid size-9 place-items-center rounded-full text-ink-700 hover:bg-ink-900/5"
              >
                <X aria-hidden className="size-5" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
              <NavList collapsed={false} onNavigate={onCloseMobile} />
            </nav>
            <div className="flex flex-col gap-3 pt-4">
              <InstallAppButton />
              <Credit collapsed={false} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
