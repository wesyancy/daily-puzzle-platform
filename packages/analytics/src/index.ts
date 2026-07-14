export type { GameEventType, EventPayload } from './types';

// Returns the anonymous session ID for this browser, creating one on first visit.
// Stored in localStorage so it persists across page loads but resets on storage-clear.
export function getSessionId(): string {
    const key = 'platform-session-id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
    }
    return id;
}
