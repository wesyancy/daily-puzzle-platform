// Event types that can be written to game_events.
// Add new values here as new games or event kinds are introduced.
export type GameEventType =
    | 'puzzle_started'
    | 'guess_submitted'
    | 'puzzle_completed'
    | 'hint_used'
    | 'set_completed';

// Payload shape is intentionally loose — each game writes what it needs.
export type EventPayload = Record<string, unknown>;
