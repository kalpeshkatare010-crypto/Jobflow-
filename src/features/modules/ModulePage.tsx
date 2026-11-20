import { Link, useLocation } from 'react-router';
import { Card, EmptyState } from '../../components/ui';
import { findNavItem } from '../../app/layout/nav';

/**
 * Holding page for a module whose screens arrive in a later milestone.
 * It says plainly what will live here and when, instead of showing fake data.
 */
export function ModulePage() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  if (!item) return <NotFoundPage />;
  const Icon = item.icon;
  return (
    <Card>
      <EmptyState
        icon={<Icon aria-hidden className="size-5" />}
        title={`${item.label} is being built`}
        description={`${item.summary} This screen arrives in milestone ${item.milestone}.`}
        action={
          <Link to="/" className="text-sm font-medium text-info hover:underline">
            Back to dashboard
          </Link>
        }
      />
    </Card>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        title="This page does not exist"
        description="The link may be mistyped or out of date. Use the menu to find what you need."
        action={
          <Link to="/" className="text-sm font-medium text-info hover:underline">
            Go to dashboard
          </Link>
        }
      />
    </Card>
  );
}
