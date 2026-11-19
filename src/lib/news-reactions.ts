export const reactionChoices = [
  { id: 'thumbs-up', emoji: '👍', en: 'Thumbs up', nl: 'Duim omhoog' },
  { id: 'heart', emoji: '❤️', en: 'Heart', nl: 'Hart' },
  { id: 'smile', emoji: '🙂', en: 'Smile', nl: 'Glimlach' },
  { id: 'laugh', emoji: '😂', en: 'Laugh', nl: 'Lachen' },
  { id: 'cry', emoji: '😢', en: 'Cry', nl: 'Huilen' },
  { id: 'angry', emoji: '😠', en: 'Angry', nl: 'Boos' },
] as const;

export type NewsReaction = typeof reactionChoices[number]['id'];

export interface NewsReactionState {
  counts: Record<NewsReaction, number>;
  reaction: NewsReaction | null;
}

export function isNewsReaction(value: unknown): value is NewsReaction {
  return reactionChoices.some(({ id }) => id === value);
}
