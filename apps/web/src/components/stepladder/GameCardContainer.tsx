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

// Game Card Container — scrollable submitted word chain plus the live current-guess tile.
// scrollRef is owned by GameClient so the auto-scroll useEffect can remain there.
export function GameCardContainer({
    scrollRef, moves, flashTileIndex, solved, failed, solvedAnimating, inputBlocked, input,
}: Props) {
    return (
        <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto flex flex-col gap-2 pt-2 pb-2 sm:flex-none sm:max-h-[35vh]"
            style={{
                // Fade edges so content softly disappears when the list is taller than the container
                maskImage: 'linear-gradient(to bottom, transparent, black 0.75rem, black calc(100% - 0.75rem), transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 0.75rem, black calc(100% - 0.75rem), transparent)',
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

            {/* Current guess tile — dashed border, lives below the submitted chain */}
            {!inputBlocked && (
                <div className="border-2 border-dashed border-blue-400 rounded px-4 py-2 text-lg font-mono min-h-[2.75rem] text-blue-500 dark:text-blue-400">
                    {input.toUpperCase() || <span className="opacity-0">·</span>}
                </div>
            )}
        </div>
    );
}
