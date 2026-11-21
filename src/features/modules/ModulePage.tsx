import { Link } from 'react-router';
import { Card, EmptyState } from '../../components/ui';

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
