import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { SyncIndicator, type SyncState } from './SyncIndicator';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onOpenMenu: () => void;
  sync: SyncState;
  onRetrySync?: () => void;
  userName: string;
  businessName: string;
  roleLabel?: string;
  onSignOut?: () => void;
  canSwitchBusiness: boolean;
}

export function Header({
  title,
  subtitle,
  onOpenMenu,
  sync,
  onRetrySync,
  userName,
  businessName,
  roleLabel,
  onSignOut,
  canSwitchBusiness,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-3 pb-5">
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid size-10 place-items-center rounded-[var(--radius-control)] border border-line bg-surface text-ink-900 lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-[19px] leading-tight font-semibold tracking-[-0.015em] text-ink-900 sm:text-[22px]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-1.5">
        <SyncIndicator state={sync} onRetry={onRetrySync} />
        <UserMenu
          userName={userName}
          businessName={businessName}
          roleLabel={roleLabel}
          onSignOut={onSignOut}
          canSwitch={canSwitchBusiness}
        />
      </div>
    </header>
  );
}
