'use client';

import { useState } from 'react';

// Instructions modal — owns page state internally; always opens at page 1.
export function InstructionsModal({ onClose }: { onClose: () => void }) {
    const [page, setPage] = useState<1 | 2 | 3>(1);

    const dots = (
        <div className="flex items-center justify-center gap-1.5">
            {([1, 2, 3] as const).map((n) => (
                <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${page === n ? 'bg-current opacity-70 w-3' : 'bg-current opacity-20'}`}
                />
            ))}
        </div>
    );

    const pages = {
        1: (
            <>
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold">How to Play</h2>
                    <button onClick={onClose} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
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
                <button onClick={() => setPage(2)} className="border rounded px-4 py-2 text-sm font-semibold w-full">
                    Next →
                </button>
            </>
        ),
        2: (
            <>
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold">The Rules</h2>
                    <button onClick={onClose} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
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
                    <button onClick={() => setPage(1)} className="border rounded px-4 py-2 text-sm w-full opacity-60 hover:opacity-100">← Back</button>
                    <button onClick={() => setPage(3)} className="border rounded px-4 py-2 text-sm font-semibold w-full">Next →</button>
                </div>
            </>
        ),
        3: (
            <>
                <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold">Daily Set</h2>
                    <button onClick={onClose} className="opacity-40 hover:opacity-100 text-lg leading-none px-1 mt-0.5">✕</button>
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
                    <button onClick={() => setPage(2)} className="border rounded px-4 py-2 text-sm w-full opacity-60 hover:opacity-100">← Back</button>
                    <button onClick={onClose} className="border-2 border-green-500 rounded px-4 py-2 text-sm font-semibold w-full">Let&apos;s play →</button>
                </div>
            </>
        ),
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}>
            <div
                className="bg-[var(--background)] border rounded-2xl p-6 max-w-sm w-full mx-4 flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}>
                {pages[page]}
            </div>
        </div>
    );
}
