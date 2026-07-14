import type { Tier } from './generatePuzzle';

export interface TierInput {
    status: 'passed' | 'failed' | 'not-started' | 'in-progress';
    movesTaken: number;
    optimal: number;
}

export interface ScoreBreakdown {
    byTier: Record<Tier, number>;
    total: number;
}

const POINTS_BASE = 100;
const POINTS_PER_OVER = 15;
const POINTS_FLOOR = 10;

// Points earned for one tier. Failed/incomplete tiers score 0.
// At par: 100. Each move over par: -15. Floor: 10.
export function tierScore(status: string, movesTaken: number, optimal: number): number {
    if (status !== 'passed') return 0;
    const over = Math.max(0, movesTaken - optimal);
    return Math.max(POINTS_FLOOR, POINTS_BASE - over * POINTS_PER_OVER);
}

// Total score across all three tiers. Maximum is 300 (all three solved at par).
export function calculateCumulativeScore(tiers: Record<Tier, TierInput>): ScoreBreakdown {
    const byTier: Record<Tier, number> = {
        easy:   tierScore(tiers.easy.status,   tiers.easy.movesTaken,   tiers.easy.optimal),
        medium: tierScore(tiers.medium.status, tiers.medium.movesTaken, tiers.medium.optimal),
        hard:   tierScore(tiers.hard.status,   tiers.hard.movesTaken,   tiers.hard.optimal),
    };
    return { byTier, total: byTier.easy + byTier.medium + byTier.hard };
}
