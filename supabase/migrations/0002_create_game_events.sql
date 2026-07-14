-- Universal event log for all games on the platform.
-- game_id + event_type identify what happened; jsonb payload carries game-specific data.
-- Apply via Supabase dashboard SQL editor after 0001.

create table if not exists game_events (
    id          bigint generated always as identity primary key,
    game_id     text        not null,
    session_id  text        not null,
    event_type  text        not null,
    tier        text,                          -- nullable; null for tierless games
    payload     jsonb       not null default '{}',
    created_at  timestamptz not null default now()
);

-- Query patterns: filter by game + type + date, look up a session's full history
create index if not exists game_events_game_type_date
    on game_events (game_id, event_type, created_at);

create index if not exists game_events_session
    on game_events (session_id);
