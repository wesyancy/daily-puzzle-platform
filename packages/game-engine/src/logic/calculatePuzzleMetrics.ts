import { getNeighbors } from '@repo/dictionary';
import { bfsShortestPath } from '../solver/bfsShortestPath';

export interface PuzzleMetrics {
    /** Number of moves in the shortest solution (path length minus start word). */
    shortestPathLength: number;

    /**
     * Average number of valid moves available at each word along the optimal path,
     * including start and target. Higher = more open / creative freedom.
     * Lower = more constrained / maze-like.
     *
     * Observed sweet spot for satisfying puzzles: roughly 4–6.
     */
    avgBranchingFactor: number;

    /**
     * The tightest chokepoint on the optimal path — the step with the fewest
     * valid moves. A value of 1 means the player had no choice at that step,
     * which usually feels bad.
     */
    minBranchingFactor: number;
}

export function calculatePuzzleMetrics(
    start: string,
    target: string,
    wordSet: Set<string>,
): PuzzleMetrics | null {
    const path = bfsShortestPath(start, target, wordSet);

    if (!path) {
        return null;
    }

    const branchCounts = path.map(
        (word) => getNeighbors(word, wordSet).length,
    );

    const avgBranchingFactor =
        branchCounts.reduce((sum, n) => sum + n, 0) / branchCounts.length;

    const minBranchingFactor = Math.min(...branchCounts);

    return {
        shortestPathLength: path.length - 1,
        avgBranchingFactor: Math.round(avgBranchingFactor * 10) / 10,
        minBranchingFactor,
    };
}
