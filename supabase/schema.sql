-- =====================================================================
-- PPDS Digital Signage — Skema Supabase
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------- Fungsi pembantu ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'admin' check (role in ('admin')),
  created_at   timestamptz not null default now()
);

-- Pemeriksaan admin berdasarkan tabel profiles (bukan input browser).
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- schedules ----------
create table if not exists public.schedules (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  event_date   date not null,
  start_time   time not null,
  end_time     time not null,
  location     text not null default '' check (char_length(location) <= 200),
  description  text not null default '' check (char_length(description) <= 1000),
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists schedules_date_idx on public.schedules (event_date, start_time);

-- ---------- announcements ----------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  content      text not null default '' check (char_length(content) <= 2000),
  category     text not null default 'Informasi Umum'
               check (category in ('Akademik','Administrasi','Kegiatan','Ujian','Informasi Umum','Lainnya')),
  priority     text not null default 'normal' check (priority in ('normal','high')),
  publish_at   timestamptz not null default now(),
  expires_at   timestamptz,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (expires_at is null or expires_at > publish_at)
);

-- ---------- events (agenda mendatang) ----------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  description  text not null default '' check (char_length(description) <= 1000),
  event_date   date not null,
  start_time   time,
  end_time     time,
  location     text not null default '' check (char_length(location) <= 200),
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);
create index if not exists events_date_idx on public.events (event_date);

-- ---------- media (foto & video) ----------
create table if not exists public.media (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '' check (char_length(description) <= 1000),
  media_type       text not null check (media_type in ('image','video')),
  storage_path     text,
  external_url     text check (external_url is null or external_url ~* '^https?://'),
  event_date       date,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 5 and 3600),
  sort_order       integer not null default 0,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);
create index if not exists media_order_idx on public.media (media_type, sort_order);

-- ---------- signage_settings (satu baris) ----------
create table if not exists public.signage_settings (
  id                       uuid primary key default gen_random_uuid(),
  institution_name         text not null default 'PPDS Obstetri dan Ginekologi FKIK ULM–RSUD Ulin'
                           check (char_length(institution_name) between 1 and 150),
  logo_url                 text check (logo_url is null or logo_url ~* '^https?://'),
  slide_duration_seconds   integer not null default 15 check (slide_duration_seconds between 5 and 120),
  refresh_interval_seconds integer not null default 60 check (refresh_interval_seconds between 10 and 3600),
  footer_text              text not null default 'Program Pendidikan Dokter Spesialis Obstetri dan Ginekologi · FKIK Universitas Lambung Mangkurat · RSUD Ulin Banjarmasin'
                           check (char_length(footer_text) <= 250),
  theme                    text not null default 'light' check (theme in ('light','dark')),
  updated_at               timestamptz not null default now()
);
-- Hanya satu baris pengaturan.
create unique index if not exists signage_settings_single on public.signage_settings ((true));

-- ---------- signage_playlist ----------
create table if not exists public.signage_playlist (
  id               uuid primary key default gen_random_uuid(),
  slide_type       text not null check (slide_type in ('schedule','announcement','event','gallery','academic','video')),
  title            text not null check (char_length(title) between 1 and 100),
  sort_order       integer not null default 0,
  duration_seconds integer not null default 15 check (duration_seconds between 5 and 300),
  is_enabled       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- Trigger updated_at + RLS + akses admin ----------
do $$
declare t text;
begin
  foreach t in array array['schedules','announcements','events','media','signage_settings','signage_playlist'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "admin full access" on public.%I', t);
    execute format(
      'create policy "admin full access" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);

    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);

    -- Pengunjung anonim: hanya baca.
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Kebijakan baca publik (hanya baris yang dipublikasikan) ----------
drop policy if exists "public read published" on public.schedules;
create policy "public read published" on public.schedules
  for select to anon, authenticated using (is_published);

drop policy if exists "public read published" on public.announcements;
create policy "public read published" on public.announcements
  for select to anon, authenticated
  using (is_published and publish_at <= now() and (expires_at is null or expires_at > now()));

drop policy if exists "public read published" on public.events;
create policy "public read published" on public.events
  for select to anon, authenticated using (is_published);

drop policy if exists "public read published" on public.media;
create policy "public read published" on public.media
  for select to anon, authenticated using (is_published);

drop policy if exists "public read settings" on public.signage_settings;
create policy "public read settings" on public.signage_settings
  for select to anon, authenticated using (true);

drop policy if exists "public read enabled playlist" on public.signage_playlist;
create policy "public read enabled playlist" on public.signage_playlist
  for select to anon, authenticated using (is_enabled);

-- ---------- profiles: pengguna hanya dapat membaca profilnya sendiri ----------
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
-- Tidak ada kebijakan tulis: profil admin hanya dibuat lewat SQL Editor (lihat bagian bawah).

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signage-media', 'signage-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin select signage media" on storage.objects;
create policy "admin select signage media" on storage.objects
  for select to authenticated
  using (bucket_id = 'signage-media' and (select public.is_admin()));

drop policy if exists "admin insert signage media" on storage.objects;
create policy "admin insert signage media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signage-media' and (select public.is_admin()));

drop policy if exists "admin update signage media" on storage.objects;
create policy "admin update signage media" on storage.objects
  for update to authenticated
  using (bucket_id = 'signage-media' and (select public.is_admin()))
  with check (bucket_id = 'signage-media' and (select public.is_admin()));

drop policy if exists "admin delete signage media" on storage.objects;
create policy "admin delete signage media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signage-media' and (select public.is_admin()));

-- ---------- Data awal (pengaturan & urutan tayangan; bukan konten resmi) ----------
insert into public.signage_settings default values on conflict do nothing;

insert into public.signage_playlist (slide_type, title, sort_order, duration_seconds)
select v.slide_type, v.title, v.sort_order, v.duration_seconds
from (values
  ('schedule',     'Jadwal Hari Ini',          1, 20),
  ('announcement', 'Pengumuman Terbaru',       2, 20),
  ('event',        'Agenda Mendatang',         3, 20),
  ('gallery',      'Dokumentasi Kegiatan',     4, 12),
  ('academic',     'Informasi Akademik',       5, 20),
  ('video',        'Video Profil dan Kegiatan',6, 30)
) as v(slide_type, title, sort_order, duration_seconds)
where not exists (select 1 from public.signage_playlist);

-- =====================================================================
-- LANGKAH WAJIB SETELAH INI: jadikan akun Anda administrator.
-- 1) Supabase > Authentication > Users > "Add user" (isi email + kata sandi,
--    centang Auto Confirm User).
-- 2) Jalankan perintah di bawah ini (ganti email), HAPUS tanda komentar:
--
-- insert into public.profiles (id, display_name, role)
-- select id, 'Administrator', 'admin' from auth.users
-- where email = 'admin@contoh.ac.id'
-- on conflict (id) do update set role = 'admin';
--
-- 3) Disarankan: Authentication > Providers > Email > matikan "Allow new users
--    to sign up" agar tidak ada pendaftaran publik.
-- =====================================================================
