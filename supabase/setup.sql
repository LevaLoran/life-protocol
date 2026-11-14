-- FORM. v0.07 — настройка хранилища фото. Выполнить один раз: Supabase → SQL Editor → Run.
-- Приватный бакет: файлы доступны только их владельцу (папка = id пользователя).

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('photos', 'photos', false,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','image/gif'])
on conflict (id) do update set public = false, allowed_mime_types = excluded.allowed_mime_types;
-- file_size_limit намеренно не задаётся: размер файла ограничивает только глобальная настройка проекта
-- (Dashboard → Storage → Settings → Upload file size limit).

drop policy if exists "photos_select_own" on storage.objects;
drop policy if exists "photos_insert_own" on storage.objects;
drop policy if exists "photos_update_own" on storage.objects;
drop policy if exists "photos_delete_own" on storage.objects;

create policy "photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Защита от переполнения: суммарно не более 2 ГБ оригиналов на пользователя
-- (число 2147483648 можно поменять; приложение при замене фото само удаляет предыдущий оригинал).
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select coalesce(sum((o.metadata->>'size')::bigint), 0)
           from storage.objects o
          where o.bucket_id = 'photos'
            and (storage.foldername(o.name))[1] = auth.uid()::text) < 2147483648
  );

create policy "photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- Часть 2 (v0.10): синхронизация данных между устройствами
-- ============================================================================
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null,
  rev        integer     not null default 1,
  updated_at timestamptz not null default now(),
  device     text,
  constraint user_data_size check (pg_column_size(data) < 4194304)
);

-- Серверные резервные копии: клиент может только читать их, создаёт триггер.
create table if not exists public.user_data_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  data       jsonb       not null,
  rev        integer     not null,
  created_at timestamptz not null default now()
);
create index if not exists user_data_backups_user_idx on public.user_data_backups (user_id, created_at desc);

alter table public.user_data enable row level security;
alter table public.user_data_backups enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_backups_select_own" on public.user_data_backups;

create policy "user_data_select_own" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "user_data_insert_own" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "user_data_update_own" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Политики DELETE нет намеренно: прогресс нельзя удалить запросом из браузера (строка удаляется только вместе с аккаунтом).
create policy "user_data_backups_select_own" on public.user_data_backups for select to authenticated using (auth.uid() = user_id);

revoke all on public.user_data, public.user_data_backups from anon;

-- Защита от случайной перезаписи: версия может расти только на 1; перед изменением старая версия уходит в копии
-- (не чаще раза в 30 минут, а при восстановлении — всегда); хранится 30 последних копий.
create or replace function public.user_data_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  if new.rev <> old.rev + 1 then raise exception 'rev conflict' using errcode = '40001'; end if;
  if coalesce(new.device,'') like 'restore:%'
     or not exists (select 1 from public.user_data_backups b
                    where b.user_id = old.user_id and b.created_at > now() - interval '30 minutes') then
    insert into public.user_data_backups (user_id, data, rev) values (old.user_id, old.data, old.rev);
    delete from public.user_data_backups
     where user_id = old.user_id
       and id not in (select id from public.user_data_backups where user_id = old.user_id order by created_at desc limit 30);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_data_guard on public.user_data;
create trigger user_data_guard before update on public.user_data
  for each row execute function public.user_data_guard();

-- Мгновенные обновления на других устройствах (без этого работает опрос раз в 45 секунд).
do $$ begin
  alter publication supabase_realtime add table public.user_data;
exception when duplicate_object then null; when undefined_object then null; end $$;
