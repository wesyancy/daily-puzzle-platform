import { getNeighbors } from '@repo/dictionary';

/**
 * BFS from `start` over the full connected component reachable in `wordSet`.
 * Returns an adjacency map: word → valid one-letter-change neighbors.
 *
 * Used to pre-compute all valid moves for a puzzle so the client never needs
 * the raw dictionary — it only sees the graph for this specific puzzle.
 */
export function computeNeighborGraph(
    start: string,
    wordSet: Set<string>,
): Record<string, string[]> {
    const graph: Record<string, string[]> = {};

    const queue: string[] = [start];

    const visited = new Set<string>([start]);

    while (queue.length > 0) {
        const word = queue.shift()!;

        const neighbors = getNeighbors(word, wordSet);

        graph[word] = neighbors;

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return graph;
}
