import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { NAV_ITEMS } from './nav';
import { Wordmark } from './Logo';

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
                  'flex h-10 items-center gap-3 rounded-[var(--radius-control)] text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  isActive ? 'bg-signal text-ink-900' : 'text-ink-700 hover:bg-ink-900/5 hover:text-ink-900',
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

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

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
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 bg-ink-900/40"
            onClick={onCloseMobile}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col bg-canvas px-4 py-5 shadow-[var(--shadow-pop)]"
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
            <div className="pt-4">
              <Credit collapsed={false} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
