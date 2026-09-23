---
migration: "0220"
file: 0220_profile_identity_style.sql
sha256: 0483a3935654e9557cc0516cab9a5c3f37d9ef429ba2f7f3383a671933bbe5d6
sha256_covers: repo bytes at commit 2f26af4fb3b72a309da50c954aa806ea17d63713
applied_at: 2026-09-22
recorded_at: 2026-09-22T22:14:00.087Z
source: report
attested_by: Mr. Pina
evidence: verification-output
ledger: "0289"
recorded_by_ledger: "0295"
branch: claude/nifty-euler-shpxf0
commit: 2f26af4fb3b72a309da50c954aa806ea17d63713
outcome: applied
---

# 0220 applied by hand

**This record rests on Mr. Pina's report of 2026-09-22, not on a measurement made by this repository.** No process in this repository has ever connected to the production database. `0220_profile_identity_style.sql` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, and nothing here was observed by the tool that wrote it.

`session_user` and `database` are absent on purpose. In a record written by `tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool spoke to no server, so it has no honest value for either. The absence is the signal.

## Authorisation

- Ledger entry: `docs/prompt-ledger/entries/0289-*.md`
- `Migration permitted: not read`
- Written on `claude/nifty-euler-shpxf0`.
- Recorded, later and separately, by ledger `0295`. That bundle did not write this migration and did not apply it.

## What was reported back

As supplied to this tool, with anything shaped like a connection string masked. The values are reproduced and NOT interpreted: whether a particular `false` is a pass or a failure is a question about the query that produced it, and this tool did not write that query and did not run it.

```
== Verification query (0220 section 4), pasted result, 16 rows:
rule,conname,deployed,verdict
the accent is hex,profiles_style_accent_ck,CHECK (((style_accent_color IS NULL) OR (style_accent_color ~* '^#[0-9a-f]{6}$'::text))),PASS
the accent match is insensitive,profiles_style_accent_ck,CHECK (((style_accent_color IS NULL) OR (style_accent_color ~* '^#[0-9a-f]{6}$'::text))),PASS
the badge list is closed,profiles_style_badge_ck,"CHECK (((style_badge IS NULL) OR (style_badge = ANY (ARRAY['bolt'::text, 'flame'::text, 'star'::text, 'shield'::text, 'gear'::text, 'skull'::text, 'crown'::text, 'rocket'::text]))))",PASS
type and value appear together,profiles_style_bg_pair_ck,CHECK (((style_background_type IS NULL) = (style_background_value IS NULL))),PASS
"CONTROL, must FAIL: image accepted",profiles_style_bg_type_ck,"CHECK (((style_background_type IS NULL) OR (style_background_type = ANY (ARRAY['solid'::text, 'gradient'::text]))))",**FAIL** (rule not present)
gradient is an accepted background,profiles_style_bg_type_ck,"CHECK (((style_background_type IS NULL) OR (style_background_type = ANY (ARRAY['solid'::text, 'gradient'::text]))))",PASS
solid is an accepted background,profiles_style_bg_type_ck,"CHECK (((style_background_type IS NULL) OR (style_background_type = ANY (ARRAY['solid'::text, 'gradient'::text]))))",PASS
a gradient holds exactly two,profiles_style_bg_value_ck,CHECK (((style_background_type IS NULL) OR ((style_background_type = 'solid'::text) AND (jsonb_typeof(style_background_value) = 'string'::text) AND ((style_background_value #>> '{}'::text[]) ~* '^#[0-9a-f]{6}$'::text)) OR ((style_background_type = 'gradient'::text) AND (jsonb_typeof(style_background_value) = 'array'::text) AND (jsonb_array_length(style_background_value) = 2) AND ((style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'::text) AND ((style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'::text)))),PASS
a gradient value must be an array,profiles_style_bg_value_ck,CHECK (((style_background_type IS NULL) OR ((style_background_type = 'solid'::text) AND (jsonb_typeof(style_background_value) = 'string'::text) AND ((style_background_value #>> '{}'::text[]) ~* '^#[0-9a-f]{6}$'::text)) OR ((style_background_type = 'gradient'::text) AND (jsonb_typeof(style_background_value) = 'array'::text) AND (jsonb_array_length(style_background_value) = 2) AND ((style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'::text) AND ((style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'::text)))),PASS
a solid value must be a string,profiles_style_bg_value_ck,CHECK (((style_background_type IS NULL) OR ((style_background_type = 'solid'::text) AND (jsonb_typeof(style_background_value) = 'string'::text) AND ((style_background_value #>> '{}'::text[]) ~* '^#[0-9a-f]{6}$'::text)) OR ((style_background_type = 'gradient'::text) AND (jsonb_typeof(style_background_value) = 'array'::text) AND (jsonb_array_length(style_background_value) = 2) AND ((style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'::text) AND ((style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'::text)))),PASS
background colours are hex,profiles_style_bg_value_ck,CHECK (((style_background_type IS NULL) OR ((style_background_type = 'solid'::text) AND (jsonb_typeof(style_background_value) = 'string'::text) AND ((style_background_value #>> '{}'::text[]) ~* '^#[0-9a-f]{6}$'::text)) OR ((style_background_type = 'gradient'::text) AND (jsonb_typeof(style_background_value) = 'array'::text) AND (jsonb_array_length(style_background_value) = 2) AND ((style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'::text) AND ((style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'::text)))),PASS
confetti is NOT allowed,profiles_style_flourish_ck,"CHECK (((style_flourish IS NULL) OR (style_flourish = ANY (ARRAY['glow-pulse'::text, 'particle-trail'::text]))))",PASS
glow-pulse is an allowed flourish,profiles_style_flourish_ck,"CHECK (((style_flourish IS NULL) OR (style_flourish = ANY (ARRAY['glow-pulse'::text, 'particle-trail'::text]))))",PASS
particle-trail is allowed,profiles_style_flourish_ck,"CHECK (((style_flourish IS NULL) OR (style_flourish = ANY (ARRAY['glow-pulse'::text, 'particle-trail'::text]))))",PASS
the tagline is capped at 48,profiles_style_tagline_ck,CHECK (((style_tagline IS NULL) OR ((char_length(style_tagline) >= 1) AND (char_length(style_tagline) <= 48)))),PASS
the tagline refuses empty,profiles_style_tagline_ck,CHECK (((style_tagline IS NULL) OR ((char_length(style_tagline) >= 1) AND (char_length(style_tagline) <= 48)))),**FAIL** (rule not present)
== Supplementary catalog read (0220_profile_identity_style), pasted result:
kind,name,detail,present
column,style_accent_color,text,true
column,style_background_type,text,true
column,style_background_value,jsonb,true
column,style_badge,text,true
column,style_flourish,text,true
column,style_tagline,text,true
constraint,profiles_style_accent_ck,CHECK (((style_accent_color IS NULL) OR (style_accent_color ~* '^#[0-9a-f]{6}$'::text))),true
constraint,profiles_style_badge_ck,"CHECK (((style_badge IS NULL) OR (style_badge = ANY (ARRAY['bolt'::text, 'flame'::text, 'star'::text, 'shield'::text, 'gear'::text, 'skull'::text, 'crown'::text, 'rocket'::text]))))",true
constraint,profiles_style_bg_pair_ck,CHECK (((style_background_type IS NULL) = (style_background_value IS NULL))),true
constraint,profiles_style_bg_type_ck,"CHECK (((style_background_type IS NULL) OR (style_background_type = ANY (ARRAY['solid'::text, 'gradient'::text]))))",true
constraint,profiles_style_bg_value_ck,CHECK (((style_background_type IS NULL) OR ((style_background_type = 'solid'::text) AND (jsonb_typeof(style_background_value) = 'string'::text) AND ((style_background_value #>> '{}'::text[]) ~* '^#[0-9a-f]{6}$'::text)) OR ((style_background_type = 'gradient'::text) AND (jsonb_typeof(style_background_value) = 'array'::text) AND (jsonb_array_length(style_background_value) = 2) AND ((style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'::text) AND ((style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'::text)))),true
constraint,profiles_style_flourish_ck,"CHECK (((style_flourish IS NULL) OR (style_flourish = ANY (ARRAY['glow-pulse'::text, 'particle-trail'::text]))))",true
constraint,profiles_style_tagline_ck,CHECK (((style_tagline IS NULL) OR ((char_length(style_tagline) >= 1) AND (char_length(style_tagline) <= 48)))),true
```

Two rows of the 16-row verification table read **FAIL**, and neither is a missing rule. (1) "CONTROL, must FAIL: image accepted" is the planted control: it looks for image among the accepted background types, which 0220 refuses by design; its FAIL proves the matcher is looking. (2) "the tagline refuses empty" is a defect in the verification QUERY, not the migration. 0220 writes char_length(style_tagline) between 1 and 48; Postgres stores and renders that as (char_length(style_tagline) >= 1) AND (char_length(style_tagline) <= 48), so the probe pattern %1 AND 48% matches the source text and never the rendered definition. The deployed definition in that same row, and in the supplementary catalog read, is CHECK (((style_tagline IS NULL) OR ((char_length(style_tagline) >= 1) AND (char_length(style_tagline) <= 48)))), which refuses an empty tagline. Confirmed by ledger 0295 against the deployed column, not taken on report. Separately, the row "confetti is NOT allowed" PASSES VACUOUSLY: its pattern %glow-pulse% would match even if confetti were allowed. The rule holds anyway, because the deployed array lists only glow-pulse and particle-trail. The 0220 file is left unedited because it is applied and its text must match what ran. The authorising ledger (0289, "Migration permitted: yes, exactly one, number 0220") was passed with --ledger because its entry carries no parseable Claims: field.

## What a verification query would cover

No probe could be derived for this file, so this record names no object list. `tools/idea-status.py` derives a probe from a migration's FIRST object and answers nothing for some shapes; that is a limit of the derivation and not a claim about the file.

## What this record does not prove

That the migration was a good idea, that a backfill inside it did the right thing, or that the database still holds what it held on the day above. It is one person's report, written down where the next session can find it instead of nowhere.
