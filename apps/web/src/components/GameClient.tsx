'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitFeedback, submitWordReport, submitGameEvent } from '@/app/actions';
import type { PuzzleSet, Tier, TieredPuzzle } from '@/lib/generatePuzzle';
import { getSessionId } from '@repo/analytics';
import { StepladderKeyboard } from '@/components/stepladder/StepladderKeyboard';

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
const TIERS: Tier[] = ['easy', 'medium', 'hard'];
const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const TIER_EMOJI: Record<Tier, string> = { easy: '🟢', medium: '🟡', hard: '🔴' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3 };

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
    const [instructionsPage, setInstructionsPage] = useState<1 | 2 | 3>(1);
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
    type ResultModal = { passed: boolean; movesTaken: number; shortestPath: number };
    const [resultModal, setResultModal] = useState<ResultModal | null>(null);

    // Hint tracking: derived from persisted progress — survives refresh correctly.
    // A hint charge only applies once per word; reopening for the same word is free.

    // Scroll + clipboard
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shareCopied, setShareCopied] = useState(false);

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
            setInstructionsPage(1);
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
            setResultModal({ passed: true, movesTaken, shortestPath });
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
            setResultModal({ passed: false, movesTaken: activePuzzle.moveLimit, shortestPath });
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

    // Auto-scroll word chain
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [moves]);

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

    function handleWordReportKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') handleMissingWordSubmit();
        if (e.key === 'Escape') closeWordReportModal();
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
        const lines = [`Stepladder — ${today}`];
        for (const tier of TIERS) {
            const p = state.puzzles[tier];
            const puzzle = activePuzzleSet[tier];
            const shortest = puzzle.optimalPath.length - 1;
            const emoji = TIER_EMOJI[tier];
            if (p.status === 'passed') {
                const taken = p.moves.length - 1;
                const over = taken - shortest;
                const resultStr = over === 0 ? `${taken}/${shortest}` : over > 0 ? `${taken}/${shortest} +${over}` : `${taken}/${shortest} ${over}`;
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} ✓ ${resultStr}`);
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

    if (showSummary) {
        return (
            <>
                {showNewSetModal && renderNewSetModal()}
                {showWordReportModal && renderWordReportModal()}

                {/* h-[calc(100dvh-3rem)] subtracts the NavBar's h-12 from the mobile viewport budget */}
                <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-[calc(100dvh-3rem)] sm:h-auto sm:min-h-screen">
                    <div className="flex-none pt-6 sm:pt-8 pb-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <h1 className="text-4xl font-bold">Stepladder</h1>
                                <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setInstructionsPage(1); setShowInstructions(true); }}
                                    className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity">
                                    How to Play
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center gap-6 py-4">
                        <p className="text-sm opacity-50 uppercase tracking-wide text-center">Today&apos;s set</p>

                        <div className="flex flex-col gap-3 border rounded-xl p-5">
                            {TIERS.map((tier) => (
                                <div key={tier} className="flex items-center gap-3">
                                    <span className="text-xl w-7 text-center">{TIER_EMOJI[tier]}</span>
                                    <span className="font-semibold w-16">{TIER_LABELS[tier]}</span>
                                    <span className="text-sm opacity-70">{shortestDisplay(tier)}</span>
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

                {showInstructions && renderInstructionsModal()}
            </>
        );
    }

    // ── Active puzzle screen ──────────────────────────────────────────────────

    return (
        <>
            {showInstructions && renderInstructionsModal()}
            {showNewSetModal && renderNewSetModal()}
            {showWordReportModal && renderWordReportModal()}
            {resultModal && renderResultModal(resultModal)}

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
            <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-[calc(100dvh-3rem)] sm:h-auto sm:min-h-screen">

                {/* ── Top: always visible ── */}
                <div className="flex-none pt-6 sm:pt-8 pb-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <h1 className="text-4xl font-bold">Stepladder</h1>
                            <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { setInstructionsPage(1); setShowInstructions(true); }}
                                className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
                                title="How to play">
                                How to Play
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs uppercase tracking-widest opacity-40">Start</span>
                            <span className="text-4xl font-mono font-semibold">{activePuzzle.start}</span>
                        </div>
                        <span className="text-lg opacity-30">→</span>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs uppercase tracking-widest opacity-40">Target</span>
                            <span className="text-4xl font-mono font-semibold">{activePuzzle.target}</span>
                        </div>
                    </div>

                    {/* Status area — fixed below start/target, does not scroll */}
                    <div className="flex flex-col gap-0.5 text-center">
                        <span className="text-xs uppercase tracking-wide opacity-50">
                            {TIER_EMOJI[activeTier]} Puzzle {TIER_NUMBER[activeTier]} of 3 · {TIER_LABELS[activeTier]}
                        </span>
                        <span className="text-sm opacity-60">
                            Shortest path: {activePuzzle.optimalPath.length - 1} moves
                        </span>
                        {message && (
                            <p className="text-sm text-red-500 dark:text-red-400 mt-1">{message}</p>
                        )}
                    </div>

                </div>

                {/* ── Middle: scrollable word chain + current guess tile ── */}
                <div
                    ref={scrollAreaRef}
                    className="flex-1 overflow-y-auto flex flex-col gap-2 pb-2 sm:flex-none sm:max-h-[35vh]">
                    {moves.map((move, index) => {
                        const isLast = index === moves.length - 1;
                        const isSolvedTile = isLast && solved;
                        const isFailedTile = isLast && failed;
                        const isFlashing = index === flashTileIndex && !isSolvedTile;
                        return (
                            <div
                                key={index}
                                className={[
                                    'border-2 rounded px-4 py-2 text-lg font-mono transition-colors duration-300',
                                    isSolvedTile
                                        ? 'border-green-500 text-green-600 dark:text-green-400'
                                        : isFailedTile
                                        ? 'border-red-500 text-red-600 dark:text-red-400'
                                        : isFlashing
                                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/40 animate-word-pop shadow-md shadow-blue-200 dark:shadow-blue-900'
                                        : 'border-blue-500',
                                    isSolvedTile && solvedAnimating ? 'animate-pop' : '',
                                ].join(' ')}>
                                {move}
                                {isSolvedTile && <span className="ml-2 text-base">✓</span>}
                                {isFailedTile && <span className="ml-2 text-base">✗</span>}
                            </div>
                        );
                    })}

                    {/* Current guess tile — dashed border, lives below the submitted chain */}
                    {!inputBlocked && (
                        <div className="border-2 border-dashed border-blue-400 rounded px-4 py-2 text-lg font-mono min-h-[2.75rem] text-blue-500 dark:text-blue-400">
                            {input.toUpperCase() || <span className="opacity-0">·</span>}
                        </div>
                    )}
                </div>

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

    // ── Modal renderers (defined as functions to avoid early return issues) ───

    function renderInstructionsModal() {
        const dots = (
            <div className="flex items-center justify-center gap-1.5">
                {([1, 2, 3] as const).map((n) => (
                    <button
                        key={n}
                        onClick={() => setInstructionsPage(n)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${instructionsPage === n ? 'bg-current opacity-70 w-3' : 'bg-current opacity-20'}`}
                    />
                ))}
            </div>
        );

        const pages = {
            1: (
                <>
                    <div className="flex items-start justify-between">
                        <h2 className="text-lg font-bold">How to Play</h2>
                        <button onClick={closeInstructions} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
                    </div>
                    <p className="text-sm opacity-70">
                        Get from the <span className="font-semibold opacity-100">start</span> word to the <span className="font-semibold opacity-100">target</span> word — one letter change at a time.
                    </p>
                    <div className="flex flex-col gap-1 p-4 rounded-xl border font-mono text-sm">
                        <span className="opacity-40 text-xs mb-1 font-sans">COLD → WARM</span>
                        <span>COLD</span>
                        <span className="opacity-40 text-xs font-sans">change L → R</span>
                        <span>CORD</span>
                        <span className="opacity-40 text-xs font-sans">change C → W</span>
                        <span>WORD</span>
                        <span className="opacity-40 text-xs font-sans">change O → A</span>
                        <span>WARD</span>
                        <span className="opacity-40 text-xs font-sans">change D → M</span>
                        <span className="text-green-600 dark:text-green-400">WARM ✓</span>
                    </div>
                    {dots}
                    <button onClick={() => setInstructionsPage(2)} className="border rounded px-4 py-2 text-sm font-semibold w-full">
                        Next →
                    </button>
                </>
            ),
            2: (
                <>
                    <div className="flex items-start justify-between">
                        <h2 className="text-lg font-bold">The Rules</h2>
                        <button onClick={closeInstructions} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
                    </div>
                    <div className="flex flex-col gap-3 text-sm">
                        <div className="flex gap-3">
                            <span className="text-green-500 font-bold mt-0.5">①</span>
                            <p className="opacity-70">Change <span className="font-semibold opacity-100">exactly one letter</span> per move — any position, any letter.</p>
                        </div>
                        <div className="flex gap-3">
                            <span className="text-green-500 font-bold mt-0.5">②</span>
                            <p className="opacity-70">The result must be a <span className="font-semibold opacity-100">real word</span>.</p>
                        </div>
                        <div className="flex gap-3">
                            <span className="text-green-500 font-bold mt-0.5">③</span>
                            <p className="opacity-70">Fewer moves is better — try to match the <span className="font-semibold opacity-100">shortest possible path</span>.</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 p-3 rounded-xl border text-sm font-mono">
                        <div className="flex items-center gap-2"><span className="text-green-500">✓</span><span>COLD → CORD</span><span className="font-sans text-xs opacity-40">(L→R, one change)</span></div>
                        <div className="flex items-center gap-2"><span className="text-red-500">✗</span><span>COLD → COAT</span><span className="font-sans text-xs opacity-40">(two changes)</span></div>
                        <div className="flex items-center gap-2"><span className="text-red-500">✗</span><span>COLD → CLOD</span><span className="font-sans text-xs opacity-40">(rearranged)</span></div>
                    </div>
                    {dots}
                    <div className="flex gap-3">
                        <button onClick={() => setInstructionsPage(1)} className="border rounded px-4 py-2 text-sm w-full opacity-60 hover:opacity-100">← Back</button>
                        <button onClick={() => setInstructionsPage(3)} className="border rounded px-4 py-2 text-sm font-semibold w-full">Next →</button>
                    </div>
                </>
            ),
            3: (
                <>
                    <div className="flex items-start justify-between">
                        <h2 className="text-lg font-bold">Daily Set</h2>
                        <button onClick={closeInstructions} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
                    </div>
                    <p className="text-sm opacity-70">Each day you get <span className="font-semibold opacity-100">three puzzles</span>, getting harder:</p>
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🟢</span>
                            <div>
                                <p className="text-sm font-semibold">Easy</p>
                                <p className="text-xs opacity-50">4-move shortest path</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🟡</span>
                            <div>
                                <p className="text-sm font-semibold">Medium</p>
                                <p className="text-xs opacity-50">5-move shortest path</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🔴</span>
                            <div>
                                <p className="text-sm font-semibold">Hard</p>
                                <p className="text-xs opacity-50">6+ move shortest path</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm opacity-60">Share your results after finishing all three. You can&apos;t do better than the shortest path — but you can match it.</p>
                    {dots}
                    <div className="flex gap-3">
                        <button onClick={() => setInstructionsPage(2)} className="border rounded px-4 py-2 text-sm w-full opacity-60 hover:opacity-100">← Back</button>
                        <button onClick={closeInstructions} className="border-2 border-green-500 rounded px-4 py-2 text-sm font-semibold w-full">Let&apos;s play →</button>
                    </div>
                </>
            ),
        };

        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={closeInstructions}>
                <div
                    className="bg-[var(--background)] border rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-5"
                    onClick={(e) => e.stopPropagation()}>
                    {pages[instructionsPage]}
                </div>
            </div>
        );
    }

    function renderResultModal(modal: { passed: boolean; movesTaken: number; shortestPath: number }) {
        const over = modal.movesTaken - modal.shortestPath;
        const resultLine = modal.passed
            ? over === 0
                ? `${modal.movesTaken} moves — matched the shortest path!`
                : `${modal.movesTaken} moves (shortest path: ${modal.shortestPath}, +${over})`
            : `Shortest path: ${modal.shortestPath} moves`;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="bg-[var(--background)] border rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5">
                    <span className={`text-5xl ${modal.passed ? 'text-green-500' : 'text-red-500'}`}>
                        {modal.passed ? '✓' : '✗'}
                    </span>
                    <div className="text-center flex flex-col gap-1">
                        <p className="text-lg font-bold">{modal.passed ? 'Solved!' : 'Out of moves'}</p>
                        <p className="text-sm opacity-60">{resultLine}</p>
                    </div>

                    {/* Draining progress bar */}
                    <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded overflow-hidden">
                        <div className={`h-full rounded ${modal.passed ? 'bg-green-500 animate-drain-pass' : 'bg-red-500 animate-drain-fail'}`} />
                    </div>

                    <button
                        onClick={() => {
                            if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
                            advance();
                        }}
                        className="text-sm opacity-50 hover:opacity-100 transition-opacity">
                        Next →
                    </button>
                </div>
            </div>
        );
    }

    function renderNewSetModal() {
        const anyCompleted = TIERS.some(
            (t) => state.puzzles[t].status === 'passed' || state.puzzles[t].status === 'failed',
        );

        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => setShowNewSetModal(false)}>
                <div
                    className="bg-[var(--background)] border rounded-lg p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-bold">New puzzle set?</h2>
                            <p className="text-sm opacity-60 mt-1">
                                {anyCompleted ? 'Rate the puzzles you played — or skip.' : 'Your progress will be lost.'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowNewSetModal(false)}
                            className="opacity-40 hover:opacity-100 text-lg leading-none px-1 ml-2 mt-0.5">
                            ✕
                        </button>
                    </div>

                    {anyCompleted && (
                        <div className="flex flex-col gap-3">
                            {TIERS.map((tier) => {
                                const status = state.puzzles[tier].status;
                                const isComplete = status === 'passed' || status === 'failed';
                                return (
                                    <div key={tier} className="flex items-center justify-between">
                                        <span className="text-sm font-medium flex items-center gap-2">
                                            <span>{TIER_EMOJI[tier]}</span>
                                            <span>{TIER_LABELS[tier]}</span>
                                        </span>
                                        {isComplete ? (
                                            <div className="flex gap-2">
                                                {(['good', 'bad'] as FeedbackRating[]).map((rating) => (
                                                    <button
                                                        key={rating}
                                                        onClick={() =>
                                                            setNewSetRatings((prev) => ({
                                                                ...prev,
                                                                [tier]: prev[tier] === rating ? undefined : rating,
                                                            }))
                                                        }
                                                        className={[
                                                            'border rounded-lg px-3 py-2 text-lg transition-all',
                                                            newSetRatings[tier] === rating
                                                                ? rating === 'good'
                                                                    ? 'border-green-500 bg-green-500/10'
                                                                    : 'border-red-500 bg-red-500/10'
                                                                : 'opacity-40 hover:opacity-70',
                                                        ].join(' ')}>
                                                        {rating === 'good' ? '👍' : '👎'}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs opacity-30 italic">not played</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={() => setShowNewSetModal(false)}
                            className="text-sm opacity-40 hover:opacity-70 transition-opacity flex-1 py-2 text-center">
                            Cancel
                        </button>
                        <button
                            onClick={() => submitNewSetFeedback(!anyCompleted)}
                            className="border-2 border-yellow-400 rounded px-4 py-2 text-sm font-semibold flex-1">
                            {anyCompleted ? 'Submit & continue' : 'Continue'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderWordReportModal() {
        return (
            <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
                onClick={closeWordReportModal}>
                <div
                    className="bg-[var(--background)] border border-b-0 sm:border rounded-t-2xl sm:rounded-lg p-6 pb-10 sm:pb-6 w-full sm:max-w-sm sm:mx-4 flex flex-col gap-5"
                    onClick={(e) => e.stopPropagation()}>
                    {wordReportStage === 'idle' && (
                        <>
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Report a word</h2>
                                <button onClick={closeWordReportModal} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => setWordReportStage('missing')}
                                    className="border rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex flex-col gap-0.5 active:opacity-70">
                                    <span>+ Missing word</span>
                                    <span className="font-normal opacity-50">A word that should be in the game</span>
                                </button>
                                <button
                                    onClick={() => setWordReportStage('bad')}
                                    className="border rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex flex-col gap-0.5 active:opacity-70">
                                    <span>− Report word</span>
                                    <span className="font-normal opacity-50">A word that should not be in the game</span>
                                </button>
                            </div>
                        </>
                    )}

                    {wordReportStage === 'missing' && (
                        <>
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Missing word</h2>
                                <button onClick={closeWordReportModal} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                            </div>
                            <p className="text-sm opacity-60">What word did you expect to work?</p>
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    value={wordReportInput}
                                    onChange={(e) => setWordReportInput(e.target.value)}
                                    onKeyDown={handleWordReportKeyDown}
                                    className="border rounded px-3 py-3 flex-1 bg-transparent font-mono uppercase text-base"
                                    placeholder="WORD"
                                    maxLength={activePuzzle.start.length}
                                />
                                <button onClick={handleMissingWordSubmit} className="border rounded px-4 py-3 text-sm font-semibold">Submit</button>
                            </div>
                            <button onClick={() => setWordReportStage('idle')} className="text-sm opacity-40 hover:opacity-70 transition-opacity text-center w-full py-1">← Back</button>
                        </>
                    )}

                    {wordReportStage === 'bad' && (
                        <>
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Wrong word</h2>
                                <button onClick={closeWordReportModal} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                            </div>
                            <p className="text-sm opacity-60">Which word felt wrong?</p>
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    value={wordReportInput}
                                    onChange={(e) => setWordReportInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleBadWordSubmit();
                                        if (e.key === 'Escape') closeWordReportModal();
                                    }}
                                    className="border rounded px-3 py-3 flex-1 bg-transparent font-mono uppercase text-base"
                                    placeholder="WORD"
                                    maxLength={activePuzzle.start.length}
                                />
                                <button onClick={handleBadWordSubmit} className="border rounded px-4 py-3 text-sm font-semibold">Submit</button>
                            </div>
                            <button onClick={() => setWordReportStage('idle')} className="text-sm opacity-40 hover:opacity-70 transition-opacity text-center w-full py-1">← Back</button>
                        </>
                    )}
                </div>
            </div>
        );
    }
}
