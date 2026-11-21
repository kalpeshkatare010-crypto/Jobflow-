/**
 * Shop-floor facts for the occasional "Did you know?" notification.
 * Only well-established facts from manufacturing history and lean practice;
 * each ends, where it fits, with how it shows up in JobFlow.
 */
export interface ShopFloorFact {
  id: string;
  title: string;
  body: string;
  /** Screen to open when tapped. */
  path: string;
}

export const FACTS: ShopFloorFact[] = [
  { id: 'kanban', title: 'Kanban means "signboard"', body: 'Toyota used simple cards to signal when to make more parts, so nothing was made before it was needed.', path: '/jobs' },
  { id: 'poka-yoke', title: 'Poka-yoke: mistake-proofing', body: 'Shigeo Shingo popularised designing jigs and steps so a mistake is impossible, not just unlikely.', path: '/workflows' },
  { id: '5s', title: 'The 5S of a tidy shop floor', body: 'Sort, Set in order, Shine, Standardise, Sustain. Five Japanese words, one habit: a place for everything.', path: '/' },
  { id: 'ford', title: 'From 12 hours to 93 minutes', body: "Ford's moving assembly line (1913) cut the time to build a Model T chassis from over 12 hours to about 1.5.", path: '/production' },
  { id: 'six-sigma', title: 'What "Six Sigma" means', body: 'About 3.4 defects per million opportunities. Every improvement starts with counting rejects, as JobFlow does.', path: '/reports' },
  { id: 'gemba', title: 'Gemba: the real place', body: 'Lean managers "go to gemba", the shop floor, to see a problem with their own eyes before deciding.', path: '/production' },
  { id: 'andon', title: 'The andon cord', body: 'At Toyota any worker can stop the line when they spot a problem. Fixing it early is cheaper than fixing it later.', path: '/jobs' },
  { id: 'smed', title: 'SMED: changeovers in minutes', body: '"Single-minute exchange of die" aims to change a machine over to the next job in under 10 minutes.', path: '/workflows' },
  { id: 'oee', title: 'OEE: one number for a machine', body: 'Availability × Performance × Quality. Around 85% is often called world-class; many plants run far lower.', path: '/reports' },
  { id: 'pareto', title: 'The 80/20 of rejects', body: 'Most rejects usually come from a few causes. The Rejections report ranks reasons so you fix the biggest first.', path: '/reports' },
  { id: 'kaizen', title: 'Kaizen: change for the better', body: 'Small improvements every day add up. Try one tiny change on the stage that waits longest this week.', path: '/' },
  { id: 'jit', title: 'Just-in-time', body: 'Make only what is needed, when it is needed, in the amount needed. Less stock tied up, less waste.', path: '/inventory' },
  { id: 'takt', title: 'Takt time: the beat of the line', body: 'Available time ÷ customer demand. "Takt" is German for beat: it tells you how often one piece must be finished.', path: '/production' },
  { id: 'muda', title: 'The seven wastes', body: 'Transport, inventory, motion, waiting, over-production, over-processing and defects. Which one costs you most?', path: '/' },
  { id: 'reject-cost', title: 'A 1% reject rate adds up', body: 'On 10,000 pieces, 1% is 100 pieces whose material, machine time and labour were spent for nothing.', path: '/reports' },
  { id: 'bottleneck', title: 'The slowest stage sets the pace', body: 'A line can only run as fast as its bottleneck (Goldratt, "The Goal", 1984). Find the stage where jobs wait.', path: '/' },
  { id: 'jidoka', title: 'Jidoka: machines that stop themselves', body: "Sakichi Toyoda's automatic loom stopped when a thread broke, so one worker could watch many looms.", path: '/jobs' },
  { id: 'shewhart', title: 'The first control chart', body: 'Walter Shewhart drew it at Bell Labs in 1924 to tell normal variation from a real problem.', path: '/reports' },
  { id: 'pdca', title: 'Plan, Do, Check, Act', body: "The improvement cycle W. Edwards Deming made famous. JobFlow's reports are the Check step.", path: '/reports' },
  { id: 'gantt', title: 'Henry Gantt and his chart', body: 'Around 1910 Henry Gantt drew work as bars across time; project plans still use his chart today.', path: '/jobs' },
  { id: 'iso9001', title: 'ISO 9001 since 1987', body: 'The best-known quality standard was first published in 1987. At its heart: record what you do and check it.', path: '/' },
  { id: 'littles-law', title: "Little's Law", body: 'Work in progress = throughput × lead time. More jobs started at once means each job takes longer to finish.', path: '/jobs' },
  { id: 'fifo', title: 'First in, first out', body: 'Use the oldest stock first so material does not age, dry out or get damaged on the shelf.', path: '/inventory' },
  { id: 'spaghetti', title: 'The spaghetti diagram', body: "Draw a worker's walking path on a floor plan for one hour. The tangle shows where steps are wasted.", path: '/' },
  { id: 'visual', title: 'If you can see it, you can manage it', body: 'Visual boards let anyone know the status in seconds. JobFlow\'s stage bars do the same on your phone.', path: '/' },
];

/** The next fact not yet shown, cycling through the list. */
export function nextFacts(shown: string[], count: number): ShopFloorFact[] {
  const unseen = FACTS.filter((f) => !shown.includes(f.id));
  const pool = unseen.length >= count ? unseen : [...unseen, ...FACTS.filter((f) => shown.includes(f.id))];
  return pool.slice(0, count);
}
