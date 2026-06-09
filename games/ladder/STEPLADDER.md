# Stepladder

A daily word ladder game. Change one letter at a time to get from the start word to the target word in as few moves as possible.

---

## The Format

Each session is a **set of three puzzles** — Easy, Medium, and Hard — played in order. You can play as many sets as you want (unlimited mode), or lock to one set per day for everyone (daily mode). The code supports both; see [GAME_DESIGN.md](GAME_DESIGN.md) for how to flip the switch.

**Easy** · 4-move optimal path · 7 guess limit  
**Medium** · 5-move optimal path · 8 guess limit  
**Hard** · 6–7-move optimal path · 8 guess limit  

After completing all three (pass or fail), you see a results summary and a share card.

---

## Gameplay Rules

1. Start at the start word.
2. Each move, change exactly one letter. The result must be a real word in the game dictionary.
3. Reach the target word in as few moves as possible.
4. Each puzzle has a **move limit** — run out and the puzzle fails.
5. **Par** = the optimal path length. Solving at par or under is the goal.

---

## Par System

The optimal path length is shown as "Par" on each puzzle. After solving:

- **At par** → "Solved in 4 moves — par!"
- **Over par** → "+1 over par"
- **Under par** → "under par!" (rare)

The share card shows your par result for each puzzle, making it easy to compare with friends without spoiling the words.

---

## Difficulty System

Puzzles are scored 1–10 using a composite difficulty formula that considers:

- **Path length** — more moves = harder
- **Position concentration** — if all valid moves come from one letter slot, the puzzle is harder to navigate
- **Average branching factor** — more valid options per step = more room for wrong turns
- **Min branching factor** — a bottleneck step (very few options) increases difficulty

Score thresholds (calibrated for the ~12k-word expanded dictionary):
- **Easy** · score 1–6 · typically 4-move paths
- **Medium** · score 7–8 · typically 5-move paths
- **Hard** · score 9–10 · typically 6+ move paths

---

## The Word List

`packages/dictionary/src/data/puzzle-words.txt` — ~12,500 words (4–5 letters).

**Pipeline:**
```
enable1.txt (~173k words)
  → filterWords()         keep 3–7 letter, alpha-only words
  → filterBannedWords()   remove profanity (bannedWords.ts)
  → filterExcluded()      remove gameplay-poor words (excluded-words.txt)
  → keep 4–5 letter words
  → puzzle-words.txt
```

The old `commonWords.txt` allowlist was removed from the game dictionary pipeline — it was too restrictive for valid moves. Words are now included by default and removed explicitly via `excluded-words.txt`.

**Two-tier vocabulary:** `commonWords.txt` is still used to gate *puzzle endpoints* (start/target words). Puzzle paths can use any word in the game dictionary as an intermediate step, but the words players see as their start and goal must be familiar everyday words. This is applied in pair generation (`buildPairPool.ts`, `generatePuzzle.ts`) not in `buildWordList.ts`.

To rebuild: `pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts`

---

## The Pair Pool

`games/ladder/data/pair-pool.txt` — thousands of scored pairs, tiered by difficulty.

Generated mathematically from the full word list (no semantic filter). Each entry includes path length, branching metrics, and difficulty score. Used as the source for random set generation and daily schedule curation.

To regenerate: `pnpm --filter @repo/ladder exec npx tsx research/scripts/buildPairPool.ts`

---

## The Daily Schedule

`games/ladder/data/daily-schedule.json` — editorial layer over the pair pool.

When `DAILY_MODE = true` in `apps/web/src/lib/generatePuzzle.ts`, the app looks up today's UTC date and serves the pre-curated trio. In unlimited mode (current), this file is ignored and sets are drawn randomly from the pair pool.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web app | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Theming | next-themes |
| Database | Supabase (feedback + word reports) |
| Monorepo | pnpm workspaces + Turborepo |
| Packages | `@repo/dictionary`, `@repo/game-engine` |

---

## File Map

```
apps/web/src/
  app/game/page.tsx         Server component: generates puzzle set, passes to client
  components/GameClient.tsx Client component: full game UI (trio flow, modals, state)
  lib/generatePuzzle.ts     Puzzle set generation (random + daily mode, PuzzleSet type)
  app/actions.ts            Server actions: submitFeedback, submitWordReport

packages/
  dictionary/               loadPuzzleWords, getNeighbors, filterWords, etc.
  game-engine/              bfsShortestPath, computeNeighborGraph, calculatePuzzleMetrics

games/ladder/
  data/
    pair-pool.txt           Scored pair pool (source for random sets)
    daily-schedule.json     Pre-curated daily trios (used when DAILY_MODE = true)
    word-pairs.txt          Legacy curated pairs (kept for reference)
    blocked-words.txt       Words never used as puzzle start/target
    excluded-words.txt      Words removed from gameplay vocabulary entirely
  research/
    lib/difficultyScore.ts  Difficulty profile computation
    scripts/
      buildWordList.ts      Rebuild puzzle-words.txt
      buildPairPool.ts      Generate and score the full pair pool
      scorePairs.ts         Score existing pairs, calibrate difficulty formula
      generatePuzzle.ts     Configurable puzzle finder (--difficulty flag)
      analyzeLetterBranches.ts  Per-position branch analysis for any word
      suggestWordPairs.ts   Datamuse semantic pair suggestions
      validateWordPairs.ts  Validate pairs file against quality thresholds
      reviewWordReports.ts  Review player word reports from Supabase
      approveWordReports.ts Interactive word report approval workflow
    PUZZLE_PIPELINE.md      How the word list and pair pool are built
    WORD-REVIEW.md          How to review and act on player word reports
  STEPLE.md                 This file — master app overview
  GAME_DESIGN.md            Design decisions, rationale, and levers
```

---

## Quick Reference: Research Commands

```bash
# Rebuild word list after changing excluded-words.txt or bannedWords.ts
pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts

# Score the curated pairs (calibrate difficulty formula)
pnpm --filter @repo/ladder exec npx tsx research/scripts/scorePairs.ts

# Generate 5 easy puzzles
pnpm --filter @repo/ladder exec npx tsx research/scripts/generatePuzzle.ts --difficulty easy --count 5

# Build/rebuild the pair pool
pnpm --filter @repo/ladder exec npx tsx research/scripts/buildPairPool.ts

# Analyze letter branches for a word
pnpm --filter @repo/ladder exec npx tsx research/scripts/analyzeLetterBranches.ts COLD WARM

# Review player word reports
pnpm --filter @repo/ladder exec npx tsx research/scripts/reviewWordReports.ts

# Approve word reports interactively
pnpm --filter @repo/ladder exec npx tsx research/scripts/approveWordReports.ts
```
