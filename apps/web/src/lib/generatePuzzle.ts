import { loadPuzzleWords, createWordSet } from '@repo/dictionary';
import { bfsShortestPath, computeNeighborGraph } from '@repo/game-engine';

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

export function generatePuzzle() {
    const allWords = loadPuzzleWords();
    const wordSet = createWordSet(allWords);
    const candidates = allWords.filter((w) => w.length === 4);

    while (true) {
        const start = randomItem(candidates);
        const target = randomItem(candidates);

        if (start === target) continue;

        const path = bfsShortestPath(start, target, wordSet);

        if (!path) continue;

        if (path.length >= 5 && path.length <= 7) {
            return {
                start,
                target,
                optimalPath: path,
                neighborGraph: computeNeighborGraph(start, wordSet),
            };
        }
    }
}
