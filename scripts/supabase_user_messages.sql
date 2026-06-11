create table if not exists public.user_messages (
  message_id uuid primary key default gen_random_uuid(),
  contact_id text,
  user_id uuid not null,
  user_email text,
  sender_user_id uuid,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_messages_user_id_created_at_idx
  on public.user_messages (user_id, created_at desc);

create index if not exists user_messages_user_id_read_at_idx
  on public.user_messages (user_id, read_at);
