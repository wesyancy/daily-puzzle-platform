# Word Library Review Process

Players can flag words in-game using the Dictionary feedback buttons:
- **+ Word missing from game** — they tried a word and it wasn't accepted
- **− Word shouldn't be in game** — they think a word is inappropriate

These submissions land in the `word_reports` Supabase table. This doc explains how to review and act on them.

---

## Quick reference

| Task | Command |
|---|---|
| Read-only report (no changes) | `pnpm --filter @repo/ladder exec npx tsx research/scripts/reviewWordReports.ts` |
| Interactive approval (adds words to game) | `pnpm --filter @repo/ladder exec npx tsx research/scripts/approveWordReports.ts` |
| Re-validate puzzle pairs after changes | `pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts` |

All commands run from the repo root.

---

## Full workflow

### 1. Check what's been submitted (optional)

Run the read-only review script for a summary without making any changes:

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/reviewWordReports.ts
```

This prints each submitted word grouped by outcome:
- **Eligible** — passes all gates, ready to add
- **Already in game** — word works, player may have been confused
- **Not in common words** — real word, not currently in the dictionary
- **Profanity** — already blocked
- **Wrong length** — not 4–5 letters

---

### 2. Approve or deny submissions interactively

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/approveWordReports.ts
```

The script will:
- **Auto-skip** profanity, wrong-length words, and words already in the game
- **Prompt you** for every other word:

```
── Word 3 of 21 ────────────────────────────────────────
LARD   [2 reports · puzzles: HART→LANE, LEND→EARS]
       Gate: not in common words list
Add to game? [y/n]:
```

Type `y` to approve, anything else to deny.

For flagged-as-bad words, you'll also be asked:
```
GUNK   [1 report · puzzle: BUNK→FUNK]
Block as puzzle start/target? [y/n]:
```

---

### 3. What happens after approvals

**Approved missing words:**
1. Added (lowercase) to `packages/dictionary/src/data/commonWords.txt`
2. `buildWordList.ts` runs automatically to rebuild `puzzle-words.txt`
3. If any word wasn't in the base dictionary (`enable1.txt`), it's added directly to `puzzle-words.txt` with a note

**Approved bad words:**
1. Added (uppercase) to `games/ladder/data/blocked-words.txt`

---

### 4. Re-validate puzzle pairs

Adding new words to the dictionary can change branching factors on existing puzzle paths. After a word approval session, re-run the pair validator to make sure all 119 curated pairs still meet quality thresholds:

```bash
pnpm --filter @repo/ladder exec npx tsx research/scripts/validateWordPairs.ts
```

This overwrites `word-pairs.txt` with only the pairs that still pass. Check the output — if good pairs dropped out, it's worth investigating why.

---

## What the gates mean

| Gate | Meaning |
|---|---|
| Wrong length | Not 4 or 5 letters — game only uses these lengths |
| Profanity | In the hardcoded banned words list (`packages/dictionary/src/filters/bannedWords.ts`) |
| Already in game | Word is in `puzzle-words.txt` — it should already work as a valid move |
| Not in common words | Word isn't in `commonWords.txt` — use your judgement, approve if it's a real everyday word |

---

## Files involved

| File | Purpose |
|---|---|
| `packages/dictionary/src/data/commonWords.txt` | Allowlist — only words here make it into the game |
| `packages/dictionary/src/data/puzzle-words.txt` | Generated word list — rebuilt by `buildWordList.ts` |
| `packages/dictionary/src/filters/bannedWords.ts` | Hardcoded profanity list |
| `games/ladder/data/blocked-words.txt` | Words never used as puzzle start/target |
| `games/ladder/data/blocked-pairs.txt` | Specific pairs never used as puzzles |
