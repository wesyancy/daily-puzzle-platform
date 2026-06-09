/**
 * Difficulty scoring for Stepladder puzzle pairs.
 *
 * Computes a DifficultyProfile from an optimal path through the word graph,
 * including per-position branch analysis and a composite 1–10 difficulty score.
 *
 * Used by:
 *   - scorePairs.ts     (calibrate / score existing pairs)
 *   - generatePuzzle.ts (display difficulty of found pairs)
 *   - buildPairPool.ts  (score and tier the full pair pool)
 */

import { getNeighbors } from '@repo/dictionary';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WordPositionDetail {
    word: string;
    totalNeighbors: number;
    /** Positions where 0 letter substitutions yield a valid word. */
    lockedPositions: number;
    /**
     * Fraction of totalNeighbors from the single busiest position (0–1).
     * Higher = valid moves are concentrated at one position = harder to discover.
     * 1.0 when totalNeighbors is 0 (maximally locked).
     */
    positionConcentration: number;
}

export interface DifficultyProfile {
    pathDetails: WordPositionDetail[];
    lockedPositionTotal: number;
    avgPositionConcentration: number;
    avgBranchingFactor: number;
    minBranchingFactor: number;
    /** Composite score 1–10. Higher = harder. */
    difficultyScore: number;
    difficultyTier: 'easy' | 'medium' | 'hard';
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeWordDetail(word: string, wordSet: Set<string>): WordPositionDetail {
    const perPosition: number[] = [];

    for (let i = 0; i < word.length; i++) {
        let count = 0;
        for (const letter of ALPHABET) {
            if (letter === word[i]) continue;
            const candidate = word.slice(0, i) + letter + word.slice(i + 1);
            if (wordSet.has(candidate)) count++;
        }
        perPosition.push(count);
    }

    const totalNeighbors = perPosition.reduce((s, n) => s + n, 0);
    const lockedPositions = perPosition.filter((n) => n === 0).length;
    const maxPosition = Math.max(...perPosition, 0);
    const positionConcentration = totalNeighbors === 0 ? 1.0 : maxPosition / totalNeighbors;

    return { word, totalNeighbors, lockedPositions, positionConcentration };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function computeDifficultyProfile(
    path: string[],
    wordSet: Set<string>,
): DifficultyProfile {
    const pathDetails = path.map((word) => computeWordDetail(word, wordSet));

    const lockedPositionTotal = pathDetails.reduce((s, d) => s + d.lockedPositions, 0);
    const avgPositionConcentration = round2(
        pathDetails.reduce((s, d) => s + d.positionConcentration, 0) / pathDetails.length,
    );

    // Re-derive branching from totalNeighbors (consistent with per-position data)
    const branchCounts = pathDetails.map((d) => d.totalNeighbors);
    const avgBranchingFactor = round1(
        branchCounts.reduce((s, n) => s + n, 0) / branchCounts.length,
    );
    const minBranchingFactor = Math.min(...branchCounts);

    const moves = path.length - 1;

    const rawScore =
        (moves - 3) * 2.0                                          // +2 per move above 3
        + avgPositionConcentration * 3.0                            // 0–3 pts; concentration → harder
        + clamp((avgBranchingFactor - 5) / 10, 0, 1) * 2.0        // 0–2 pts; high branching → harder
        + clamp((7 - minBranchingFactor) / 7, 0, 1) * 1.0;        // 0–1 pts; low min → harder

    const difficultyScore = clamp(Math.round(rawScore), 1, 10);
    // Thresholds calibrated for the expanded word list (~12k words).
    // Higher branching factors with more words push scores up vs the old 3.4k-word set.
    // 4-move pairs → ~5–6 (easy), 5-move → ~7–8 (medium), 6-move → ~9–10 (hard).
    const difficultyTier: 'easy' | 'medium' | 'hard' =
        difficultyScore <= 6 ? 'easy' : difficultyScore <= 8 ? 'medium' : 'hard';

    return {
        pathDetails,
        lockedPositionTotal,
        avgPositionConcentration,
        avgBranchingFactor,
        minBranchingFactor,
        difficultyScore,
        difficultyTier,
    };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function tierEmoji(tier: 'easy' | 'medium' | 'hard'): string {
    return tier === 'easy' ? '🟢' : tier === 'medium' ? '🟡' : '🔴';
}
