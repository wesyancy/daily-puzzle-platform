'use client';

/**
 * Thin client-side wrapper that loads GameClient with ssr: false.
 *
 * next/dynamic with ssr: false must be used in a Client Component.
 * The page (Server Component) renders this wrapper, which defers
 * GameClient rendering to the browser — preventing the localStorage
 * flash that occurs when the server-generated puzzle set differs
 * from the client's saved state.
 */

import dynamic from 'next/dynamic';
import type { PuzzleSet } from '@/lib/generatePuzzle';

const GameClient = dynamic(() => import('./GameClient'), { ssr: false });

export default function GameClientLoader({ puzzleSet }: { puzzleSet: PuzzleSet }) {
    return <GameClient puzzleSet={puzzleSet} />;
}
