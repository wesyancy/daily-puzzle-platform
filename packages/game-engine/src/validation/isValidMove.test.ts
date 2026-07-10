import { describe, it, expect } from 'vitest';
import { isValidMove } from './isValidMove';

const MINI_WORDS = new Set(['CAT', 'COT', 'COG', 'DOG', 'DOT', 'HOT', 'HOG', 'LOG']);

describe('isValidMove', () => {
    it('accepts a valid one-letter change to a word in the set', () => {
        expect(isValidMove('CAT', 'COT', MINI_WORDS)).toBe(true); // pos 1: A→O
        expect(isValidMove('COT', 'COG', MINI_WORDS)).toBe(true); // pos 2: T→G
        expect(isValidMove('COG', 'DOG', MINI_WORDS)).toBe(true); // pos 0: C→D
    });

    it('rejects when start equals next (zero changes)', () => {
        expect(isValidMove('CAT', 'CAT', MINI_WORDS)).toBe(false);
    });

    it('rejects a two-letter change', () => {
        // COT→DOG changes both pos 0 (C→D) and pos 2 (T→G)
        expect(isValidMove('COT', 'DOG', MINI_WORDS)).toBe(false);
    });

    it('rejects a three-letter change', () => {
        // CAT→LOG changes all three positions
        expect(isValidMove('CAT', 'LOG', MINI_WORDS)).toBe(false);
    });

    it('rejects a word that is not in the word set', () => {
        // BAT would be a valid 1-letter change from CAT, but is not in MINI_WORDS
        expect(isValidMove('CAT', 'BAT', MINI_WORDS)).toBe(false);
    });

    it('rejects words of different lengths', () => {
        expect(isValidMove('CAT', 'CATS', MINI_WORDS)).toBe(false);
        expect(isValidMove('CAT', 'AT', MINI_WORDS)).toBe(false);
    });
});
