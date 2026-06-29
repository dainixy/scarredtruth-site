-- Scarred Truth — Supabase schema. Run once in the Supabase SQL editor.
-- Mirrors the JSON store shapes. `primary` is reserved, so it's primary_key.

create table if not exists results (
  id            text primary key,
  created_at    bigint,
  expires_at    bigint,
  primary_key   text,
  secondary     text,
  tertiary      text,
  primary_name  text,
  core_fear     text,
  pcts          jsonb,
  profile_tallies jsonb,
  rebuilding    boolean,
  answers       jsonb,
  person        jsonb,
  chat_count    int default 0,
  note          text,
  note_source   text
);

create table if not exists messages (
  id         bigserial primary key,
  result_id  text,
  role       text,
  content    text,
  ts         bigint
);

create table if not exists events (
  id         bigserial primary key,
  ts         bigint,
  type       text,
  result_id  text,
  payload    jsonb
);

create index if not exists messages_result_id_idx on messages (result_id);
create index if not exists results_created_at_idx on results (created_at);

-- 30-day TTL: getResult() already filters expired rows in app code. Optional manual
-- cleanup of old rows:
--   delete from results where expires_at < (extract(epoch from now()) * 1000);
