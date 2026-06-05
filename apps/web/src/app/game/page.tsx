import type { Metadata } from 'next';
import GameClientLoader from '@/components/GameClientLoader';
import { getPuzzleSet } from '@/lib/generatePuzzle';

// Force a fresh puzzle set on every request (never serve a cached page).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Steple',
    description: 'A daily word game. Change one letter at a time to reach the target word.',
};

export default function GamePage() {
    const puzzleSet = getPuzzleSet();
    return <GameClientLoader puzzleSet={puzzleSet} />;
}
