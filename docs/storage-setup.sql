-- Run in the Supabase SQL editor (or via the CLI) after creating the
-- project. Creates the private `resumes` bucket and RLS policies that
-- restrict every user to their own folder (`{auth.uid()}/...`), matching
-- the upload path convention used by web/src/app/resume/actions.ts.
--
-- Cover letters (plan Section 1, applications.cover_letter_storage_path)
-- will reuse the same pattern in a later phase — add a `cover-letters`
-- bucket + policies analogous to these when that's built.

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "Users can upload to their own resume folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own resumes"
on storage.objects for select
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own resumes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);
