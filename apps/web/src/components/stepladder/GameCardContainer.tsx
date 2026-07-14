'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

interface Props {
    scrollRef: RefObject<HTMLDivElement | null>;
    moves: string[];
    flashTileIndex: number;
    solved: boolean;
    failed: boolean;
    solvedAnimating: boolean;
    inputBlocked: boolean;
    input: string;
}

// Builds a linear-gradient mask that fades the top, bottom, or both edges.
// Returns undefined when no fade should be shown (no mask applied).
function buildMaskImage(showTop: boolean, showBottom: boolean): string | undefined {
    if (!showTop && !showBottom) return undefined;
    const stops: string[] = [];
    stops.push(showTop ? 'transparent' : 'black');
    if (showTop) stops.push('black 2rem');
    if (showBottom) stops.push('black calc(100% - 2rem)');
    stops.push(showBottom ? 'transparent' : 'black');
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

// Reads the scroll container's current overflow/scroll state and updates fade flags.
function readFades(el: HTMLDivElement): { top: boolean; bottom: boolean } {
    const overflowing = el.scrollHeight > el.clientHeight;
    return {
        top: overflowing && el.scrollTop > 0,
        // 1px tolerance handles sub-pixel rounding in some browsers
        bottom: overflowing && el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    };
}

// Game Card Container — scrollable submitted word chain plus the live current-guess tile.
// scrollRef is owned by GameClient so the auto-scroll useEffect can remain there.
// flex-1 on both mobile and desktop so the card area always fills the space between
// the game header and the keyboard, keeping the keyboard pinned to the viewport bottom.
export function GameCardContainer({
    scrollRef, moves, flashTileIndex, solved, failed, solvedAnimating, inputBlocked, input,
}: Props) {
    const [showTopFade, setShowTopFade] = useState(false);
    const [showBottomFade, setShowBottomFade] = useState(false);

    // Set up scroll and resize listeners once on mount.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        function update() {
            if (!el) return;
            const { top, bottom } = readFades(el);
            setShowTopFade(top);
            setShowBottomFade(bottom);
        }

        update();
        el.addEventListener('scroll', update);
        // ResizeObserver catches container size changes (e.g. window resize, keyboard toggle)
        const ro = new ResizeObserver(update);
        ro.observe(el);

        return () => {
            el.removeEventListener('scroll', update);
            ro.disconnect();
        };
    // scrollRef is a stable RefObject — this effect only needs to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Recheck fades after every move since new tiles change the scroll height.
    // rAF lets the DOM paint first so scrollHeight is accurate.
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            const el = scrollRef.current;
            if (!el) return;
            const { top, bottom } = readFades(el);
            setShowTopFade(top);
            setShowBottomFade(bottom);
        });
        return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moves]);

    const maskImage = buildMaskImage(showTopFade, showBottomFade);

    return (
        <div
            ref={scrollRef}
            // flex-1 fills the space between the game header and keyboard on both
            // mobile and desktop. Scrollbar is hidden; the fade cues scrollability.
            className="flex-1 overflow-y-auto flex flex-col gap-2 pt-2 pb-2 [&::-webkit-scrollbar]:hidden"
            style={{
                scrollbarWidth: 'none',
                ...(maskImage ? { maskImage, WebkitMaskImage: maskImage } : {}),
            }}>
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

            {/* Current guess tile — dashed lighter-blue border matches submitted tile height
                via   placeholder (same metrics as alphabetic text, no min-h hack needed) */}
            {!inputBlocked && (
                <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded px-4 py-2 text-lg font-mono text-blue-500 dark:text-blue-400">
                    {input.toUpperCase() || ' '}
                </div>
            )}
        </div>
    );
}
