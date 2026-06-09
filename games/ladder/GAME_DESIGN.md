# Stepladder — Game Design Decisions

Each section records a decision, the rationale behind it, the current value, and the levers available to adjust it.

---

## 1. Word List Filtering

**Decision:** Two-tier vocabulary — broad game dictionary for valid moves, familiar common words for puzzle endpoints.

**Rationale:** The original `commonWords.txt` allowlist was too restrictive for the *game vocabulary* (valid moves): many normal words were absent, creating false "not in word list" errors. But applying that same filter to *puzzle endpoints* (start/target words) is exactly right — players shouldn't be shown obscure words as their goal.

The solution: remove `commonWords.txt` from the game dictionary pipeline (lets all reasonable words be valid moves), but re-apply it as a gate on which words can become puzzle start/target candidates. This gives players a large, generous move vocabulary with familiar, recognizable endpoints.

**Current values:**
- **Game dictionary** (`puzzle-words.txt`, ~12,500 words): `enable1.txt` → filterWords → filterBannedWords → filterExcluded → 4–5 letter
- **Puzzle endpoint candidates** (~1,361 4-letter words): game dictionary ∩ `commonWords.txt`, minus rare letters (J/Z/V) and blocked words
- Intermediate words on the path can be any word in the game dictionary — only the start/target are restricted to common words

**Levers:**
- Add words to `excluded-words.txt` to remove bad gameplay words (archaic, offensive, confusing)
- Add words to `bannedWords.ts` for outright profanity
- The `commonWords.txt` file controls what words can appear as puzzle endpoints; adding words there makes them eligible as start/target words
- `buildPairPool.ts` and `generatePuzzle.ts` (research) both respect this split automatically

---

## 2. Puzzle Quality Benchmark

**Decision:** The COLD → WARM puzzle defines the quality bar. Any pair that "feels like" COLD→WARM at the data level is a good puzzle.

**Rationale:** COLD→WARM has a clear thematic relationship, universally familiar words, zero shared letters (maximum directional tension), and interesting intermediate words. It's an intuitive reference for "what a good puzzle feels like."

**Current quality thresholds (validateWordPairs.ts):**
- Path length: 4–5 moves
- Min branching factor: ≥7 (no step feels forced)
- Avg branching factor: ≥7

**Note:** These thresholds were set on the old 3.4k-word list. With the expanded 12.5k-word list, branching factors are significantly higher. Thresholds should be re-evaluated; the difficulty score system (section 8) now provides a more nuanced signal.

**Levers:** All four thresholds are adjustable in `validateWordPairs.ts`. The `--min-branching` and `--min-avg` flags in `generatePuzzle.ts` and `buildPairPool.ts` expose the same controls for generation.

---

## 3. Rare Letter Exclusion

**Decision:** Words containing J, Z, or V are excluded from puzzle start/target words.

**Rationale:** These letters appear rarely in English, producing words that feel obscure or unfair as puzzle endpoints. They also reduce branching significantly (few common words differ by just a J, Z, or V), which creates bottleneck paths.

**Current value:** `RARE_LETTERS = new Set(['J', 'Z', 'V'])` in `generatePuzzle.ts` and `buildPairPool.ts`.

**Levers:** Pass `--allow-rare` flag to `generatePuzzle.ts` or `buildPairPool.ts` to override. The exclusion applies to start/target words only; these letters can still appear as valid intermediate moves.

---

## 4. Three-Puzzle Progressive Format

**Decision:** Each session is three puzzles: Easy → Medium → Hard, played in order.

**Rationale:** A single puzzle doesn't leave players with much to compare or discuss. Three progressive puzzles create a natural arc — warmup, challenge, stretch — and give players a reason to share results ("got 2/3 today"). The progression also gives players a sense of accomplishment even if they fail the hard puzzle.

**Current values:**
- Easy: 4-move optimal path
- Medium: 5-move optimal path
- Hard: 6–7-move optimal path

**Levers:** Path length targets are defined in `TIER_MOVE_RANGE` in `apps/web/src/lib/generatePuzzle.ts` and via `DIFFICULTY_PRESETS` in `research/scripts/generatePuzzle.ts`. Adjust these if the difficulty progression feels off after testing.

---

## 5. Move Limits (Par System)

**Decision:** Each puzzle has a move limit = optimal path length + a buffer. The optimal path length is called "par."

**Rationale:** Unlimited moves remove tension and make the game feel too casual. A move limit creates pressure without being arbitrary — players know the optimal solution exists, and the buffer gives them room to backtrack once. The golf "par" framing makes the limit feel natural and competitive rather than punitive.

**Current values:**
```
easy:   par + 3   (4-move optimal → 7 guesses)
medium: par + 3   (5-move optimal → 8 guesses)
hard:   par + 2   (6-move optimal → 8 guesses)
```

**Levers:** `MOVE_LIMIT_BUFFER` in `apps/web/src/lib/generatePuzzle.ts`. Larger buffer = more forgiving. The hard tier intentionally gets less slack — higher stakes on the final puzzle.

---

## 6. Unlimited vs Daily Mode

**Decision:** Build the daily architecture now, ship unlimited first.

