import type { JobStatusValue } from '../offline/db';

/**
 * Allowed job status moves. Mirrors private.job_move_allowed in
 * supabase/migrations/20261121000400_workflows_and_jobs.sql; a test keeps them equal.
 */
export const JOB_MOVES: Record<JobStatusValue, JobStatusValue[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['draft', 'in_production', 'on_hold', 'cancelled'],
  in_production: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['approved', 'in_production', 'cancelled'],
  completed: ['delivered', 'in_production'],
  delivered: [],
  cancelled: ['draft'],
};

export function canMove(from: JobStatusValue, to: JobStatusValue): boolean {
  return JOB_MOVES[from].includes(to);
}

/** Moves that only owners and admins may make (reopening). */
export function needsAdmin(from: JobStatusValue, to: JobStatusValue): boolean {
  return (from === 'cancelled' && to === 'draft') || (from === 'completed' && to === 'in_production');
}

export interface StatusAction {
  to: JobStatusValue;
  label: string;
  /** Asks for a reason before moving. */
  reason?: 'required' | 'optional';
  tone: 'primary' | 'secondary' | 'danger';
}

/** Buttons offered on a job, in the order a person would use them. */
export function statusActions(status: JobStatusValue, heldFrom: JobStatusValue | null, isAdmin: boolean): StatusAction[] {
  const actions: StatusAction[] = [];
  switch (status) {
    case 'draft':
      actions.push({ to: 'approved', label: 'Approve job', tone: 'primary' });
      break;
    case 'approved':
      actions.push({ to: 'in_production', label: 'Start production', tone: 'primary' });
      actions.push({ to: 'on_hold', label: 'Put on hold', reason: 'optional', tone: 'secondary' });
      actions.push({ to: 'draft', label: 'Back to draft', tone: 'secondary' });
      break;
    case 'in_production':
      actions.push({ to: 'completed', label: 'Mark completed', tone: 'primary' });
      actions.push({ to: 'on_hold', label: 'Put on hold', reason: 'optional', tone: 'secondary' });
      break;
    case 'on_hold':
      actions.push({ to: heldFrom === 'approved' ? 'approved' : 'in_production', label: 'Resume', tone: 'primary' });
      break;
    case 'completed':
      actions.push({ to: 'delivered', label: 'Mark delivered', tone: 'primary' });
      if (isAdmin) actions.push({ to: 'in_production', label: 'Reopen', tone: 'secondary' });
      break;
    case 'cancelled':
      if (isAdmin) actions.push({ to: 'draft', label: 'Reopen as draft', tone: 'secondary' });
      break;
    case 'delivered':
      break;
  }
  if (!['completed', 'delivered', 'cancelled'].includes(status)) {
    actions.push({ to: 'cancelled', label: 'Cancel job', reason: 'required', tone: 'danger' });
  }
  return actions;
}

export const STAGE_ACTIONS = {
  not_started: ['start', 'complete', 'skip'],
  in_progress: ['complete'],
  done: ['reopen'],
  skipped: ['reopen'],
} as const;

export const STAGE_ACTION_LABEL: Record<'start' | 'complete' | 'skip' | 'reopen', string> = {
  start: 'Start',
  complete: 'Done',
  skip: 'Skip',
  reopen: 'Reopen',
};
