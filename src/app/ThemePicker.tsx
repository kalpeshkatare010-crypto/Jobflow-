import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { useTheme, type ThemeChoice } from './theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** Three-way switch: follow the phone's setting, always light, or always dark. */
export function ThemePicker({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn('flex rounded-[var(--radius-control)] bg-sunken p-1', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setChoice(value)}
            className={cn(
              'press flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium',
              selected ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
