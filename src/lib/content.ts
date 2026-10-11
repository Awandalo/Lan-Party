// Frontend content boundary: replace these local values with validated public API data later.
export interface PublicEvent {
  id: string;
  title: string;
  summary: string;
  period: 'upcoming' | 'past';
}

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  preview?: boolean;
}

export const publishedEvents: PublicEvent[] = [];

export const newsPosts: NewsPost[] = [
  {
    id: 'preview-countdown',
    title: 'One month to go. Time to gather the crew.',
    body: 'A spot for countdowns, practical updates, and news from your organizers. This is example copy, not an announcement for a scheduled event.',
    preview: true,
  },
];

