'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { submitFeedback, submitWordReport } from '@/app/actions';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { PuzzleSet, Tier, TieredPuzzle } from '@/lib/generatePuzzle';

// ── Types ─────────────────────────────────────────────────────────────────────

type PuzzleStatus = 'not-started' | 'in-progress' | 'passed' | 'failed';

type PuzzleProgress = {
    moves: string[];
    status: PuzzleStatus;
    hintsUsed: number;
};

type SetState = {
    setId: string;
    puzzles: Record<Tier, PuzzleProgress>;
};

type FeedbackRating = 'good' | 'bad';

type WordReportStage = 'idle' | 'missing' | 'bad';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_KEY = 'steple-set-state';
const TIERS: Tier[] = ['easy', 'medium', 'hard'];
const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const TIER_EMOJI: Record<Tier, string> = { easy: '🟢', medium: '🟡', hard: '🔴' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3 };

const ADVANCE_DELAY_PASS = 3000;  // ms after solving before auto-advancing
const ADVANCE_DELAY_FAIL = 4000;  // ms after failing before auto-advancing

function freshProgress(start: string): PuzzleProgress {
    return { moves: [start], status: 'not-started', hintsUsed: 0 };
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameClient({ puzzleSet }: { puzzleSet: PuzzleSet }) {
    const router = useRouter();

    // ── State ─────────────────────────────────────────────────────────────────

    const [state, setState] = useState<SetState>(() => freshState(puzzleSet.id, puzzleSet));
    const [activeTier, setActiveTier] = useState<Tier>('easy');
    const [hydrated, setHydrated] = useState(false);

    const [input, setInput] = useState('');
    const [message, setMessage] = useState('');

    // Modals
    const [showInstructions, setShowInstructions] = useState(false);
    const [showHints, setShowHints] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
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

    // Hint tracking: reopening hint for same word position is free
    const [hintConsumedForWord, setHintConsumedForWord] = useState(false);

    // Scroll + clipboard
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shareCopied, setShareCopied] = useState(false);

    // Auto-advance timer
    const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Restore from localStorage ─────────────────────────────────────────────

    useEffect(() => {
        if (!localStorage.getItem('ladder-seen-instructions')) {
            setShowInstructions(true);
        }

        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (raw) {
                const saved = JSON.parse(raw) as SetState;
                if (saved?.setId === puzzleSet.id && saved?.puzzles) {
                    setState(saved);
                    // Resume at the right tier
                    const resume = TIERS.find(
                        (t) => saved.puzzles[t]?.status === 'not-started' ||
                               saved.puzzles[t]?.status === 'in-progress',
                    );
                    if (resume) {
                        setActiveTier(resume);
                    } else {
                        setShowSummary(true);
                    }
                    // Mark solved tiers' animations as already fired
                    for (const t of TIERS) {
                        if (saved.puzzles[t]?.status === 'passed' || saved.puzzles[t]?.status === 'failed') {
                            solvedAnimationFired.current.add(t);
                        }
                    }
                }
            }
        } catch {}

        setHydrated(true);
    }, [puzzleSet.id]);

    // ── Persist on every change ───────────────────────────────────────────────

    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch {}
    }, [hydrated, state]);

    // ── Derived values for active puzzle ──────────────────────────────────────

    const activePuzzle: TieredPuzzle = puzzleSet[activeTier];
    const progress: PuzzleProgress = state.puzzles[activeTier];
    const moves = progress.moves;
    const currentWord = moves[moves.length - 1];
    const solved = currentWord === activePuzzle.target;
    const failed = progress.status === 'failed';
    const moveCount = moves.length - 1;
    const atLimit = moveCount >= activePuzzle.moveLimit;
    const validNextWords = [...(activePuzzle.neighborGraph[currentWord] ?? [])].sort();

    // ── Auto-advance after pass/fail ──────────────────────────────────────────

    const advance = useCallback(() => {
        const nextTier = TIERS.find(
            (t) => state.puzzles[t].status === 'not-started' || state.puzzles[t].status === 'in-progress',
        );
        if (nextTier) {
            setActiveTier(nextTier);
            setInput('');
            setMessage('');
            setHintConsumedForWord(false);
        } else {
            setShowSummary(true);
        }
    }, [state.puzzles]);

    // Solve animation + auto-advance scheduling
    useEffect(() => {
        if (solved && !solvedAnimationFired.current.has(activeTier)) {
            solvedAnimationFired.current.add(activeTier);
            setSolvedAnimating(true);
            advanceTimerRef.current = setTimeout(() => {
                setSolvedAnimating(false);
                advance();
            }, ADVANCE_DELAY_PASS);
        }
    }, [solved, activeTier, advance]);

    // Fail auto-advance scheduling
    useEffect(() => {
        if (failed && !solvedAnimationFired.current.has(activeTier)) {
            solvedAnimationFired.current.add(activeTier);
            advanceTimerRef.current = setTimeout(() => {
                advance();
            }, ADVANCE_DELAY_FAIL);
        }
    }, [failed, activeTier, advance]);

    // Cleanup timers
    useEffect(() => {
        return () => {
            if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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
        localStorage.setItem('ladder-seen-instructions', '1');
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
        const nextMoveCount = nextMoves.length - 1;
        const nowSolved = guess === activePuzzle.target;
        const nowFailed = !nowSolved && nextMoveCount >= activePuzzle.moveLimit;

        const newStatus: PuzzleStatus = nowSolved ? 'passed' : nowFailed ? 'failed' : 'in-progress';

        updateProgress(activeTier, { moves: nextMoves, status: newStatus });
        setInput('');
        setShowHints(false);
        setHintConsumedForWord(false);

        if (nowSolved) {
            const par = activePuzzle.optimalPath.length - 1;
            const over = nextMoveCount - par;
            setMessage(
                over === 0
                    ? `Solved in ${nextMoveCount} moves — par! `
                    : over > 0
                    ? `Solved in ${nextMoveCount} moves (+${over} over par)`
                    : `Solved in ${nextMoveCount} moves (${over} under par!)`,
            );
        } else if (nowFailed) {
            setMessage(`Out of moves — the optimal path was ${activePuzzle.optimalPath.length - 1} moves.`);
        } else {
            setMessage('');
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') submitMove();
    }

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
                        start: puzzleSet[t].start,
                        target: puzzleSet[t].target,
                        optimalPathLength: puzzleSet[t].optimalPath.length - 1,
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

        try { localStorage.removeItem(STATE_KEY); } catch {}
        router.refresh();
    }

    // ── Share ─────────────────────────────────────────────────────────────────

    function buildShareText(): string {
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        const lines = [`Steple — ${today}`];
        for (const tier of TIERS) {
            const p = state.puzzles[tier];
            const puzzle = puzzleSet[tier];
            const par = puzzle.optimalPath.length - 1;
            const emoji = TIER_EMOJI[tier];
            if (p.status === 'passed') {
                const taken = p.moves.length - 1;
                const over = taken - par;
                const parStr = over === 0 ? `par ${par}` : over > 0 ? `par ${par}, +${over}` : `par ${par}, ${over}`;
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} ✓ ${taken} moves  (${parStr})`);
            } else if (p.status === 'failed') {
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} ✗  (par ${par})`);
            } else {
                lines.push(`${emoji} ${TIER_LABELS[tier].padEnd(7)} —`);
            }
        }
        lines.push('steple.app');
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

    function parDisplay(tier: Tier): string {
        const p = state.puzzles[tier];
        const par = puzzleSet[tier].optimalPath.length - 1;
        if (p.status === 'passed') {
            const taken = p.moves.length - 1;
            const over = taken - par;
            if (over === 0) return `${taken} moves  (par ${par})`;
            if (over > 0) return `${taken} moves  (par ${par}, +${over})`;
            return `${taken} moves  (par ${par}, ${over})`;
        }
        if (p.status === 'failed') return `failed  (par ${par})`;
        return '—';
    }

    // ── Summary screen ────────────────────────────────────────────────────────

    if (showSummary) {
        return (
            <>
                {showNewSetModal && renderNewSetModal()}
                {showWordReportModal && renderWordReportModal()}

                <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-dvh sm:h-auto sm:min-h-screen">
                    <div className="flex-none pt-6 sm:pt-8 pb-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-0.5">
                                <h1 className="text-4xl font-bold">Steple</h1>
                                <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowInstructions(true)}
                                    className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity">
                                    How to Play
                                </button>
                                <ThemeToggle />
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
                                    <span className="text-sm opacity-70">{parDisplay(tier)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                onClick={handleNewSet}
                                className="border-2 border-yellow-400 rounded px-4 py-3 text-sm font-semibold w-full sm:flex-1">
                                ↻ New puzzle set
                            </button>
                            <button
                                onClick={handleShare}
                                className="border-2 border-blue-400 rounded px-4 py-3 text-sm font-semibold w-full sm:flex-1">
                                {shareCopied ? '✓ Copied!' : '⎘ Share'}
                            </button>
                        </div>

                        <button
                            onClick={() => setShowWordReportModal(true)}
                            className="border-2 border-orange-400 rounded px-3 py-2 text-sm w-full sm:w-auto sm:self-center opacity-60 hover:opacity-100 transition-opacity">
                            Word Report
                        </button>
                    </div>
                </main>

                {showInstructions && renderInstructionsModal()}
            </>
        );
    }

    // ── Active puzzle screen ──────────────────────────────────────────────────

    const inputBlocked = solved || failed || atLimit;

    return (
        <>
            {showInstructions && renderInstructionsModal()}
            {showNewSetModal && renderNewSetModal()}
            {showWordReportModal && renderWordReportModal()}

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
                                <p className="text-xs opacity-40 uppercase tracking-wide">Alpha — research only</p>
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

            <main className="w-full max-w-xl mx-auto px-4 flex flex-col h-dvh sm:h-auto sm:min-h-screen">

                {/* ── Top: always visible ── */}
                <div className="flex-none pt-6 sm:pt-8 pb-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <h1 className="text-4xl font-bold">Steple</h1>
                            <p className="text-xs opacity-40 tracking-wide">a daily word ladder game</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowInstructions(true)}
                                className="border rounded px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
                                title="How to play">
                                How to Play
                            </button>
                            <ThemeToggle />
                        </div>
                    </div>

                    {/* Puzzle indicator + move counter */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs opacity-50 uppercase tracking-wide">
                            {TIER_EMOJI[activeTier]} Puzzle {TIER_NUMBER[activeTier]} of 3 · {TIER_LABELS[activeTier]}
                        </span>
                        <span className={`text-sm font-mono tabular-nums ${atLimit && !solved ? 'text-red-500' : 'opacity-60'}`}>
                            {moveCount} / {activePuzzle.moveLimit}
                        </span>
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

                    <div className="text-sm opacity-60 text-center">
                        Par: {activePuzzle.optimalPath.length - 1} moves
                    </div>
                </div>

                {/* ── Middle: scrollable word chain ── */}
                <div
                    ref={scrollAreaRef}
                    className="flex-1 overflow-y-auto flex flex-col gap-2 py-2 sm:flex-none sm:max-h-[35vh]">
                    {moves.map((move, index) => {
                        const isLast = index === moves.length - 1;
                        const isSolvedTile = isLast && solved;
                        const isFailedTile = isLast && failed;
                        return (
                            <div
                                key={index}
                                className={[
                                    'border-2 rounded px-4 py-2 text-lg font-mono',
                                    isSolvedTile
                                        ? 'border-green-500 text-green-600 dark:text-green-400'
                                        : isFailedTile
                                        ? 'border-red-500 text-red-600 dark:text-red-400'
                                        : 'border-blue-500',
                                    isSolvedTile && solvedAnimating ? 'animate-pop' : '',
                                ].join(' ')}>
                                {move}
                                {isSolvedTile && <span className="ml-2 text-base">✓</span>}
                                {isFailedTile && <span className="ml-2 text-base">✗</span>}
                            </div>
                        );
                    })}
                </div>

                {/* ── Bottom: always visible controls ── */}
                <div className="flex-none pt-4 pb-6 sm:pb-8 flex flex-col gap-4">
                    {message && (
                        <div className={`text-sm opacity-80 ${solved ? 'animate-fade-up font-semibold' : ''}`}>
                            {message}
                        </div>
                    )}

                    {wordReportToast && (
                        <p className="text-sm opacity-70">{wordReportToast}</p>
                    )}

                    {!inputBlocked && (
                        <>
                            {/* Mobile-only input */}
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="sm:hidden border-2 rounded px-4 py-2 w-full bg-transparent font-mono uppercase text-lg"
                                placeholder="Next word"
                                maxLength={activePuzzle.start.length}
                            />
                            <div className="flex flex-col gap-4 items-center sm:items-stretch sm:flex-row sm:gap-2">
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="hidden sm:block sm:flex-1 sm:min-w-0 border rounded px-4 py-2 bg-transparent font-mono uppercase sm:text-lg"
                                    placeholder="Next word"
                                    maxLength={activePuzzle.start.length}
                                    autoFocus
                                />
                                <button
                                    onClick={() => submitMove()}
                                    className="border-2 border-green-500 rounded px-4 py-4 sm:py-2 w-full sm:w-auto sm:shrink-0">
                                    Submit
                                </button>
                                <button
                                    onClick={() => {
                                        if (!hintConsumedForWord) {
                                            updateProgress(activeTier, { hintsUsed: Math.min(progress.hintsUsed + 1, 2) });
                                            setHintConsumedForWord(true);
                                        }
                                        setShowHints((v) => !v);
                                    }}
                                    disabled={progress.hintsUsed >= 2 && !hintConsumedForWord}
                                    className="border rounded px-4 py-3 sm:py-2 w-4/5 sm:w-auto sm:shrink-0 text-sm opacity-60 hover:opacity-100 transition-opacity disabled:opacity-25 disabled:cursor-not-allowed">
                                    Hint ×{Math.max(0, 2 - progress.hintsUsed)}
                                </button>
                            </div>
                        </>
                    )}

                    {/* New puzzle set + Word report */}
                    <div className="flex flex-col gap-4 items-center sm:flex-row sm:justify-center">
                        <button
                            onClick={handleNewSet}
                            className="border-2 border-yellow-400 rounded px-3 py-3 sm:py-2 text-sm w-3/5 sm:w-48">
                            ↻ New puzzle set
                        </button>
                        <button
                            onClick={() => setShowWordReportModal(true)}
                            className="border-2 border-orange-400 rounded px-3 py-3 sm:py-2 text-sm w-2/5 sm:w-48 opacity-60 hover:opacity-100 transition-opacity">
                            Word Report
                        </button>
                    </div>
                </div>
            </main>
        </>
    );

    // ── Modal renderers (defined as functions to avoid early return issues) ───

    function renderInstructionsModal() {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={closeInstructions}>
                <div
                    className="bg-[var(--background)] border rounded-lg p-6 max-w-sm w-full mx-4 flex flex-col gap-5"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">How to Play</h2>
                        <button onClick={closeInstructions} className="opacity-50 hover:opacity-100 text-lg leading-none px-1">✕</button>
                    </div>
                    <p className="text-sm opacity-70">Get from the start word to the target word — one letter at a time.</p>
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold">The one-letter rule</p>
                        <p className="text-sm opacity-70">Every move, change exactly one letter. The result must be a real word. That&apos;s it.</p>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-md border font-mono text-sm">
                        <span className="opacity-40 text-xs mb-1">COLD → WARM</span>
                        <span>COLD</span>
                        <span className="opacity-40 text-xs">change L→R</span>
                        <span>CORD</span>
                        <span className="opacity-40 text-xs">change C→W</span>
                        <span>WORD</span>
                        <span className="opacity-40 text-xs">change O→A</span>
                        <span>WARD</span>
                        <span className="opacity-40 text-xs">change D→M</span>
                        <span>WARM ✓</span>
                    </div>
                    <p className="text-sm opacity-70">Each set has three puzzles — easy, medium, and hard. Finish all three to see your results.</p>
                    <p className="text-sm opacity-70">Try to match or beat par (the shortest possible path).</p>
                    <button onClick={closeInstructions} className="border rounded px-4 py-2 text-sm font-semibold w-full">Let&apos;s play →</button>
                </div>
            </div>
        );
    }

    function renderNewSetModal() {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
                onClick={() => submitNewSetFeedback(true)}>
                <div
                    className="bg-[var(--background)] border rounded-lg p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-bold">How was this set?</h2>
                            <p className="text-sm opacity-60 mt-1">Rate each puzzle — or skip.</p>
                        </div>
                        <button
                            onClick={() => submitNewSetFeedback(true)}
                            className="opacity-40 hover:opacity-100 text-lg leading-none px-1 ml-2 mt-0.5">
                            ✕
                        </button>
                    </div>

                    <div className="flex flex-col gap-3">
                        {TIERS.map((tier) => (
                            <div key={tier} className="flex items-center justify-between">
                                <span className="text-sm font-medium flex items-center gap-2">
                                    <span>{TIER_EMOJI[tier]}</span>
                                    <span>{TIER_LABELS[tier]}</span>
                                </span>
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
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={() => submitNewSetFeedback(true)}
                            className="text-sm opacity-40 hover:opacity-70 transition-opacity flex-1 py-2 text-center">
                            Skip
                        </button>
                        <button
                            onClick={() => submitNewSetFeedback(false)}
                            className="border-2 border-green-500 rounded px-4 py-2 text-sm font-semibold flex-1">
                            Submit & continue
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
                                    <span className="font-normal opacity-50">A word you expected to work</span>
                                </button>
                                <button
                                    onClick={() => setWordReportStage('bad')}
                                    className="border rounded-xl px-4 py-4 text-sm font-semibold w-full text-left flex flex-col gap-0.5 active:opacity-70">
                                    <span>− Wrong word</span>
                                    <span className="font-normal opacity-50">A word that shouldn&apos;t be there</span>
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
