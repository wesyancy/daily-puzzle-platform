# Daily Puzzle Platform

A monorepo for daily word puzzle games. The first game is a word ladder — change one letter at a time to get from the start word to the target word in as few moves as possible.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| UI components | shadcn/ui, Radix UI, Lucide icons |
| Dark mode | next-themes (class-based) |
| Monorepo | pnpm workspaces + TypeScript project references |
| Feedback storage | Server Actions → **not yet persisted** (console.log; Supabase TBD) |
| Deployment | Vercel (TBD) |

---

## Monorepo Structure

```
apps/
  web/                        Next.js app
    src/app/
      page.tsx                Redirects / → /game
      game/page.tsx           Server component — generates puzzle, passes to client
      actions.ts              Server Actions: submitFeedback, submitWordReport
    src/components/
      GameClient.tsx          All game UI (client component)
      ThemeToggle.tsx         Light/dark toggle
    src/lib/
      generatePuzzle.ts       Core puzzle generation (curated pairs → random fallback)
      loadWordPairs.ts        Reads games/ladder/data/word-pairs.txt

packages/
  dictionary/                 Word list utilities
    src/data/puzzle-words.txt Pre-built list of 3,396 valid words (4–5 letters)
    src/filters/bannedWords.ts Profanity/inappropriate words excluded from word list
    src/loaders/
      loadPuzzleWords.ts      Runtime loader used by the web app
      loadDictionary.ts       Build-time loader (raw enable1.txt — not used at runtime)
    src/utils/
      getNeighbors.ts         Returns all valid one-letter-change words
      createWordSet.ts        Converts array → Set for O(1) lookup

  game-engine/                Puzzle logic
    src/solver/bfsShortestPath.ts  Finds shortest path between two words
    src/graph/computeNeighborGraph.ts  BFS to build full neighbor map from a start word
    src/logic/
      isValidMove.ts          Checks a single guess
      isPuzzleSolvable.ts     Checks if a path exists between two words
      calculatePuzzleMetrics.ts Returns shortestPathLength, avgBranching, minBranching

games/
  ladder/
    data/
      word-pairs.txt          119 curated puzzle pairs (validated, safe to ship)
      suggested-pairs.txt     318 Datamuse suggestions — review pool, not used at runtime
      blocked-words.txt       Words never used as puzzle endpoints (proper nouns, drugs)
      blocked-pairs.txt       Specific pairs never used (violence, name combos, etc.)
    research/scripts/
      validateWordPairs.ts    Validates + filters word-pairs.txt against all quality gates
      suggestWordPairs.ts     Queries Datamuse API to suggest semantically related pairs
      buildWordList.ts        Regenerates puzzle-words.txt from scratch
```

---

## Data Flow

```
Request hits /game
    │
    ▼
game/page.tsx (server, force-dynamic — new puzzle every load)
    │  loadWordPairs()          reads word-pairs.txt
    │  generatePuzzle()         picks a curated pair → runs BFS → quality check
    │                           fallback: random candidate if no curated pair passes
    │  computeNeighborGraph()   BFS from start word → builds full neighbor map
    │
    ▼
GameClient.tsx (client)         receives { start, target, optimalPath, neighborGraph }
    │  neighborGraph[word]      used for guess validation (no dictionary on client)
    │  hints popup (💡)         shows neighborGraph[currentWord] sorted alphabetically
    │
    ▼  on submit feedback / word report
actions.ts (Server Action)      console.log today; Supabase insert soon
```

---

## Game Tuning Levers

### Puzzle difficulty

All four constants live in two places that must stay in sync:
- [`apps/web/src/lib/generatePuzzle.ts`](apps/web/src/lib/generatePuzzle.ts) — runtime (affects live game)
- [`games/ladder/research/scripts/validateWordPairs.ts`](games/ladder/research/scripts/validateWordPairs.ts) — build-time (affects which pairs survive validation)

| Constant | Current | Effect |
|---|---|---|
| `MIN_MOVES` | 4 | Minimum steps in shortest path |
| `MAX_MOVES` | 5 | Maximum steps in shortest path |
| `MIN_BRANCHING` | 7 | Min neighbors any word on the path can have |
| `MIN_AVG_BRANCHING` | 7 | Average neighbors across all path words |

**Higher `MIN_BRANCHING`** → more open puzzles, player rarely feels stuck. Lower → tighter bottlenecks, more puzzle-y.  
**Narrower move range** (e.g. 4–4) → consistent length. Wider (e.g. 3–6) → more variety.

After changing these, re-run the validator to filter `word-pairs.txt`:
```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
```

### Rare letter filter

Words with these letters are excluded as puzzle start/target words (they can still appear mid-path).

```ts
// generatePuzzle.ts
const RARE_LETTERS = new Set(['J', 'Z', 'V']);
```

Add or remove letters here. The same set is mirrored in `validateWordPairs.ts`.

### Word blocklists

| File | Purpose |
|---|---|
| [`games/ladder/data/blocked-words.txt`](games/ladder/data/blocked-words.txt) | Words never used as start/target (proper nouns, drugs) |
| [`games/ladder/data/blocked-pairs.txt`](games/ladder/data/blocked-pairs.txt) | Specific pairs never used (violence, political, name combos) |

Edit either file, then re-run the validator to purge any affected pairs from `word-pairs.txt`.

### Adding new puzzle pairs

1. Add pairs manually to `word-pairs.txt`, or run Datamuse to generate suggestions:
   ```bash
   pnpm --filter @repo/ladder exec npx tsx research/scripts/suggestWordPairs.ts
   # output → games/ladder/data/suggested-pairs.txt (with metrics)
   ```
2. Review `suggested-pairs.txt`, copy good ones to `word-pairs.txt`
3. Validate:
   ```bash
   pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
   ```

### Profanity / word list

Banned words live in [`packages/dictionary/src/filters/bannedWords.ts`](packages/dictionary/src/filters/bannedWords.ts). After editing, regenerate the word list:
```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/buildWordList.ts
```

---

## Local Development

```bash
pnpm install
pnpm --filter web dev      # http://localhost:3000
```

> **Note:** `outputFileTracingRoot` in `next.config.ts` is intentionally gated to production only — setting it in dev causes Turbopack to trace the entire monorepo and hang.

---

## Pending

- [ ] Wire `actions.ts` to Supabase (`puzzle_feedback` + `word_reports` tables)
- [ ] Deploy to Vercel (set `Root Directory` → `apps/web`)
- [ ] Daily puzzle scheduling (same puzzle for all users on a given day)
- [ ] Game name (currently "Ladder" — placeholder)