**Rationale:** Beta testing with coworkers benefits from unlimited play (more feedback per session, players aren't waiting 24 hours between tests). The daily lock is a product decision that should come after the core mechanics are proven. Building the infrastructure now avoids a painful refactor later.

**Current state:** `DAILY_MODE = false` in `apps/web/src/lib/generatePuzzle.ts`.

**How to flip to daily mode:**
1. Set `DAILY_MODE = true`
2. Populate `games/ladder/data/daily-schedule.json` with entries for upcoming dates
3. Re-enable SSR in `apps/web/src/app/game/page.tsx` (remove the `ssr: false` flag)

---

## 7. Difficulty Scoring Metrics

**Decision:** Use a composite score (1–10) based on path length, position concentration, average branching, and min branching.

**Rationale:** Path length alone is a poor difficulty signal — a 4-move path through high-branching words can be harder than a 5-move path through obvious intermediates. Position concentration captures how "hidden" the valid moves are at each word. Together these produce a more accurate difficulty fingerprint than any single metric.

**Scoring formula (in `research/lib/difficultyScore.ts`):**
```
rawScore =
    (moves - 3) × 2.0                              path length contribution
  + avgPositionConcentration × 3.0                 concentration (0–3 pts)
  + clamp((avgBranching - 5) / 10, 0, 1) × 2.0    high branching = harder (0–2 pts)
  + clamp((7 - minBranching) / 7, 0, 1) × 1.0     low min = harder (0–1 pt)
```

**Position concentration:** fraction of a word's valid neighbors that come from its single busiest letter slot. A word with 20 total neighbors but 18 from one position has concentration = 0.9 — the player may waste time trying the other three positions.

**Tier thresholds (calibrated for ~12k-word set):**
- Easy: 1–6 (typically 4-move paths)
- Medium: 7–8 (typically 5-move paths)
- Hard: 9–10 (typically 6-move paths)

**Levers:** Adjust weights directly in `difficultyScore.ts`. After any change, run `scorePairs.ts` against the existing pairs to check tier distribution. The formula should produce a meaningful spread across tiers — if all pairs cluster in one tier, the weights are off.

---

## 8. Mathematical Pair Generation

**Decision:** Generate pairs mathematically from the word graph rather than relying solely on semantic (Datamuse) suggestions.

**Rationale:** Datamuse returns antonyms and associations, which is a useful quality signal but severely limits the pair pool. The 107-pair curated bank was essentially exhausted. Mathematical generation (BFS over all word pairs, filter by quality metrics) produces thousands of valid pairs covering all difficulty tiers, without requiring an external API or semantic relationship.

**Tradeoff:** Mathematically valid pairs may lack thematic connection (SANS→MINT has no obvious relationship). Semantic pairing (COLD→WARM, FIND→LOSE) feels more intentional. The editorial layer — hand-picking the best pairs from the pool for the daily schedule — is where semantic quality is restored.

**Pair pool source:** `games/ladder/data/pair-pool.txt`, generated by `buildPairPool.ts`. Contains pairs scored and tiered by difficulty.

**Levers:**
- `buildPairPool.ts --min-moves / --max-moves` controls which path lengths to include
- `--sample N` controls the search size
- `suggestWordPairs.ts` remains available for Datamuse-driven semantic suggestions

---

## 9. Feedback Collection

**Decision:** Collect feedback per-puzzle-set in a modal triggered only when pressing "New puzzle set," not inline during play.

**Rationale:** Inline feedback (👍👎 at the bottom of the board) interrupted gameplay and felt cluttered. Moving feedback to the "New set" transition moment means players have finished the context they're rating and aren't being asked mid-game. Skipping is always allowed — forced feedback degrades data quality.

**Current modal:** Three rows (Easy/Medium/Hard), each with optional 👍/👎. Skippable per-row or entirely.

**Supabase tables:** `puzzle_feedback` (one row per rated puzzle), `word_reports` (missing/bad word reports).

**Levers:** The modal component is `renderNewSetModal()` in `GameClient.tsx`. The per-tier rating format could be expanded (add a text field, add a "meh" option, etc.) without changing the Supabase schema.

---

## 10. Sharing Mechanic

**Decision:** Non-spoilery share card showing tier emoji + moves vs par.

**Rationale:** Players want to share results without spoiling the words for friends. Par-relative results ("+1 over par") convey performance without revealing the path. The format is scannable and social-media-friendly.

**Current format:**
```
Stepladder — June 2
🟢 Easy    ✓ 4 moves  (par 4)
🟡 Medium  ✓ 6 moves  (par 5, +1)
🔴 Hard    ✗  (par 6)
stepladder.app
```

**Levers:** `buildShareText()` in `GameClient.tsx`. The domain (`stepladder.app`) and emoji scheme are easily adjusted.

---

## 11. Persistence Architecture

**Decision:** Client-side only (`ssr: false`), keyed by puzzle set ID.

**Rationale:** The server generates a new random puzzle set on every request. If the client has a saved state from a previous set, restoring from localStorage after SSR causes a visible flash (server renders set A, client switches to set B). Disabling SSR on `GameClient` eliminates this entirely — the component only renders client-side, where localStorage is immediately available.

**Current state key:** `stepladder-set-state` in localStorage. Structure:
```typescript
{ setId: string, puzzles: Record<Tier, { moves, status, hintsUsed }> }
```
On mount: if `state.setId` matches the server-generated set → restore. Otherwise → fresh state.

**Long-term:** When daily mode is active, server and client always agree on the puzzle set (same date = same set). The flash problem disappears, SSR can be re-enabled, and state can be keyed by date instead of set ID.

**Levers:** `STATE_KEY` constant in `GameClient.tsx`. The matching logic is in the `useEffect` restore block at the top of the component.
