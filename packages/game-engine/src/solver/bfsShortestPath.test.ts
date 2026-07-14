import { describe, it, expect } from 'vitest';
import { bfsShortestPath } from './bfsShortestPath';

// Minimal synthetic word set — avoids loading the real dictionary so tests
// are fast and deterministic. Graph is fully hand-verifiable:
//
//   CAT — COT — COG — DOG
//          |     |  \  |
//         DOT — HOT  HOG
//          |         |
//         (DOG) --- LOG
//
// Shortest paths (confirmed by hand):
//   CAT→DOG = 3 hops  (CAT→COT→DOT→DOG  or  CAT→COT→COG→DOG)
//   CAT→LOG = 3 hops  (CAT→COT→COG→LOG)
const MINI_WORDS = new Set(['CAT', 'COT', 'COG', 'DOG', 'DOT', 'HOT', 'HOG', 'LOG']);

describe('bfsShortestPath', () => {
    it('returns the start word alone when start equals target', () => {
        expect(bfsShortestPath('CAT', 'CAT', MINI_WORDS)).toEqual(['CAT']);
    });

    it('returns null when the target has no path from start', () => {
        // XYZ is not in MINI_WORDS and has no connection to anything in it
        expect(bfsShortestPath('CAT', 'XYZ', MINI_WORDS)).toBeNull();
    });

    it('returns the correct number of words for a 3-hop path', () => {
        // 3 hops = 4 words in the returned array
        const path = bfsShortestPath('CAT', 'DOG', MINI_WORDS);
        expect(path).not.toBeNull();
        expect(path!.length).toBe(4);
    });

    it('returns a path that starts at start and ends at target', () => {
        const path = bfsShortestPath('CAT', 'DOG', MINI_WORDS)!;
        expect(path[0]).toBe('CAT');
        expect(path[path.length - 1]).toBe('DOG');
    });

    it('every word in the path is in the word set', () => {
        const path = bfsShortestPath('CAT', 'DOG', MINI_WORDS)!;
        for (const word of path) {
            expect(MINI_WORDS.has(word), `"${word}" should be in MINI_WORDS`).toBe(true);
        }
    });

    it('each consecutive pair in the path differs by exactly one letter', () => {
        const path = bfsShortestPath('CAT', 'LOG', MINI_WORDS)!;
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i + 1];
            let diffs = 0;
            for (let j = 0; j < a.length; j++) {
                if (a[j] !== b[j]) diffs++;
            }
            expect(diffs, `step ${i}: "${a}" → "${b}" should differ by 1`).toBe(1);
        }
    });

    it('finds the shortest path — BFS never returns a longer-than-minimum path', () => {
        // Both directions should yield the same hop count
        const forward = bfsShortestPath('CAT', 'LOG', MINI_WORDS)!;
        const backward = bfsShortestPath('LOG', 'CAT', MINI_WORDS)!;
        expect(forward.length).toBe(backward.length);
    });
});
