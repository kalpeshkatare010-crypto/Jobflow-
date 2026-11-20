import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, LogOut, Plus } from 'lucide-react';
import { initials } from '../../lib/format';

interface UserMenuProps {
  userName: string;
  businessName: string;
  roleLabel?: string;
  /** Absent in demo mode, where there is no account. */
  onSignOut?: () => void;
  canSwitch: boolean;
}

export function UserMenu({ userName, businessName, roleLabel, onSignOut, canSwitch }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-sunken';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full pr-1 hover:bg-ink-900/5"
      >
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-ink-900 text-[13px] font-semibold text-white">
          {initials(userName) || '?'}
        </span>
        <span className="hidden flex-col text-left leading-tight md:flex">
          <span className="text-[13px] font-medium text-ink-900">{userName}</span>
          <span className="text-[12px] text-ink-500">{businessName}</span>
        </span>
        <span className="sr-only">Account menu for {userName}, {businessName}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 rounded-xl bg-surface p-1.5 shadow-[var(--shadow-pop)] ring-1 ring-line"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-ink-900">{businessName}</p>
            {roleLabel ? <p className="text-[12px] text-ink-500">{roleLabel}</p> : null}
          </div>
          {canSwitch ? (
            <Link role="menuitem" to="/choose-business" className={item} onClick={() => setOpen(false)}>
              <ArrowLeftRight aria-hidden className="size-4" />
              Switch business
            </Link>
          ) : null}
          {onSignOut ? (
            <>
              <Link role="menuitem" to="/onboarding" className={item} onClick={() => setOpen(false)}>
                <Plus aria-hidden className="size-4" />
                Create another business
              </Link>
              <button
                role="menuitem"
                type="button"
                className={item}
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                <LogOut aria-hidden className="size-4" />
                Sign out
              </button>
            </>
          ) : (
            <p className="px-3 py-2 text-[12px] text-ink-500">Demo mode has no account to sign out of.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
