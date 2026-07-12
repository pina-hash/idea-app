-- 0044_fsp_qa_anon.sql
-- FSP live Q&A: anonymous submission support.
--
-- Builds directly on 0043. A student can now choose to submit a question
-- anonymously (no name kept) or attributed with an optional display name.
-- Nothing else changes: no RLS policy, table grant, other RPC, or the realtime
-- publication is touched -- the two new columns ride the existing
-- fsp_questions realtime stream for free.
--
-- Columns added to fsp_questions:
--   is_anonymous   -- true = submitted anonymously; submitter_name forced NULL.
--   submitter_name -- optional display name for an attributed submission; NULL
--                     when anonymous (and for every pre-migration row).
--
-- Apply manually in the Supabase SQL editor, after 0043. Idempotent where
-- practical.

-- ---------------------------------------------------------------------------
-- fsp_questions: anonymity flag + optional attributed name.
-- Existing rows backfill to is_anonymous = false / submitter_name = NULL, which
-- matches their prior meaning (attributed, no name was ever captured).
-- ---------------------------------------------------------------------------
alter table public.fsp_questions
	add column if not exists is_anonymous boolean not null default false;

alter table public.fsp_questions
	add column if not exists submitter_name text default null;

-- ---------------------------------------------------------------------------
-- submit_fsp_question: widened to carry the anonymity choice. Still the ONLY
-- write path into fsp_questions, still SECURITY DEFINER, still stamping
-- created_at / answered = false server-side and returning the new row id.
--
-- The 0043 two-argument version is dropped first. The new signature appends
-- p_is_anonymous / p_submitter_name (both defaulted), so leaving the old
-- (text, text) overload in place would make an existing two-argument call --
-- the /fsp/ask client, which passes only p_question + p_session_id -- ambiguous
-- between the two functions. Dropping it leaves exactly one submit_fsp_question,
-- so every current caller resolves to this definition unchanged (the two new
-- parameters fall back to their defaults).
--
-- Anonymity rule:
--   p_is_anonymous = true  -> is_anonymous = true,  submitter_name = NULL
--                             (p_submitter_name is ignored entirely).
--   p_is_anonymous = false -> is_anonymous = false, submitter_name =
--                             p_submitter_name.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_fsp_question(text, text);

create or replace function public.submit_fsp_question(
	p_question text,
	p_session_id text,
	p_is_anonymous boolean default false,
	p_submitter_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_question text := btrim(coalesce(p_question, ''));
	v_session text := btrim(coalesce(p_session_id, ''));
	v_anon boolean := coalesce(p_is_anonymous, false);
	v_name text;
begin
	if v_uid is null then
		raise exception 'You must be signed in to submit a question';
	end if;
	if v_question = '' then
		raise exception 'Question cannot be empty';
	end if;
	if v_session = '' then
		raise exception 'No active session';
	end if;

	-- An anonymous submission never keeps a name, even if one was passed.
	if v_anon then
		v_name := null;
	else
		v_name := p_submitter_name;
	end if;

	insert into public.fsp_questions (question, session_id, is_anonymous, submitter_name)
	values (v_question, v_session, v_anon, v_name)
	returning id into v_id;

	return v_id;
end;
$$;

revoke all on function public.submit_fsp_question(text, text, boolean, text) from public;
grant execute on function public.submit_fsp_question(text, text, boolean, text) to authenticated;
