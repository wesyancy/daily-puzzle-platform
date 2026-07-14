'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitFeedback, submitWordReport, submitGameEvent, getDailyPercentile } from '@/app/actions';
import type { PuzzleSet, Tier, TieredPuzzle } from '@/lib/generatePuzzle';
import { getSessionId } from '@repo/analytics';
import { tierScore, calculateCumulativeScore } from '@/lib/calculateCumulativeScore';
import { TIERS, TIER_LABELS, TIER_EMOJI, TIER_NUMBER } from '@/components/stepladder/constants';
import { GameHeader } from '@/components/stepladder/GameHeader';
import { GameStatusArea } from '@/components/stepladder/GameStatusArea';
import { GameCardContainer } from '@/components/stepladder/GameCardContainer';
import { StepladderKeyboard } from '@/components/stepladder/StepladderKeyboard';
import { InstructionsModal } from '@/components/stepladder/InstructionsModal';
import { ResultModal } from '@/components/stepladder/ResultModal';
import { NewSetModal } from '@/components/stepladder/NewSetModal';
import { WordReportModal } from '@/components/stepladder/WordReportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type PuzzleStatus = 'not-started' | 'in-progress' | 'passed' | 'failed';

type PuzzleProgress = {
    moves: string[];
    status: PuzzleStatus;
    hintsUsed: number;
    /** The word the player was on when they last opened a hint. Used to ensure
     *  a hint is only charged once per word — opening again for the same word
     *  is free, even after a refresh. */
    hintWord: string | null;
};

type SetState = {
    setId: string;
    puzzles: Record<Tier, PuzzleProgress>;
};

type FeedbackRating = 'good' | 'bad';

type WordReportStage = 'idle' | 'missing' | 'bad';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_KEY = 'stepladder-set-state';
const PUZZLE_KEY = 'stepladder-puzzle-set';

const ADVANCE_DELAY_PASS = 3000;  // ms after solving before auto-advancing
const ADVANCE_DELAY_FAIL = 4000;  // ms after failing before auto-advancing

function freshProgress(start: string): PuzzleProgress {
    return { moves: [start], status: 'not-started', hintsUsed: 0, hintWord: null };
}

function freshState(setId: string, puzzleSet: PuzzleSet): SetState {
    return {
        setId,
        puzzles: {
            easy:   freshProgress(puzzleSet.easy.start),
            medium: freshProgress(puzzleSet.medium.start),
            hard:   freshProgress(puzzleSet.hard.start),
        },
    };
}

/**
 * Reads localStorage synchronously and returns the full saved game state.
 * Safe to call in useState lazy initializers because with ssr:false this
 * component never server-renders — window/localStorage always exist here.
 */
type StoredGame = {
    puzzleSet: PuzzleSet;
    state: SetState;
    activeTier: Tier;
    showSummary: boolean;
};

