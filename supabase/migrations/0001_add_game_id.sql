-- Add game_id to existing feedback tables so they're multi-game-ready.
-- Default 'stepladder' backfills all existing rows automatically.
-- Apply via Supabase dashboard SQL editor.

alter table puzzle_feedback
    add column if not exists game_id text not null default 'stepladder';

alter table word_reports
    add column if not exists game_id text not null default 'stepladder';
