import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

function FieldFrame({ id, label, hint, error, required, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-700">
        {label}
        {required ? <span className="text-critical"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-[13px] text-critical">
          <CircleAlert aria-hidden className="size-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const controlBase =
  'w-full rounded-[var(--radius-control)] border bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 ' +
  'transition-colors focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-info/30 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-400';

function controlState(error?: string) {
  return error ? 'border-critical focus:border-critical' : 'border-line-strong focus:border-info';
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface SharedProps {
  label: string;
  hint?: string;
  error?: string;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, SharedProps {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ label, hint, error, id, required, className, ref, ...rest }: InputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} required={required}>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(controlBase, 'h-10', controlState(error), className)}
        {...rest}
      />
    </FieldFrame>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, SharedProps {
  options: { value: string; label: string }[];
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ label, hint, error, id, required, options, placeholder, className, ref, ...rest }: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(controlBase, 'h-10 appearance-none pr-8', controlState(error), className)}
        {...rest}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, SharedProps {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, hint, error, id, required, className, rows = 3, ref, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(controlBase, 'py-2 leading-relaxed', controlState(error), className)}
        {...rest}
      />
    </FieldFrame>
  );
}
