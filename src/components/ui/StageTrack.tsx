import { cn } from '../../lib/cn';

export type StageState = 'done' | 'current' | 'waiting' | 'skipped';

export interface StageSegment {
  name: string;
  state: StageState;
}

interface StageTrackProps {
  stages: StageSegment[];
  className?: string;
}

const segmentStyle: Record<StageState, string> = {
  done: 'bg-ink-900',
  current: 'bg-signal ring-1 ring-inset ring-signal-ink/25',
  waiting: 'bg-ink-900/[0.08]',
  skipped: 'bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(20_33_61/0.12)_3px_5px)]',
};

const stateWord: Record<StageState, string> = {
  done: 'done',
  current: 'in progress',
  waiting: 'not started',
  skipped: 'skipped',
};

/**
 * A job's own production stages as a segmented track, like a job traveller
 * card on the shop floor. Segments come from the business's workflow, so the
 * number and names of stages differ per job.
 */
export function StageTrack({ stages, className }: StageTrackProps) {
  const current = stages.find((stage) => stage.state === 'current');
  const doneCount = stages.filter((stage) => stage.state === 'done').length;
  const summary = stages.map((stage) => `${stage.name}: ${stateWord[stage.state]}`).join(', ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="img" aria-label={`Stages - ${summary}`} className="flex h-2.5 gap-[3px]">
        {stages.map((stage, index) => (
          <span
            key={`${stage.name}-${index}`}
            title={`${stage.name} - ${stateWord[stage.state]}`}
            className={cn('h-full flex-1 origin-left animate-grow-x rounded-[3px]', segmentStyle[stage.state])}
            style={{ animationDelay: `${120 + index * 70}ms` }}
          />
        ))}
      </div>
      <p className="text-[12px] text-ink-500">
        {current ? (
          <>
            <span className="font-medium text-ink-900">{current.name}</span>
            <span> - stage {doneCount + 1} of {stages.length}</span>
          </>
        ) : doneCount === stages.length ? (
          <span>All {stages.length} stages done</span>
        ) : (
          <span>
            {doneCount} of {stages.length} stages done
          </span>
        )}
      </p>
    </div>
  );
}
