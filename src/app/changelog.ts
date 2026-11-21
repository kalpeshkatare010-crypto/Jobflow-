/** "What's new", newest first. Plain words for the people using JobFlow. */
export interface ChangelogEntry {
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '21 Nov 2026',
    title: 'In-app updates fixed',
    items: ['Update now works: earlier versions could not save the download, so every update stopped with an error.'],
  },
  {
    date: '21 Nov 2026',
    title: 'One simple plan',
    items: [
      'One plan for the whole business, with no limits on people, workflows or jobs.',
      'Every new business still starts with a 14-day free trial.',
      'Your data is always kept safe, even after a trial ends.',
    ],
  },
  {
    date: '21 Nov 2026',
    title: 'Updates screen, reminders and facts',
    items: [
      'A new Updates screen: check for a new version and install it without leaving JobFlow.',
      'Reminders on your phone: morning summary, due tomorrow, record today’s output and low stock. Never at night.',
      'Shop-floor facts three times a week, from Kanban to the 80/20 of rejects.',
      'Android’s app info now shows the build number.',
    ],
  },
  {
    date: '21 Nov 2026',
    title: 'A quieter, cleaner look',
    items: [
      'Dark mode is now true black.',
      'Figures sit in one tidy panel; less colour, more clarity.',
      'A short launch animation with the JobFlow bars.',
    ],
  },
  {
    date: '21 Nov 2026',
    title: 'Connected and ready for teams',
    items: [
      'Sign in with a password or a one-time email code.',
      'Help & Support with email and WhatsApp contacts.',
      'Plan and billing in Settings, with trial reminders.',
      'A Get started list for new businesses.',
    ],
  },
  {
    date: '20 Nov 2026',
    title: 'The core of JobFlow',
    items: [
      'Job orders with your own workflow stages.',
      'Production entries with good and rejected quantities.',
      'Inventory with low-stock warnings, and reports you can download as CSV.',
      'Works offline and syncs when you are back online.',
    ],
  },
];
