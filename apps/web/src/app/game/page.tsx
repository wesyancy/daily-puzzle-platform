import GameClient from '@/components/GameClient';
import { generatePuzzle } from '@/lib/generatePuzzle';

// Force a fresh puzzle on every request (never serve a cached page).
export const dynamic = 'force-dynamic';

export default function GamePage() {
    const puzzle = generatePuzzle();

    // Key changes whenever the puzzle changes, which forces GameClient to
    // fully remount (resetting all state) when "Generate another" is clicked.
    return (
        <GameClient
            key={`${puzzle.start}-${puzzle.target}`}
            initialPuzzle={puzzle}
        />
    );
}
