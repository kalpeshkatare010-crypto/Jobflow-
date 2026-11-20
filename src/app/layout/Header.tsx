import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { initials } from '../../lib/format';
import { SyncIndicator, type SyncState } from './SyncIndicator';

interface HeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onOpenMenu: () => void;
  sync: SyncState;
  userName: string;
  businessName: string;
}

export function Header({ title, subtitle, onOpenMenu, sync, userName, businessName }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3 pb-5">
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid size-10 place-items-center rounded-full bg-surface text-ink-900 lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink-900 sm:text-[26px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2 rounded-full bg-surface p-1.5 pl-1.5">
        <SyncIndicator state={sync} />
        <div className="flex items-center gap-2 pr-1">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-ink-900 text-[13px] font-semibold text-white"
          >
            {initials(userName)}
          </span>
          <span className="hidden flex-col leading-tight md:flex">
            <span className="text-[13px] font-medium text-ink-900">{userName}</span>
            <span className="text-[12px] text-ink-500">{businessName}</span>
          </span>
          <span className="sr-only md:hidden">
            Signed in as {userName}, {businessName}
          </span>
        </div>
      </div>
    </header>
  );
}
