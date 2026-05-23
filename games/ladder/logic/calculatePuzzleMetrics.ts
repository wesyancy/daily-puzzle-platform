import { bfsShortestPath } from '../solver/bfsShortestPath';

export interface PuzzleMetrics {
    shortestPathLength: number;
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

    return {
        shortestPathLength: path.length - 1,
    };
}
