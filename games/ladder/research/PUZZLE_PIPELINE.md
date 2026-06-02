# Puzzle Pipeline

How `puzzle-words.txt` and `word-pairs.txt` were built, and how to keep them healthy.

---

## The two key files

| File | What it is |
|---|---|
| `packages/dictionary/src/data/puzzle-words.txt` | Every word the game accepts as a valid move. Generated, committed, loaded at runtime. |
| `games/ladder/data/word-pairs.txt` | The curated pool of start/target pairs the game draws from. Hand-reviewed, committed. |

Both files are committed to the repo. Neither is generated at runtime — the web app only reads them.

---

## Part 1: Building `puzzle-words.txt`

### Source files

| File | What it is |
|---|---|
| `packages/dictionary/src/data/enable1.txt` | ~173k English words — the base dictionary (ENABLE word list) |
| `packages/dictionary/src/data/commonWords.txt` | ~20k curated everyday words — the allowlist |
| `packages/dictionary/src/filters/bannedWords.ts` | Hardcoded profanity blocklist |

### Pipeline

```
enable1.txt
  → filterWords()          keep 3–7 letter, alpha-only words
  → filterBannedWords()    remove profanity (bannedWords.ts)
  → filterCommonWords()    intersect with commonWords.txt (the critical gate)
  → keep only 4–5 letter words
  → sort alphabetically
  → puzzle-words.txt
```

The `commonWords.txt` intersection is the most important step. ENABLE has many valid but obscure words. Only words that are both in ENABLE *and* in the common-words allowlist make it into the game. This keeps vocabulary familiar to players.

### How to regenerate

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
```

Run this whenever:
- You add words to `commonWords.txt` (after approving word reports)
- You add words to `bannedWords.ts`
- You change the length filter

After regenerating, commit `puzzle-words.txt` and re-validate puzzle pairs (see Part 3).

### Adding a word

If a word report comes in for a missing word:
1. Run `reviewWordReports.ts` to see if it's eligible
2. If eligible: add it (lowercase) to `commonWords.txt`
3. Run `buildWordList.ts` to rebuild `puzzle-words.txt`
4. Run `validateWordPairs.ts` to check if any existing pairs are affected
5. Commit both files

See `WORD-REVIEW.md` for the full interactive approval workflow.

---

## Part 2: Building `word-pairs.txt`

### Quality thresholds (the "COLD → WARM" profile)

Every puzzle pair must pass these checks before it's added:

| Check | Threshold | Rationale |
|---|---|---|
| Path length | 4–5 moves | Short enough to feel approachable; long enough to feel like a puzzle |
| Min branching | ≥ 7 | No step should feel forced — player always has real choices |
| Avg branching | ≥ 7 | Overall graph should feel open, not like a narrow corridor |
| Rare letters | No J, Z, V | Rare letters make words feel obscure and reduce branching options |
| Word set | Both words in `puzzle-words.txt` | Can't use words the game doesn't recognize |

Branching = number of valid one-letter-change neighbors a word has in `puzzle-words.txt`. High branching means many valid moves from that position. Low branching means the player is funneled.

`COLD → WARM` is the reference puzzle: 4-move optimal path, both words universally familiar, 0 shared letters in the same position (maximum directional tension), and the semantic relationship is immediately obvious.

### How pairs get into `word-pairs.txt`

**Method A: Datamuse semantic suggestions (primary)**

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/suggestWordPairs.ts
```

Queries the [Datamuse API](https://www.datamuse.com/api/) for antonyms (`rel_ant`) and trigger-associations (`rel_trg`) of every 4-letter word in the puzzle set. Filters results to pairs that meet quality thresholds. Writes to `data/suggested-pairs.txt`.

After running: open `suggested-pairs.txt`, review the suggestions, copy the good ones to `word-pairs.txt`. Pairs with a clear thematic relationship (opposites, paired concepts) are preferred.

**Method B: Configurable random or semantic generation**

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/generatePuzzle.ts [options]
```

A more flexible generator. See its `--help` output or the script header for all options. Key toggles:

| Flag | Default | Effect |
|---|---|---|
| `--count N` | 5 | How many puzzles to find |
| `--min-moves N` | 4 | Minimum path length |
| `--max-moves N` | 5 | Maximum path length |
| `--min-branching N` | 7 | Minimum branching at any step on the path |
| `--min-avg N` | 7 | Minimum average branching across the path |
| `--length N` | 4 | Word length (4 or 5) |
| `--similarity N` | 0 | Minimum shared letters in same position (0 = no filter) |
| `--allow-rare` | off | Allow J, Z, V in start/target |
| `--semantic` | off | Use Datamuse to find semantically related pairs |
| `--save` | off | Append results to `data/suggested-pairs.txt` |

**Method C: Manual curation**

Some pairs are hand-picked because they feel right: `HEAD,TAIL`, `FIND,LOSE`, `HIRE,SACK`, `LESS,MORE`. These go directly into `word-pairs.txt` and get validated on the next run of `validateWordPairs.ts`.

### After adding pairs

Always re-validate after adding anything to `word-pairs.txt`:

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
```

This overwrites `word-pairs.txt` with only the pairs that pass. If any pair drops out, it will say why.

---

## Part 3: Keeping both files healthy

### After any dictionary change

Adding or removing words changes branching factors across the whole graph. A word that passed validation before may now fail (or new pairs may become valid). After any `puzzle-words.txt` rebuild:

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
```

### Full script reference

| Script | Purpose |
|---|---|
| `buildWordList.ts` | Rebuild `puzzle-words.txt` from source files |
| `suggestWordPairs.ts` | Find semantically related pairs via Datamuse → `suggested-pairs.txt` |
| `generatePuzzle.ts` | Configurable generator: random or semantic, all thresholds adjustable |
| `validateWordPairs.ts` | Validate `word-pairs.txt` (or any pairs file), overwrite with passing pairs |
| `reviewWordReports.ts` | Read player word reports from Supabase, classify and summarize |
| `approveWordReports.ts` | Interactive: approve/deny word reports, auto-adds to `commonWords.txt` |
| `analyzeLetterBranches.ts` | Per-letter branch analysis: how many valid neighbors each position has |

### Quality judgment calls

The thresholds are heuristics, not laws. A pair with avg branching 6.8 might still feel great. A pair at avg 9.0 might feel directionless. The thresholds are tuned to the COLD→WARM profile — adjust them in `validateWordPairs.ts` and `generatePuzzle.ts` if the game's feel changes.

What to look for in a good pair:
- Both words immediately recognizable to a broad audience
- A clear relationship (opposites, associated concepts, thematic pair)
- Interesting intermediate words on the optimal path
- No steps that feel forced (no moves where only one choice makes sense)
