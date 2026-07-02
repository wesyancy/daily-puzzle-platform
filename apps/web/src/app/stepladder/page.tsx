import type { Metadata } from 'next';
import GameClientLoader from '@/components/GameClientLoader';
import { getPuzzleSet, isDailyMode } from '@/lib/generatePuzzle';

// Force a fresh puzzle set on every request (never serve a cached page).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Stepladder',
    description: 'A daily word ladder puzzle. Change one letter at a time to reach the target word.',
};

export default function GamePage() {
    const puzzleSet = getPuzzleSet();
    // key forces GameClient to remount when a new puzzle set arrives (e.g. after
    // "New puzzle set" clears localStorage and router.refresh() generates a new ID).
    return <GameClientLoader key={puzzleSet.id} puzzleSet={puzzleSet} isDailyMode={isDailyMode} />;
}
