import type { Tier } from '@/lib/generatePuzzle';

// Shared across all Stepladder components — import from here rather than redefining.
export const TIERS: Tier[] = ['easy', 'medium', 'hard'];
export const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const TIER_EMOJI: Record<Tier, string> = { easy: '🟢', medium: '🟡', hard: '🔴' };
export const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3 };
