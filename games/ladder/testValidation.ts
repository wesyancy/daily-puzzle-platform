import {
    loadDictionary,
    filterWords,
    filterBannedWords,
    createWordSet,
    loadCommonWords,
    filterCommonWords,
} from '@repo/dictionary';

import { isValidMove } from './validation/isValidMove';

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords = filterBannedWords(filteredWords);

const commonWords = loadCommonWords();

const finalWords = filterCommonWords(cleanedWords, commonWords);

const wordSet = createWordSet(finalWords);

console.log(isValidMove('COLD', 'CORD', wordSet));

console.log(isValidMove('COLD', 'WARM', wordSet));
