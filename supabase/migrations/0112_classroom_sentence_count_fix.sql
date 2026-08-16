-- Fixes _classroom_sentence_count (0086) to stop counting decimal points,
-- ellipses, and common title/abbreviation periods as sentence breaks.
--
-- countSentences in src/lib/classroom/assignment-spec.ts is the client mirror
-- and MUST match this function exactly -- change both together, or the live
-- counter students see will disagree with the submit preflight this function
-- backs (_classroom_spec_unmet reads it to decide whether a text block meets
-- its minSentences requirement).
--
-- Same signature as 0086's version, so this is a plain `create or replace`,
-- no drop needed.

create or replace function public._classroom_sentence_count(p_text text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from regexp_split_to_table(
		-- Common titles/abbreviations never end a sentence.
		regexp_replace(
			-- "i.e." carries an internal period too; collapse it whole before
			-- the generic abbreviation pass, or that inner period would still
			-- read as a break.
			regexp_replace(
				-- Same for "e.g.".
				regexp_replace(
					-- A period between two digits is a decimal point
					-- (3.5, 3.3.3.3), never a sentence end.
					regexp_replace(
						-- An ellipsis is a pause, not a full stop -- collapse
						-- any run of 2+ dots to one protected marker.
						regexp_replace(coalesce(p_text, ''), '\.{2,}', chr(1), 'g'),
						'(\d)\.(?=\d)', '\1' || chr(1), 'g'
					),
					'\ye\.g\.', 'eg' || chr(1), 'gi'
				),
				'\yi\.e\.', 'ie' || chr(1), 'gi'
			),
			'\y(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|fig|vol|ed|eds|al)\.',
			'\1' || chr(1), 'gi'
		),
		'[.!?]+'
	) s
	where s ~ '[A-Za-z0-9]';
$$;

revoke all on function public._classroom_sentence_count(text) from public;
