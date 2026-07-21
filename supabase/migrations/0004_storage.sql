-- ============================================================================
-- Storage bucket for uploaded photos (broker headshots, listing photos).
--
-- Until now the admin could only accept a URL typed by hand, which meant
-- photos had to be hosted somewhere else first. This creates a public bucket
-- so the admin can upload a file directly.
--
-- Public read: these images are displayed on the public site, so the bucket is
-- readable by anyone. Writes are restricted to signed-in staff.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- Anyone may read (the site shows these images).
drop policy if exists "media: public read" on storage.objects;
create policy "media: public read" on storage.objects for select
  using (bucket_id = 'media');

-- Only staff may add, replace or remove files.
drop policy if exists "media: staff insert" on storage.objects;
create policy "media: staff insert" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_staff());

drop policy if exists "media: staff update" on storage.objects;
create policy "media: staff update" on storage.objects for update
  using (bucket_id = 'media' and public.is_staff())
  with check (bucket_id = 'media' and public.is_staff());

drop policy if exists "media: staff delete" on storage.objects;
create policy "media: staff delete" on storage.objects for delete
  using (bucket_id = 'media' and public.is_staff());
