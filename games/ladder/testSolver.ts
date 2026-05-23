import {
  loadDictionary,
  filterWords,
  filterBannedWords,
  createWordSet,
} from "@repo/dictionary";

import { bfsShortestPath } from "./solver/bfsShortestPath";

const rawWords = loadDictionary();

const filteredWords = filterWords(rawWords);

const cleanedWords =
  filterBannedWords(filteredWords);

const wordSet = createWordSet(cleanedWords);

const result = bfsShortestPath(
  "COLD",
  "WARM",
  wordSet
);

console.log(result);