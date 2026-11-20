/**
 * DEMONSTRATION DATA ONLY.
 *
 * Fictional sample records used by the dashboard until it reads the
 * business's own data (Milestone 9). Every screen that shows these values
 * carries a "Demo data" tag. Names are invented and do not refer to real firms.
 *
 * The three workflows deliberately come from different trades to show that
 * stages are defined per business, not built into the product.
 */
import type { JobStatus } from '../../components/ui/Badge';
import type { StageSegment, StageState } from '../../components/ui/StageTrack';
import type { JobSummary } from '../../domain/jobs';

export const DEMO_SESSION = {
  userName: 'Asha Kulkarni',
  businessName: 'Demo workspace',
} as const;

const WORKFLOWS = {
  sheetMetal: ['Cutting', 'Bending', 'Welding', 'Powder coating', 'Packing'],
  moulding: ['Moulding', 'Trimming', 'Quality check', 'Packing'],
  cartons: ['Printing', 'Die cutting', 'Pasting', 'Packing'],
} as const;

type WorkflowKey = keyof typeof WORKFLOWS;

/** Builds stage segments: stages before `currentIndex` done, that one current. */
function stagesFor(workflow: WorkflowKey, currentIndex: number, status: JobStatus): StageSegment[] {
  const names = WORKFLOWS[workflow];
  return names.map((name, index) => {
    let state: StageState = 'waiting';
    if (status === 'completed' || status === 'delivered') state = 'done';
    else if (index < currentIndex) state = 'done';
    else if (index === currentIndex && (status === 'in_production' || status === 'on_hold')) state = 'current';
    return { name, state };
  });
}

function addDays(today: Date, days: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
}

interface Seed {
  n: number;
  title: string;
  customer: string;
  workflow: WorkflowKey;
  stage: number;
  status: JobStatus;
  qty: number;
  unit: string;
  produced: number;
  rejected: number;
  due: number;
  priority: JobSummary['priority'];
}

const SEEDS: Seed[] = [
  { n: 152, title: 'Mounting brackets, 3 mm MS', customer: 'Kaveri Agro Tools', workflow: 'sheetMetal', stage: 2, status: 'in_production', qty: 1200, unit: 'pcs', produced: 0, rejected: 14, due: 3, priority: 'high' },
  { n: 151, title: 'PP knob caps, black', customer: 'Northgate Appliances', workflow: 'moulding', stage: 1, status: 'in_production', qty: 20000, unit: 'pcs', produced: 0, rejected: 310, due: 6, priority: 'normal' },
  { n: 150, title: '5-ply cartons 300 x 200 x 150', customer: 'Sahyadri Foods', workflow: 'cartons', stage: 2, status: 'in_production', qty: 3500, unit: 'pcs', produced: 0, rejected: 42, due: -2, priority: 'urgent' },
  { n: 149, title: 'Battery tray covers', customer: 'Patil Auto Components', workflow: 'moulding', stage: 3, status: 'in_production', qty: 4000, unit: 'pcs', produced: 2650, rejected: 96, due: 1, priority: 'high' },
  { n: 148, title: 'Control panel enclosures', customer: 'Northgate Appliances', workflow: 'sheetMetal', stage: 1, status: 'on_hold', qty: 150, unit: 'pcs', produced: 0, rejected: 2, due: 9, priority: 'normal' },
  { n: 147, title: 'Printed sleeves, 250 g', customer: 'Sahyadri Foods', workflow: 'cartons', stage: 0, status: 'approved', qty: 8000, unit: 'pcs', produced: 0, rejected: 0, due: 12, priority: 'normal' },
  { n: 146, title: 'Pump base plates', customer: 'Deccan Pumps', workflow: 'sheetMetal', stage: 0, status: 'approved', qty: 400, unit: 'pcs', produced: 0, rejected: 0, due: 5, priority: 'normal' },
  { n: 145, title: 'Handle brackets', customer: 'Kaveri Agro Tools', workflow: 'sheetMetal', stage: 5, status: 'completed', qty: 600, unit: 'pcs', produced: 600, rejected: 9, due: -4, priority: 'normal' },
  { n: 144, title: 'Clip housings', customer: 'Patil Auto Components', workflow: 'moulding', stage: 4, status: 'delivered', qty: 10000, unit: 'pcs', produced: 10000, rejected: 188, due: -8, priority: 'normal' },
  { n: 143, title: 'Display cartons, 4-colour', customer: 'Riverbend Cosmetics', workflow: 'cartons', stage: 4, status: 'delivered', qty: 2500, unit: 'pcs', produced: 2500, rejected: 31, due: -11, priority: 'low' },
  { n: 142, title: 'Shelf brackets (quote)', customer: 'Deccan Pumps', workflow: 'sheetMetal', stage: 0, status: 'draft', qty: 300, unit: 'pcs', produced: 0, rejected: 0, due: 20, priority: 'low' },
];

export function buildDemoJobs(today: Date): JobSummary[] {
  return SEEDS.map((seed) => ({
    id: `demo-job-${seed.n}`,
    jobNumber: `JOB-${String(seed.n).padStart(4, '0')}`,
    title: seed.title,
    customerName: seed.customer,
    status: seed.status,
    quantity: seed.qty,
    unit: seed.unit,
    producedQty: seed.produced,
    rejectedQty: seed.rejected,
    dueDate: addDays(today, seed.due),
    priority: seed.priority,
    stages: stagesFor(seed.workflow, seed.stage, seed.status),
  }));
}

export const DEMO_CUSTOMER_COUNT = 6;

/** Good output and rejections per week across all stages, last 8 weeks. */
export function buildDemoWeeklyOutput(today: Date): { week: string; good: number; rejected: number }[] {
  const good = [18400, 21250, 19800, 23900, 22600, 25100, 24300, 26750];
  const rejected = [520, 610, 480, 700, 590, 560, 640, 505];
  return good.map((value, index) => {
    const weekStart = addDays(today, -7 * (good.length - 1 - index));
    const label = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(weekStart);
    return { week: label, good: value, rejected: rejected[index] ?? 0 };
  });
}

export interface DemoActivity {
  id: string;
  who: string;
  what: string;
  minutesAgo: number;
}

export const DEMO_ACTIVITY: DemoActivity[] = [
  { id: 'a1', who: 'Ravi S.', what: 'recorded 480 pcs on JOB-0149 Packing', minutesAgo: 14 },
  { id: 'a2', who: 'Meena P.', what: 'moved JOB-0152 to Welding', minutesAgo: 52 },
  { id: 'a3', who: 'Asha K.', what: 'put JOB-0148 on hold: waiting for customer drawing', minutesAgo: 140 },
  { id: 'a4', who: 'Imran T.', what: 'issued 220 kg PP granules to JOB-0151', minutesAgo: 210 },
  { id: 'a5', who: 'Asha K.', what: 'approved JOB-0147 for Sahyadri Foods', minutesAgo: 1460 },
];

export interface DemoLowStock {
  id: string;
  material: string;
  onHand: number;
  minimum: number;
  unit: string;
}

export const DEMO_LOW_STOCK: DemoLowStock[] = [
  { id: 'm1', material: 'MS sheet 3 mm', onHand: 120, minimum: 400, unit: 'kg' },
  { id: 'm2', material: 'PP granules, black', onHand: 75, minimum: 200, unit: 'kg' },
  { id: 'm3', material: 'Kraft paper 150 GSM', onHand: 2, minimum: 6, unit: 'rolls' },
];
