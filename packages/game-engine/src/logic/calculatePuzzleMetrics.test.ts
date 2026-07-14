import { describe, it, expect } from 'vitest';
import { calculatePuzzleMetrics } from './calculatePuzzleMetrics';

// Same synthetic word set — see bfsShortestPath.test.ts for the graph diagram.
//
// BFS finds CAT→COT→DOT→DOG for the CAT→DOG query (3 hops).
// Branching factors along that path (confirmed by hand):
//   CAT: 1 neighbor (COT only)
//   COT: 4 neighbors (DOT, HOT, CAT, COG)
//   DOT: 3 neighbors (COT, HOT, DOG)
//   DOG: 4 neighbors (COG, HOG, LOG, DOT)
//   Average = (1+4+3+4)/4 = 3.0, Min = 1
const MINI_WORDS = new Set(['CAT', 'COT', 'COG', 'DOG', 'DOT', 'HOT', 'HOG', 'LOG']);

describe('calculatePuzzleMetrics', () => {
    it('returns null when no path exists between the words', () => {
        expect(calculatePuzzleMetrics('CAT', 'XYZ', MINI_WORDS)).toBeNull();
    });

    it('returns correct shortestPathLength for a 3-hop puzzle', () => {
        const metrics = calculatePuzzleMetrics('CAT', 'DOG', MINI_WORDS);
        expect(metrics).not.toBeNull();
        expect(metrics!.shortestPathLength).toBe(3);
    });

    it('returns 0 shortestPathLength when start equals target', () => {
        // bfsShortestPath returns [word] for same-word — path length − 1 = 0
        const metrics = calculatePuzzleMetrics('CAT', 'CAT', MINI_WORDS);
        expect(metrics).not.toBeNull();
        expect(metrics!.shortestPathLength).toBe(0);
    });

    it('returns the correct average branching factor (rounded to 1 decimal)', () => {
        const metrics = calculatePuzzleMetrics('CAT', 'DOG', MINI_WORDS)!;
        // (1+4+3+4)/4 = 3.0
        expect(metrics.avgBranchingFactor).toBe(3.0);
    });

    it('returns the correct minimum branching factor', () => {
        const metrics = calculatePuzzleMetrics('CAT', 'DOG', MINI_WORDS)!;
        // CAT has only 1 neighbor — the tightest chokepoint on the path
        expect(metrics.minBranchingFactor).toBe(1);
    });

    it('avgBranchingFactor is always > 0 for any solvable puzzle', () => {
        const metrics = calculatePuzzleMetrics('HOT', 'LOG', MINI_WORDS)!;
        expect(metrics.avgBranchingFactor).toBeGreaterThan(0);
    });
});
