-- 0031_gauntlet_tools_bucket.sql
-- IDEA // GAUNTLET: a public Storage bucket for the downloadable SolidWorks
-- add-in build.
--
-- The two .bas macros are served from static/ (public, download immediately).
-- The compiled add-in is a binary that is not checked in, so it is hosted as a
-- zip in a PUBLIC bucket that anyone can download by URL (no auth: it is a free
-- tool, like the macros). The client stores only the bucket + object PATH
-- (src/lib/gauntlet.ts: TOOLS_BUCKET / ADDIN_ZIP_PATH) and builds the public URL
-- at render time, never a hardcoded provider URL. A teacher builds the zip with
-- tools/solidworks-addin/build.ps1 and uploads it to
-- gauntlet-tools/idea-gauntlet-addin.zip once; only teachers may write.
--
-- Apply manually in the Supabase SQL editor. Idempotent.

insert into storage.buckets (id, name, public)
values ('gauntlet-tools', 'gauntlet-tools', true)
on conflict (id) do update set public = true;

-- Public read is inherent to a public bucket (served at /storage/v1/object/public
-- without auth). Writes are teacher-only, mirroring the gauntlet-drawings /
-- gauntlet-models policy shape (reuses is_teacher() from 0001).
drop policy if exists "teachers manage gauntlet-tools" on storage.objects;
create policy "teachers manage gauntlet-tools" on storage.objects
	for all to authenticated
	using (bucket_id = 'gauntlet-tools' and public.is_teacher())
	with check (bucket_id = 'gauntlet-tools' and public.is_teacher());
