import { CloudOff, GitCompareArrows, TriangleAlert } from 'lucide-react';
import { Badge } from './ui';
import type { SyncMark } from '../offline/db';

/** Where a record's latest change stands. Shows nothing once it is safely synced. */
export function SyncBadge({ mark, localOnly }: { mark: SyncMark; localOnly: boolean }) {
  if (mark === 'conflict') {
    return (
      <Badge tone="critical" icon={<GitCompareArrows aria-hidden className="size-3" />}>
        Needs review
      </Badge>
    );
  }
  if (mark === 'rejected') {
    return (
      <Badge tone="critical" icon={<TriangleAlert aria-hidden className="size-3" />}>
        Not saved to cloud
      </Badge>
    );
  }
  if (mark === 'pending' && !localOnly) {
    return (
      <Badge tone="warning" icon={<CloudOff aria-hidden className="size-3" />}>
        On this device
      </Badge>
    );
  }
  return null;
}
