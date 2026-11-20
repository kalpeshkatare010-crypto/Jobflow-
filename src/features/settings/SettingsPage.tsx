import { Card, CardHeader, EmptyState } from '../../components/ui';
import { ThemePicker } from '../../app/ThemePicker';
import { TeamSection } from '../team/TeamSection';
import { useAuth } from '../../auth/AuthProvider';
import { Settings } from 'lucide-react';

/** Settings grows section by section; Team (users, roles, invitations) is first. */
export function SettingsPage() {
  const { status } = useAuth();
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Appearance" description="Auto follows your phone or computer's light or dark setting." />
        <ThemePicker className="max-w-sm" />
      </Card>
      {status === 'demo' ? (
        <Card>
          <EmptyState
            icon={<Settings aria-hidden className="size-5" />}
            title="Settings need a connected account"
            description="This copy of JobFlow is running in demo mode. Once it is connected to the cloud, owners manage their team, roles and business details here."
          />
        </Card>
      ) : (
        <TeamSection />
      )}
      <p className="text-[13px] text-ink-500">
        Business profile, job numbering, units and billing arrive in coming updates.
      </p>
    </div>
  );
}