function loadStoredGame(fallbackSet: PuzzleSet): StoredGame {
    try {
        const savedSet = JSON.parse(localStorage.getItem(PUZZLE_KEY) ?? '') as PuzzleSet;
        if (savedSet?.id && savedSet?.easy && savedSet?.medium && savedSet?.hard) {
            const savedState = JSON.parse(localStorage.getItem(STATE_KEY) ?? '') as SetState;
            if (savedState?.setId === savedSet.id && savedState?.puzzles) {
                const allDone = TIERS.every(
                    (t) => savedState.puzzles[t]?.status === 'passed' || savedState.puzzles[t]?.status === 'failed',
                );
                const activeTier = allDone
                    ? 'easy'
                    : (TIERS.find(
                          (t) => savedState.puzzles[t]?.status === 'not-started' ||
                                 savedState.puzzles[t]?.status === 'in-progress',
                      ) ?? 'easy');
                return { puzzleSet: savedSet, state: savedState, activeTier, showSummary: allDone };
            }
        }
    } catch {}
    return {
        puzzleSet: fallbackSet,
        state: freshState(fallbackSet.id, fallbackSet),
        activeTier: 'easy',
        showSummary: false,
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameClient({ puzzleSet, isDailyMode }: { puzzleSet: PuzzleSet; isDailyMode: boolean }) {
    const router = useRouter();

    // ── State ─────────────────────────────────────────────────────────────────

    // All state is lazy-initialized from localStorage so refresh restores correctly.
    // The server-generated puzzleSet prop is only the fallback when no saved state exists.
    const [_stored] = useState<StoredGame>(() => loadStoredGame(puzzleSet));
    const [activePuzzleSet] = useState<PuzzleSet>(_stored.puzzleSet);
    const [state, setState] = useState<SetState>(_stored.state);
    const [activeTier, setActiveTier] = useState<Tier>(_stored.activeTier);
    const [showSummaryInit] = useState<boolean>(_stored.showSummary);
    const [hydrated, setHydrated] = useState(false);

    const [input, setInput] = useState('');
    const [message, setMessage] = useState('');

    // Modals
    const [showInstructions, setShowInstructions] = useState(false);
    const [showHints, setShowHints] = useState(false);
    const [showSummary, setShowSummary] = useState(showSummaryInit);
    const [showNewSetModal, setShowNewSetModal] = useState(false);
    const [showWordReportModal, setShowWordReportModal] = useState(false);

    // Per-tier feedback ratings collected in the "New set" modal
    const [newSetRatings, setNewSetRatings] = useState<Partial<Record<Tier, FeedbackRating>>>({});

    // Word report
    const [wordReportStage, setWordReportStage] = useState<WordReportStage>('idle');
    const [wordReportInput, setWordReportInput] = useState('');
    const [wordReportToast, setWordReportToast] = useState('');
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Solve animation
    const [solvedAnimating, setSolvedAnimating] = useState(false);
    const solvedAnimationFired = useRef<Set<Tier>>(new Set());

    // Result modal (shown immediately on pass/fail, auto-dismisses when advance fires)
    type ResultModal = { passed: boolean; movesTaken: number; shortestPath: number; score: number };
    const [resultModal, setResultModal] = useState<ResultModal | null>(null);

    // Hint tracking: derived from persisted progress — survives refresh correctly.
    // A hint charge only applies once per word; reopening for the same word is free.

    // Scroll + clipboard
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shareCopied, setShareCopied] = useState(false);

    // Percentile comparison — fetched when summary opens in daily mode.
    // null means "not yet fetched or insufficient data"; undefined means "not started".
    const [percentiles, setPercentiles] = useState<Partial<Record<Tier, number | null>>>({});

    // Flash animation: tracks the index of the most recently played word tile
    const [flashTileIndex, setFlashTileIndex] = useState(-1);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-advance timer
    const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Analytics: anonymous session ID (created once, persists in localStorage)
    const sessionIdRef = useRef<string>('');
    // Per-tier start timestamps — captured on first move, used for time_ms in puzzle_completed
    const tierStartTimeRef = useRef<Partial<Record<Tier, number>>>({});

    // ── One-time mount effect ─────────────────────────────────────────────────
    // State is already initialized from localStorage via lazy initializers above.
    // This effect only handles: instructions first-visit check, marking already-
    // completed tiers so their animations don't re-fire, and setting hydrated.

    useEffect(() => {
        if (!localStorage.getItem('stepladder-seen-instructions')) {
            setShowInstructions(true);
        }

        // Populate solvedAnimationFired from restored state so animations
        // don't re-trigger on completed tiers after a refresh.
        for (const t of TIERS) {
            if (state.puzzles[t]?.status === 'passed' || state.puzzles[t]?.status === 'failed') {
                solvedAnimationFired.current.add(t);
            }
        }

        // Initialize anonymous session ID from localStorage (created here if this is first visit).
        sessionIdRef.current = getSessionId();

        setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Persist on every change ───────────────────────────────────────────────

    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
            localStorage.setItem(PUZZLE_KEY, JSON.stringify(activePuzzleSet));
        } catch {}
    }, [hydrated, state, activePuzzleSet]);

    // ── Derived values for active puzzle ──────────────────────────────────────

    const activePuzzle: TieredPuzzle = activePuzzleSet[activeTier];
    const progress: PuzzleProgress = state.puzzles[activeTier];
    const moves = progress.moves;
    const currentWord = moves[moves.length - 1];
    const solved = currentWord === activePuzzle.target;
    const failed = progress.status === 'failed';
    // Move limiter disabled — atLimit always false. Re-enable by restoring moveCount check.
    const atLimit = false;
    // Blocks input when the tier outcome is already decided.
    const inputBlocked = solved || failed || atLimit;
    // Derived from persisted progress: true if the hint was already opened for the current word.
    const hintConsumedForWord = progress.hintWord === currentWord;
    const validNextWords = [...(activePuzzle.neighborGraph[currentWord] ?? [])].sort();

    // ── Auto-advance after pass/fail ──────────────────────────────────────────

    const advance = useCallback(() => {
        setResultModal(null);
        const nextTier = TIERS.find(
            (t) => state.puzzles[t].status === 'not-started' || state.puzzles[t].status === 'in-progress',
        );
        if (nextTier) {
            setActiveTier(nextTier);
            setInput('');
            setMessage('');
        } else {
            setShowSummary(true);
            // All three tiers done — fire set_completed with outcome summary.
            const sid = sessionIdRef.current;
            if (sid) {
                const tierResults = Object.fromEntries(
                    TIERS.map((t) => [t, state.puzzles[t].status]),
                );
                void submitGameEvent('stepladder', sid, 'set_completed', null, {
                    tier_results: tierResults,
                });
            }
        }
    }, [state.puzzles]);

    // Solve animation + result modal + auto-advance scheduling
    useEffect(() => {
        if (solved && !solvedAnimationFired.current.has(activeTier)) {
            solvedAnimationFired.current.add(activeTier);
            setSolvedAnimating(true);
            const movesTaken = state.puzzles[activeTier].moves.length - 1;
            const shortestPath = activePuzzleSet[activeTier].optimalPath.length - 1;
            const score = tierScore('passed', movesTaken, shortestPath);
            setResultModal({ passed: true, movesTaken, shortestPath, score });
            advanceTimerRef.current = setTimeout(() => {
                setSolvedAnimating(false);
                advance();
            }, ADVANCE_DELAY_PASS);
        }
    }, [solved, activeTier, advance, state.puzzles, activePuzzleSet]);

    // Fail result modal + auto-advance scheduling
    useEffect(() => {
        if (failed && !solvedAnimationFired.current.has(activeTier)) {
            solvedAnimationFired.current.add(activeTier);
            const shortestPath = activePuzzleSet[activeTier].optimalPath.length - 1;
            setResultModal({ passed: false, movesTaken: activePuzzle.moveLimit, shortestPath, score: 0 });
            advanceTimerRef.current = setTimeout(() => {
                advance();
            }, ADVANCE_DELAY_FAIL);
        }
    }, [failed, activeTier, advance, activePuzzleSet, activePuzzle.moveLimit]);

    // Cleanup timers
    useEffect(() => {
        return () => {
            if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        };
    }, []);

    // Auto-scroll word chain — smooth so the new tile glides into view
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [moves]);

    // Fetch same-day percentile for each solved tier when summary opens in daily mode.
    // Requires Phase 3's game_events data in production — returns null if sample < 20.
    useEffect(() => {
        if (!showSummary || !isDailyMode) return;
        const dateStr = new Date().toISOString().split('T')[0]; // UTC date
        void Promise.all(
            TIERS.map(async (tier) => {
                const p = state.puzzles[tier];
                if (p.status !== 'passed') return [tier, null] as const;
                const pct = await getDailyPercentile(tier, dateStr, p.moves.length - 1);
                return [tier, pct] as const;
            }),
        ).then((results) => setPercentiles(Object.fromEntries(results)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSummary]);

    // ── State helpers ─────────────────────────────────────────────────────────

    function updateProgress(tier: Tier, update: Partial<PuzzleProgress>) {
        setState((prev) => ({
            ...prev,
            puzzles: {
                ...prev.puzzles,
                [tier]: { ...prev.puzzles[tier], ...update },
            },
        }));
    }

    // ── Instructions ──────────────────────────────────────────────────────────

    function closeInstructions() {
        localStorage.setItem('stepladder-seen-instructions', '1');
        setShowInstructions(false);
    }

    // ── Gameplay ──────────────────────────────────────────────────────────────

    function letterDiff(a: string, b: string): number {
        if (a.length !== b.length) return Infinity;
        let diffs = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
        return diffs;
    }

    function submitMove(word?: string) {
        if (solved || failed) return;
        const guess = (word ?? input).trim().toUpperCase();
        if (!guess) return;

        const validNeighbors = activePuzzle.neighborGraph[currentWord] ?? [];
        if (!validNeighbors.includes(guess)) {
            const diff = letterDiff(currentWord, guess);
            if (diff === 0) {
                setMessage("That's the word you're already on.");
            } else if (diff !== 1) {
                setMessage(`One-letter rule: that changes ${diff === Infinity ? 'the wrong number of' : diff} letters.`);
            } else {
                setMessage('Not in the word list.');
            }
            return;
        }

        const nextMoves = [...moves, guess];
        const nowSolved = guess === activePuzzle.target;
        const isFirstMove = progress.status === 'not-started';
        const now = Date.now();

        // Capture tier start time on first move so puzzle_completed can include time_ms.
        if (isFirstMove) {
            tierStartTimeRef.current[activeTier] = now;
        }

        // Move limiter disabled — puzzles can only be completed by solving them.
        // Re-enable by restoring the nowFailed / moveLimit check here.
        const newStatus: PuzzleStatus = nowSolved ? 'passed' : 'in-progress';

        updateProgress(activeTier, { moves: nextMoves, status: newStatus });
        setInput('');
        setShowHints(false);

        // Fire analytics events fire-and-forget — never block the submit flow.
        const sid = sessionIdRef.current;
        if (sid) {
            if (isFirstMove) {
                void submitGameEvent('stepladder', sid, 'puzzle_started', activeTier, {
                    start: activePuzzle.start,
                    target: activePuzzle.target,
                    optimal: activePuzzle.optimalPath.length - 1,
                });
            }
            void submitGameEvent('stepladder', sid, 'guess_submitted', activeTier, {
                word: guess,
                move_number: nextMoves.length - 1,
            });
            if (nowSolved) {
                const startTime = tierStartTimeRef.current[activeTier];
                void submitGameEvent('stepladder', sid, 'puzzle_completed', activeTier, {
                    solved: true,
                    moves_taken: nextMoves.length - 1,
                    optimal: activePuzzle.optimalPath.length - 1,
                    hints_used: progress.hintsUsed,
                    time_ms: startTime ? now - startTime : null,
                });
            }
        }

        // Two-frame approach: let the new tile render first, then add the animation
        // class in the next event loop tick. This mirrors how animate-pop works on
        // the solved tile (via useEffect) and ensures CSS animation fires reliably.
        const newIdx = nextMoves.length - 1;
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setTimeout(() => {
            setFlashTileIndex(newIdx);
            flashTimerRef.current = setTimeout(() => setFlashTileIndex(-1), 500);
        }, 0);

        if (!nowSolved) {
            setMessage('');
        }
    }

    // Letter append/remove — shared by virtual keyboard and global keydown listener.
    function appendLetter(ch: string) {
        if (input.length >= activePuzzle.start.length) return;
        setInput((prev) => prev + ch);
    }

    function backspace() {
        setInput((prev) => prev.slice(0, -1));
    }

    // Called by both StepladderKeyboard ENTER and the global keydown handler.
    function handleKeyPress(key: string) {
        if (key === 'ENTER') { submitMove(); return; }
        if (key === 'BACKSPACE') { backspace(); return; }
        if (/^[A-Z]$/.test(key)) { appendLetter(key); return; }
    }

    // Gate: block all game keystrokes while any modal is open.
    const anyModalOpen = showInstructions || showHints || showNewSetModal || showWordReportModal;

    // Global physical keyboard listener — uses a ref so the closure is never stale.
    const keydownHandlerRef = useRef<((e: KeyboardEvent) => void) | undefined>(undefined);
    keydownHandlerRef.current = (e: KeyboardEvent) => {
        if (anyModalOpen || inputBlocked) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'Enter') { submitMove(); return; }
        if (e.key === 'Backspace') { e.preventDefault(); backspace(); return; }
        if (/^[a-zA-Z]$/.test(e.key)) { appendLetter(e.key.toUpperCase()); return; }
    };

    useEffect(() => {
        // Register once; the ref keeps the handler current on every render.
        const handler = (e: KeyboardEvent) => keydownHandlerRef.current?.(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function pickHint(word: string) {
        setInput(word);
        setShowHints(false);
    }

    // ── Word report ───────────────────────────────────────────────────────────

    function showToast(msg: string) {
        setWordReportToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setWordReportToast(''), 2500);
    }

    function closeWordReportModal() {
        setShowWordReportModal(false);
        setWordReportStage('idle');
        setWordReportInput('');
    }

    async function handleMissingWordSubmit() {
        const word = wordReportInput.trim().toUpperCase();
        if (!word) return;
        await submitWordReport({
            word,
            kind: 'missing',
            start: activePuzzle.start,
            target: activePuzzle.target,
            timestamp: new Date().toISOString(),
        });
        closeWordReportModal();
        showToast(`"${word}" submitted — thanks!`);
    }

    async function handleBadWordSubmit() {
        const word = wordReportInput.trim().toUpperCase();
        if (!word) return;
        await submitWordReport({
            word,
            kind: 'bad',
            start: activePuzzle.start,
            target: activePuzzle.target,
            timestamp: new Date().toISOString(),
        });
        closeWordReportModal();
        showToast(`"${word}" flagged — thanks!`);
    }

    // ── New puzzle set flow ───────────────────────────────────────────────────

    function handleNewSet() {
        setNewSetRatings({});
        setShowNewSetModal(true);
    }

    async function submitNewSetFeedback(skip: boolean) {
        setShowNewSetModal(false);

        if (!skip) {
            const tierList = TIERS.filter((t) => newSetRatings[t]);
            await Promise.all(
                tierList.map((t) =>
                    submitFeedback({
                        start: activePuzzleSet[t].start,
                        target: activePuzzleSet[t].target,
                        optimalPathLength: activePuzzleSet[t].optimalPath.length - 1,
                        movesTaken: state.puzzles[t].moves.length - 1,
                        solved: state.puzzles[t].status === 'passed',
                        rating: newSetRatings[t]!,
                        reason: 'set-feedback',
                        tier: t,
                        timestamp: new Date().toISOString(),
                    }),
                ),
            );
        }

        try {
            localStorage.removeItem(STATE_KEY);
            localStorage.removeItem(PUZZLE_KEY);
        } catch {}
        router.refresh();
    }

    // ── Share ─────────────────────────────────────────────────────────────────

    function buildShareText(): string {
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const lines = [`Stepladder — ${today}  ${summaryScore.total}/300`];
        for (const tier of TIERS) {
            const p = state.puzzles[tier];
            const puzzle = activePuzzleSet[tier];
            const shortest = puzzle.optimalPath.length - 1;
            const emoji = TIER_EMOJI[tier];
            const pts = summaryScore.byTier[tier];
            if (p.status === 'passed') {
                const taken = p.moves.length - 1;
                const over = taken - shortest;
                const resultStr = over === 0 ? `${taken}/${shortest}` : `${taken}/${shortest} +${over}`;
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} ✓ ${resultStr}  (${pts} pts)`);
            } else if (p.status === 'failed') {
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} ✗  (shortest: ${shortest})`);
            } else {
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} —`);
            }
        }
        lines.push('stepladder.app');
        return lines.join('\n');
    }

    async function handleShare() {
        const text = buildShareText();
        try {
            await navigator.clipboard.writeText(text);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch {
            // Fallback: select a textarea
        }
    }

    // ── Summary results ───────────────────────────────────────────────────────

    function shortestDisplay(tier: Tier): string {
        const p = state.puzzles[tier];
        const shortest = activePuzzleSet[tier].optimalPath.length - 1;
        if (p.status === 'passed') {
            const taken = p.moves.length - 1;
            const over = taken - shortest;
            if (over === 0) return `${taken} moves  (shortest: ${shortest})`;
            if (over > 0) return `${taken} moves  (shortest: ${shortest}, +${over})`;
            return `${taken} moves  (shortest: ${shortest}, ${over})`;
        }
        if (p.status === 'failed') return `failed  (shortest: ${shortest})`;
        return '—';
    }

    // ── Summary screen ────────────────────────────────────────────────────────

    // Compute once — used in both summary JSX and buildShareText.
    const summaryScore = calculateCumulativeScore(
        Object.fromEntries(
            TIERS.map((t) => [t, {
                status: state.puzzles[t].status,
                movesTaken: state.puzzles[t].moves.length - 1,
                optimal: activePuzzleSet[t].optimalPath.length - 1,
            }]),
        ) as Parameters<typeof calculateCumulativeScore>[0],
    );

    if (showSummary) {
        return (
            <>
                {showNewSetModal && (
                    <NewSetModal
                        puzzleStatuses={{ easy: state.puzzles.easy.status, medium: state.puzzles.medium.status, hard: state.puzzles.hard.status }}
                        ratings={newSetRatings}
                        onRatingChange={(tier, rating) => setNewSetRatings((prev) => ({ ...prev, [tier]: rating }))}
                        onSubmit={submitNewSetFeedback}
                        onClose={() => setShowNewSetModal(false)}
                    />
                )}
                {showWordReportModal && (
                    <WordReportModal
                        stage={wordReportStage}
                        onStageChange={setWordReportStage}
                        input={wordReportInput}
                        onInputChange={setWordReportInput}
                        onClose={closeWordReportModal}
                        onSubmitMissing={handleMissingWordSubmit}
                        onSubmitBad={handleBadWordSubmit}
                        maxLength={activePuzzle.start.length}
                    />
                )}

                {/* h-[calc(100dvh-3rem)] subtracts the NavBar's h-12 from the mobile viewport budget */}
                <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-3rem)]">
                    <div className="flex-none pt-6 sm:pt-8 pb-4">
                        <GameHeader onHowToPlay={() => setShowInstructions(true)} />
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-6 py-4">
                        {/* Score summary */}
                        {(() => {
                            const solvedPercentiles = TIERS
                                .filter((t) => state.puzzles[t].status === 'passed' && percentiles[t] != null)
                                .map((t) => percentiles[t] as number);
                            const avgPercentile = solvedPercentiles.length > 0
                                ? Math.round(solvedPercentiles.reduce((a, b) => a + b, 0) / solvedPercentiles.length)
                                : null;
                            return (
                                <div className="text-center flex flex-col gap-1">
                                    <p className="text-sm opacity-50 uppercase tracking-wide">Today&apos;s set</p>
                                    <p className="text-5xl font-bold">{summaryScore.total}</p>
                                    <p className="text-sm opacity-40">out of 300 pts</p>
                                    {/* Percentile — only in daily mode, only when sample is large enough */}
                                    {isDailyMode && avgPercentile !== null && (
                                        <p className="text-sm opacity-70 mt-1">
                                            You beat {avgPercentile}% of today&apos;s players
                                        </p>
                                    )}
                                </div>
                            );
                        })()}

                        <div className="flex flex-col gap-3 border rounded-xl p-5">
                            {TIERS.map((tier) => (
                                <div key={tier} className="flex items-center gap-3">
                                    <span className="text-xl w-7 text-center">{TIER_EMOJI[tier]}</span>
                                    <span className="font-semibold w-16">{TIER_LABELS[tier]}</span>
                                    <span className="text-sm opacity-70 flex-1">{shortestDisplay(tier)}</span>
                                    {/* Per-tier score shown for completed tiers */}
                                    {(state.puzzles[tier].status === 'passed' || state.puzzles[tier].status === 'failed') && (
                                        <span className="text-sm font-mono opacity-60">
                                            {summaryScore.byTier[tier]} pts
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            {/* Hidden in daily mode — one puzzle set per day, no re-rolls. */}
                            {!isDailyMode && (
                                <button
                                    onClick={handleNewSet}
                                    className="border-2 border-yellow-400 rounded px-4 py-3 text-sm font-semibold w-full sm:flex-1">
                                    ↻ New puzzle set
                                </button>
                            )}
                            <button
                                onClick={handleShare}
                                className="border-2 border-blue-400 rounded px-4 py-3 text-sm font-semibold w-full sm:flex-1">
                                {shareCopied ? '✓ Copied!' : '⎘ Share'}
                            </button>
                        </div>

                        <button
                            onClick={() => setShowWordReportModal(true)}
                            className="border-2 border-orange-400 rounded px-3 py-2 text-sm w-full sm:w-auto sm:self-center opacity-60 hover:opacity-100 transition-opacity">
                            Missing/Report Word
                        </button>
                    </div>
                </main>

                {showInstructions && <InstructionsModal onClose={closeInstructions} />}
            </>
        );
    }

    // ── Active puzzle screen ──────────────────────────────────────────────────

    return (
        <>
            {showInstructions && <InstructionsModal onClose={closeInstructions} />}
            {showNewSetModal && (
                <NewSetModal
                    puzzleStatuses={{ easy: state.puzzles.easy.status, medium: state.puzzles.medium.status, hard: state.puzzles.hard.status }}
                    ratings={newSetRatings}
                    onRatingChange={(tier, rating) => setNewSetRatings((prev) => ({ ...prev, [tier]: rating }))}
                    onSubmit={submitNewSetFeedback}
                    onClose={() => setShowNewSetModal(false)}
                />
            )}
            {showWordReportModal && (
                <WordReportModal
                    stage={wordReportStage}
                    onStageChange={setWordReportStage}
                    input={wordReportInput}
                    onInputChange={setWordReportInput}
                    onClose={closeWordReportModal}
                    onSubmitMissing={handleMissingWordSubmit}
                    onSubmitBad={handleBadWordSubmit}
                    maxLength={activePuzzle.start.length}
                />
            )}
            {resultModal && (
                <ResultModal
                    passed={resultModal.passed}
                    movesTaken={resultModal.movesTaken}
                    shortestPath={resultModal.shortestPath}
                    score={resultModal.score}
                    onNext={() => {
                        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
                        advance();
                    }}
                />
            )}

            {/* ── Hints overlay — only closes via X ── */}
            {showHints && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div
                        className="bg-[var(--background)] border rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <p className="font-semibold">
                                    Valid moves from <span className="font-mono">{currentWord}</span>
                                </p>
                                {/* <p className="text-xs opacity-40 uppercase tracking-wide">Alpha — research only</p> */}
                            </div>
                            <button
                                onClick={() => setShowHints(false)}
                                className="opacity-50 hover:opacity-100 text-lg leading-none px-1">
                                ✕
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {validNextWords.map((word) => (
                                <button
                                    key={word}
                                    onClick={() => pickHint(word)}
                                    className="border rounded px-3 py-1.5 text-sm font-mono hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                    {word}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs opacity-40">Tap a word to fill the input, then Submit to play it.</p>
                    </div>
                </div>
            )}

            {/* h-[calc(100dvh-3rem)] subtracts the NavBar's h-12 from the mobile viewport budget */}
            <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-3rem)]">

                {/* ── Top: always visible ── */}
                <div className="flex-none pt-6 sm:pt-8 pb-4 flex flex-col gap-4">
                    <GameHeader onHowToPlay={() => setShowInstructions(true)} />
                    <GameStatusArea
                        start={activePuzzle.start}
                        target={activePuzzle.target}
                        activeTier={activeTier}
                        optimalMoves={activePuzzle.optimalPath.length - 1}
                        message={message}
                    />
                </div>

                {/* ── Middle: scrollable word chain + current guess tile ── */}
                <GameCardContainer
                    scrollRef={scrollAreaRef}
                    moves={moves}
                    flashTileIndex={flashTileIndex}
                    solved={solved}
                    failed={failed}
                    solvedAnimating={solvedAnimating}
                    inputBlocked={inputBlocked}
                    input={input}
                />

                {/* ── Bottom: keyboard + secondary controls ── */}
                <div className="flex-none pt-2 pb-4 flex flex-col gap-2">

                    {wordReportToast && (
                        <p className="text-sm opacity-70 text-center">{wordReportToast}</p>
                    )}

                    {!inputBlocked && (
                        <>
                            {/* Hint button — sits above the keyboard */}
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        if (!hintConsumedForWord) {
                                            updateProgress(activeTier, {
                                                hintsUsed: Math.min(progress.hintsUsed + 1, 2),
                                                hintWord: currentWord,
                                            });
                                            // Only fire when a charge actually applies — reopening for same word is free.
                                            const sid = sessionIdRef.current;
                                            if (sid) {
                                                void submitGameEvent('stepladder', sid, 'hint_used', activeTier, {
                                                    at_word: currentWord,
                                                    hint_number: progress.hintsUsed + 1,
                                                });
                                            }
                                        }
                                        setShowHints((v) => !v);
                                    }}
                                    disabled={progress.hintsUsed >= 2 && !hintConsumedForWord}
                                    className="border rounded px-4 py-1.5 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed">
                                    Hint ×{Math.max(0, 2 - progress.hintsUsed)}
                                </button>
                            </div>

                            {/* Virtual keyboard — handles both letter input and submit (ENTER) */}
                            <StepladderKeyboard
                                onKeyPress={handleKeyPress}
                                disabled={inputBlocked}
                            />
                        </>
                    )}

                    {/* New puzzle set + Word report; new-set hidden in daily mode. */}
                    <div className="flex gap-2 items-center justify-center mt-1">
                        {!isDailyMode && (
                            <button
                                onClick={handleNewSet}
                                className="border-2 border-yellow-400 rounded px-3 py-2 text-sm">
                                ↻ New puzzle set
                            </button>
                        )}
                        <button
                            onClick={() => setShowWordReportModal(true)}
                            className="border-2 border-orange-400 rounded px-3 py-2 text-sm opacity-60 hover:opacity-100 transition-opacity">
                            Missing/Report Word
                        </button>
                    </div>
                </div>
            </main>
        </>
    );

}
