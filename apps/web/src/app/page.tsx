import { redirect } from 'next/navigation';

// MVP: only one game exists, route straight to it.
// When more games are added, replace this with a proper landing page.
export default function HomePage() {
    redirect('/stepladder');
}
