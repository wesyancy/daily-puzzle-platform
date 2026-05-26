import { bfsShortestPath } from '../solver/bfsShortestPath';

export function isPuzzleSolvable(
    start: string,
    target: string,
    wordSet: Set<string>,
): boolean {
    const path = bfsShortestPath(start, target, wordSet);

    return path !== null;
}
