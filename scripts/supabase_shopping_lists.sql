-- 買い物リスト機能用マイグレーション
-- 既存データを残したまま Supabase SQL Editor で実行できます。

begin;

create extension if not exists "pgcrypto";

create table if not exists public.shopping_lists (
  shopping_list_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  item_id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists (shopping_list_id) on delete cascade,
  name text not null,
  category text not null default 'その他',
  quantity numeric(10, 2),
  gram numeric(10, 2),
  unit text,
  memo text,
  checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shopping_lists
  add column if not exists updated_at timestamptz not null default now();

alter table public.shopping_list_items
  add column if not exists unit text;

alter table public.shopping_list_items
  alter column quantity type numeric(10, 2) using quantity::numeric,
  alter column gram type numeric(10, 2) using gram::numeric;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_lists_user_id_fkey'
      and conrelid = 'public.shopping_lists'::regclass
  ) then
    alter table public.shopping_lists
      add constraint shopping_lists_user_id_fkey
      foreign key (user_id) references public.users(user_id) on delete cascade;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shopping_lists_updated_at on public.shopping_lists;
create trigger set_shopping_lists_updated_at
before update on public.shopping_lists
for each row execute function public.set_updated_at();

create index if not exists shopping_lists_user_id_updated_at_idx
  on public.shopping_lists (user_id, updated_at desc);

create index if not exists shopping_list_items_shopping_list_id_idx
  on public.shopping_list_items (shopping_list_id, sort_order asc);

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

drop policy if exists "Users can manage their own shopping lists"
  on public.shopping_lists;
create policy "Users can manage their own shopping lists"
  on public.shopping_lists
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage items in their own shopping lists"
  on public.shopping_list_items;
create policy "Users can manage items in their own shopping lists"
  on public.shopping_list_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.shopping_lists sl
      where sl.shopping_list_id = shopping_list_items.shopping_list_id
        and sl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.shopping_lists sl
      where sl.shopping_list_id = shopping_list_items.shopping_list_id
        and sl.user_id = auth.uid()
    )
  );

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.shopping_lists to authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
grant all privileges on public.shopping_lists to service_role;
grant all privileges on public.shopping_list_items to service_role;

comment on table public.shopping_lists is '買い物リスト';
comment on table public.shopping_list_items is '買い物リスト項目';
comment on column public.shopping_list_items.quantity is '個数';
comment on column public.shopping_list_items.gram is '重量またはml相当';
comment on column public.shopping_list_items.unit is '単位';
comment on column public.shopping_list_items.checked is '購入済みフラグ';

commit;
