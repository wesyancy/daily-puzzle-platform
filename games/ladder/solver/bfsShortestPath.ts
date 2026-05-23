import { getNeighbors } from '@repo/dictionary';

export function bfsShortestPath(
    start: string,
    target: string,
    wordSet: Set<string>,
): string[] | null {
    if (start === target) {
        return [start];
    }

    const queue: string[][] = [[start]];

    const visited = new Set<string>();
    visited.add(start);

    while (queue.length > 0) {
        const currentPath = queue.shift();

        if (!currentPath) {
            continue;
        }

        const currentWord = currentPath[currentPath.length - 1];

        const neighbors = getNeighbors(currentWord, wordSet);

        for (const neighbor of neighbors) {
            if (visited.has(neighbor)) {
                continue;
            }

            const nextPath = [...currentPath, neighbor];

            if (neighbor === target) {
                return nextPath;
            }

            visited.add(neighbor);

            queue.push(nextPath);
        }
    }

    return null;
}
