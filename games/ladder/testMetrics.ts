import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    createWordSet,
} from '@repo/dictionary';

import { calculatePuzzleMetrics } from './logic/calculatePuzzleMetrics';

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords = filterBannedWords(filteredWords);

const wordSet = createWordSet(cleanedWords);

const metrics = calculatePuzzleMetrics('COLD', 'WARM', wordSet);

console.log(metrics);
