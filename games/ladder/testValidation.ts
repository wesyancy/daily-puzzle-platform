import {
  loadDictionary,
  filterWords,
  filterBannedWords,
  createWordSet,
} from "@repo/dictionary";

import { isValidMove } from "./validation/isValidMove";

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords =
  filterBannedWords(filteredWords);

const wordSet = createWordSet(cleanedWords);

console.log(
  isValidMove("COLD", "CORD", wordSet)
);

console.log(
  isValidMove("COLD", "WARM", wordSet)
);