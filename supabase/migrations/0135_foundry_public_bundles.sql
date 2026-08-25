-- 0135_foundry_public_bundles.sql
-- The bundle proxy is removed. `foundry-bundles` becomes a PUBLIC bucket and a
-- published app is framed straight off the Storage object URL.
--
-- ---------------------------------------------------------------------------
-- WHY THIS BUCKET AND NOT A SECOND ONE.
--
-- The choice was between flipping this bucket public and adding a new public
-- bucket for `foundry-ingest` to write into. They are the same disclosure --
-- ingest writes at ingest time either way, so both buckets would hold every
-- extracted version, draft and rejected ones included -- so the second bucket
-- buys no narrowing at all. What it costs is real:
--
--   * ingest already writes `<app id>/<version id>/<path>` with the content
--     type `foundryMime` derived from the extension, which IS the URL shape
--     the frame now needs. A new bucket is an ingest change for no behaviour.
--   * every version already extracted would have to be copied or re-ingested,
--     or the gallery would serve nothing for apps published before today.
--   * `student_app_files` indexes THIS bucket. A second bucket makes that
--     index a description of something other than what serves, which is the
--     shape of a rule that quietly stops matching.
--
-- So: one bucket, flipped.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DISCLOSES, STATED PLAINLY RATHER THAN BURIED.
--
-- 0130 gave this bucket NO policy at all, which under RLS denies every `anon`
-- and `authenticated` request by default and left `service_role` as the only
-- reader. The proxy then re-checked, on every request, three things RLS would
-- otherwise have enforced: the version belongs to the app, it is still the
-- app's `published_version_id`, and the app is not hidden.
--
-- NONE OF THOSE THREE SURVIVE THIS FILE. After it, any object in this bucket
-- is world-readable by anyone who knows both uuids -- with no session, from
-- any origin, and whatever the version's status is. That covers drafts,
-- submitted-but-unreviewed builds, rejected builds, superseded builds and the
-- builds of an app staff have hidden. A withdrawal no longer takes effect; it
-- only stops the portal from linking.
--
-- Two uuids are 244 bits and are not guessable, so this is closer to an
-- unlisted URL than to a public listing, and nothing in the gallery hands out
-- a uuid for a version that is not published. It is still not a permission,
-- and it is a real reduction from what the proxy enforced. It is applied
-- deliberately.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION, exactly, losing nothing:
--
--   drop policy if exists "foundry bundles public read" on storage.objects;
--   update storage.buckets set public = false where id = 'foundry-bundles';
--
-- After that the bucket is closed again and only `service_role` reaches it,
-- which is the state 0130 left behind. The app would then serve no bundles at
-- all, because nothing else reads them.
--
-- Apply manually in the Supabase SQL editor, after 0134.

-- ---------------------------------------------------------------------------
-- 1. The bucket flag.
--
-- Written as the 0130 upsert so a re-paste is a no-op rather than a failure,
-- and so this file does not depend on the row already existing.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('foundry-bundles', 'foundry-bundles', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- 2. The explicit SELECT policy.
--
-- The bucket flag is what makes `/storage/v1/object/public/...` serve without
-- a token; the policy is what makes a SIGNED or authenticated read of the same
-- object resolve the same way, which is the pairing `foundry-covers` already
-- carries in 0130. Without it the two paths disagree, and a reader that goes
-- through the client library gets a denial for an object the public URL serves
-- happily.
--
-- drop-then-create, which is 0130's own idiom for a policy here, so an earlier
-- draft cannot leave a differently-bodied policy of the same name behind.
-- ---------------------------------------------------------------------------

drop policy if exists "foundry bundles public read" on storage.objects;
create policy "foundry bundles public read"
	on storage.objects
	for select
	to public
	using (bucket_id = 'foundry-bundles');

-- The three names 0130 dropped defensively stay dropped: this file adds ONE
-- policy to this bucket and no other, so "which policy opened it" has exactly
-- one answer.
drop policy if exists "foundry bundles read" on storage.objects;
drop policy if exists "foundry bundles write" on storage.objects;
drop policy if exists "foundry bundles own folder" on storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Report what landed, and how much is now readable, so the operator can
--    check it against what the deployed app actually holds.
-- ---------------------------------------------------------------------------

do $$
declare
	v_public boolean;
	v_policies integer;
	v_objects bigint;
	v_versions bigint;
	v_unpublished bigint;
begin
	select public into v_public from storage.buckets where id = 'foundry-bundles';
	if v_public is null then
		raise exception '0135 did not take: the foundry-bundles bucket does not exist.';
	end if;
	if not v_public then
		raise exception '0135 did not take: foundry-bundles is still private.';
	end if;

	select count(*) into v_policies
	from pg_policies
	where schemaname = 'storage'
		and tablename = 'objects'
		and qual like '%foundry-bundles%';
	if v_policies <> 1 then
		raise exception '0135: expected exactly 1 policy naming foundry-bundles, found %', v_policies;
	end if;

	select count(*) into v_objects from storage.objects where bucket_id = 'foundry-bundles';
	select count(*) into v_versions from public.student_app_versions;
	select count(*) into v_unpublished
	from public.student_app_versions v
	join public.student_apps a on a.id = v.app_id
	where a.published_version_id is distinct from v.id;

	raise notice '0135: foundry-bundles is public. % objects are now world-readable by uuid.', v_objects;
	raise notice '0135: % versions exist; % of them are NOT the published version of their app and are readable anyway.', v_versions, v_unpublished;
end
$$;
