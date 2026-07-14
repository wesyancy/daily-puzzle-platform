import { describe, it, expect } from 'vitest';
import { computeNeighborGraph } from './computeNeighborGraph';

// Same synthetic word set as bfsShortestPath.test.ts — see that file for
// the full graph diagram and neighbor-count reasoning.
const MINI_WORDS = new Set(['CAT', 'COT', 'COG', 'DOG', 'DOT', 'HOT', 'HOG', 'LOG']);

describe('computeNeighborGraph', () => {
    it('covers every word reachable from the start', () => {
        // All 8 words are in the same connected component starting from CAT
        const graph = computeNeighborGraph('CAT', MINI_WORDS);
        expect(Object.keys(graph)).toHaveLength(8);
    });

    it('records only valid one-letter-change neighbors that exist in the word set', () => {
        const graph = computeNeighborGraph('CAT', MINI_WORDS);

        // CAT can only change A→O to reach COT; no other 1-letter change lands in MINI_WORDS
        expect(graph['CAT']).toEqual(['COT']);

        // COG reaches DOG (D replaces C), HOG (H replaces C), LOG (L replaces C), COT (T replaces G)
        expect(graph['COG']).toContain('DOG');
        expect(graph['COG']).toContain('HOG');
        expect(graph['COG']).toContain('LOG');
        expect(graph['COG']).toContain('COT');
        expect(graph['COG']).toHaveLength(4);
    });

    it('never lists a neighbor that is outside the word set', () => {
        const graph = computeNeighborGraph('CAT', MINI_WORDS);
        for (const [, neighbors] of Object.entries(graph)) {
            for (const neighbor of neighbors) {
                expect(MINI_WORDS.has(neighbor), `"${neighbor}" should be in MINI_WORDS`).toBe(true);
            }
        }
    });

    it('includes the start word itself in the graph', () => {
        const graph = computeNeighborGraph('DOG', MINI_WORDS);
        expect('DOG' in graph).toBe(true);
    });

    it('produces a symmetric adjacency: if A lists B, B lists A', () => {
        const graph = computeNeighborGraph('CAT', MINI_WORDS);
        for (const [word, neighbors] of Object.entries(graph)) {
            for (const neighbor of neighbors) {
                expect(
                    graph[neighbor],
                    `${neighbor} should list ${word} as a neighbor`,
                ).toContain(word);
            }
        }
    });
});
