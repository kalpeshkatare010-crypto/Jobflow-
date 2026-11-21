import { useState } from 'react';
import { Button, Card, CardHeader } from '../components/ui';
import { isNativeApp } from '../app/native';
import { useNotificationPrefs } from './prefs';
import { requestNotificationPermission } from './useReminders';
import type { NotificationPrefs } from './planner';
import { cn } from '../lib/cn';

const TYPES: { key: keyof Omit<NotificationPrefs, 'enabled'>; label: string; detail: string }[] = [
  { key: 'summary', label: 'Morning summary', detail: '9:00. Jobs in production, due today and overdue.' },
  { key: 'dueDates', label: 'Due tomorrow', detail: '9:15 the day before a job is due.' },
  { key: 'production', label: 'Record today’s output', detail: '18:00, only if jobs are running and nothing was recorded.' },
  { key: 'lowStock', label: 'Low stock', detail: '10:00, once when a material drops below its minimum.' },
  { key: 'facts', label: 'Shop-floor facts', detail: 'Monday, Wednesday and Friday at 13:00. Short, true and useful.' },
];

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-ink-900' : 'bg-ink-200',
      )}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-surface transition-transform', checked && 'translate-x-4')} />
    </button>
  );
}

/** Per-phone reminder settings. Reminders are worked out on the phone; nothing is sent to a server. */
export function RemindersSection() {
  const native = isNativeApp();
  const [prefs, update] = useNotificationPrefs();
  const [message, setMessage] = useState<string | null>(null);

  async function toggleAll(on: boolean) {
    setMessage(null);
    if (on && !(await requestNotificationPermission())) {
      setMessage('Notifications are blocked for JobFlow. Allow them in your phone’s Settings → Apps → JobFlow → Notifications.');
      return;
    }
    update({ enabled: on });
  }

  async function test() {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999,
          title: 'JobFlow reminders are on',
          body: 'This is how reminders will look. Tap to open JobFlow.',
          schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
          extra: { path: '/settings' },
          smallIcon: 'ic_stat_jobflow',
          iconColor: '#F2D24B',
        },
      ],
    });
    setMessage('A test reminder arrives in a few seconds.');
  }

  return (
    <Card>
      <CardHeader
        title="Reminders"
        description={
          native
            ? 'Helpful nudges on this phone, never at night (9 pm to 8 am). Worked out on the phone from your data; nothing extra is sent anywhere.'
            : 'Reminders work in the JobFlow Android app. Open Settings there to switch them on.'
        }
      />
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <span className="text-[14px] font-medium">Reminders on this phone</span>
        <Switch checked={native && prefs.enabled} onChange={(v) => void toggleAll(v)} label="Reminders on this phone" disabled={!native} />
      </div>
      <ul className="divide-y divide-line">
        {TYPES.map((t) => (
          <li key={t.key} className="flex items-start justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-[14px]">{t.label}</span>
              <span className="block text-[12px] text-ink-500">{t.detail}</span>
            </span>
            <Switch checked={prefs[t.key]} onChange={(v) => update({ [t.key]: v })} label={t.label} disabled={!native || !prefs.enabled} />
          </li>
        ))}
      </ul>
      {message ? (
        <p role="status" className="mt-2 text-[13px] text-ink-700">
          {message}
        </p>
      ) : null}
      {native && prefs.enabled ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void test()}>
          Send a test reminder
        </Button>
      ) : null}
    </Card>
  );
}
