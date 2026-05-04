-- Migration 024: Create Supabase Storage buckets + RLS policies
--
-- Run this once in the Supabase SQL Editor.
-- safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ── Buckets ──────────────────────────────────────────────────────────────────

-- kyc-docs: private, 10 MB limit, images only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-docs', 'kyc-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

-- bike-photos: public CDN bucket for bike listing images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bike-photos', 'bike-photos', true, 10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- ── kyc-docs RLS ─────────────────────────────────────────────────────────────

-- Users may upload files only inside their own UID folder
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'kyc_user_insert' and tablename = 'objects' and schemaname = 'storage'
  ) then
    create policy "kyc_user_insert" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'kyc-docs' and
        (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- Users may read their own KYC files
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'kyc_user_select' and tablename = 'objects' and schemaname = 'storage'
  ) then
    create policy "kyc_user_select" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'kyc-docs' and
        (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- Users may replace their own files (resubmissions create new paths, but belt-and-suspenders)
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'kyc_user_update' and tablename = 'objects' and schemaname = 'storage'
  ) then
    create policy "kyc_user_update" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'kyc-docs' and
        (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

-- ── bike-photos RLS ──────────────────────────────────────────────────────────

-- Public bucket: anyone can read (Supabase handles this automatically for public buckets,
-- but explicit policy as a belt-and-suspenders measure)
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'bike_photos_public_read' and tablename = 'objects' and schemaname = 'storage'
  ) then
    create policy "bike_photos_public_read" on storage.objects
      for select to public
      using (bucket_id = 'bike-photos');
  end if;
end $$;

-- Only authenticated users (admin via service role) can write bike photos
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'bike_photos_auth_insert' and tablename = 'objects' and schemaname = 'storage'
  ) then
    create policy "bike_photos_auth_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'bike-photos');
  end if;
end $$;
