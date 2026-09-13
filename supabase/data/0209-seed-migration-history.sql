-- supabase/data/0209-seed-migration-history.sql
--
-- ONE-TIME. Pasted once, by hand, in the Supabase SQL editor, and never again.
-- It is safe to paste a second time; it will simply report the same thing.
--
-- ===========================================================================
-- WHAT THIS WRITES, ON ITS FACE
-- ===========================================================================
-- ONE CATALOG TABLE AND NOTHING ELSE: supabase_migrations.schema_migrations,
-- which is the Supabase CLI's own record of which migration files a database
-- has had applied to it. NO APPLICATION TABLE IS READ AND NONE IS WRITTEN.
-- There is no coin row, no profile, no classroom item and no storage object
-- anywhere in this file.
--
-- You can confirm that by reading it rather than by trusting this paragraph.
-- The whole file is seven statements and there are no others:
--
--   1. create schema if not exists supabase_migrations
--   2. create table if not exists supabase_migrations.schema_migrations
--   3. alter table ... add column if not exists statements
--   4. alter table ... add column if not exists name
--   5. insert into supabase_migrations.schema_migrations ... (0001 to 0210)
--   6. insert into supabase_migrations.schema_migrations ... (0211, conditional)
--   7. select ...   (the verification, which writes nothing)
--
-- Statements 5 and 6 are the only writes of data in the file and both name
-- their target on their own line. Statements 1 through 4 create; none of them
-- drops anything. Statement 6 READS one catalog view to decide, and that read
-- is of pg_catalog, not of an application table.
--
-- THERE IS NOT ONE DOLLAR SIGN IN THIS FILE, in a comment or anywhere else.
-- A dollar-quote token inside a `--` comment balances in Postgres and breaks
-- the Supabase editor's client-side statement splitter, which cost migration
-- 0194 a full apply cycle. This file cannot hit that trap because it has no
-- `do` block and needs no dollar quoting at all.
--
-- ===========================================================================
-- WHY IT EXISTS
-- ===========================================================================
-- This project's database has never been touched by the Supabase CLI, so it
-- has no supabase_migrations.schema_migrations table. Measured 2026-08-23
-- against the live project: `supabase migration list --linked` came back with
-- an empty `remote` column for every local file, and the reason one level down
-- was `ERROR: 42P01: relation "supabase_migrations.schema_migrations" does not
-- exist`.
--
-- The consequence is that `supabase db push` believes NOTHING is applied. Its
-- --dry-run planned the entire chain from 0001 against a database that already
-- had every one of those files applied, which would have replayed two one-time
-- imports over real student coin data:
--
--     supabase/migrations/0084_coin_legacy_import.sql
--     supabase/migrations/0100_coin_legacy_reimport.sql
--
-- Refusing that was right. What it cost is that nothing in the repository, and
-- nothing in CI, could say what production actually has -- so every applied
-- state question was answered by probing the catalog object by object, which
-- is SILENT for any migration whose objects cannot be derived, and five lanes
-- stopped at that gate in one week.
--
-- This file closes it by writing down what is already true. After it runs, the
-- database's own record matches reality, `db push` has nothing to replay, and
-- `.github/workflows/migrate.yml` keeps the record current by inserting one row
-- inside the same transaction as each migration it applies.
--
-- ===========================================================================
-- WHAT IS IN THE LIST, AND WHAT IS DELIBERATELY NOT
-- ===========================================================================
-- Statement 5 lists every migration file in supabase/migrations/ as of this
-- commit EXCEPT 0211: 208 files, 0001 through 0210. That is the set the
-- repository itself can vouch for -- docs/migrations-applied/ carries a record
-- for every one of 0193 through 0210, and everything below 0193 predates that
-- directory and was hand-applied over the life of the project.
--
-- 0211 IS NOT IN THAT LIST AND IS ASKED ABOUT INSTEAD.
-- docs/migrations-applied/0211-lucid-dirac-8b6m2f.md says it IS applied, and
-- says on its own face that it rests on Mr. Pina's report of 2026-09-13 rather
-- than on a measurement -- `source: report`, `evidence: verification-output`.
-- Ledger 0203, which wrote the migration, says in words that it was "DELIVERED
-- AND NOT APPLIED", because it was written before he pasted it. The bundle that
-- wrote THIS file could check neither: no cloud session can reach this
-- database.
--
-- Seeding a row for a migration that is NOT applied is the one failure this
-- file could cause that nothing would ever report. The row would tell every
-- later reader the database has something it does not, and
-- .github/workflows/migrate.yml would skip it forever. Under-seeding costs
-- nothing by comparison. So statement 6 asks the database itself, through the
-- object 0211 creates, and inserts the row only if the answer is yes. Either
-- answer is reported at the foot of this file. On the evidence above the answer
-- is expected to be yes, and asking costs one catalog read.
--
-- 0190 AND 0191 ARE NOT IN THE LIST AND MUST NOT BE. They are permanent holes
-- in the numbering -- bundles that were allocated a number and decided against
-- writing a migration. There is no 0190 file and no 0191 file, there never was,
-- and the gap is not unapplied work. The verification confirms both are absent
-- and says so in a row of its own, so the gap reads as a decision rather than
-- as something this file forgot.
--
-- A MIGRATION NUMBERED ABOVE 0211 IS NOT THIS FILE'S TO SPEAK FOR. If one has
-- landed in the repository and been applied by hand between this commit and the
-- paste, it will not be listed here and the verification will say so in words.
-- docs/MIGRATIONS.md, "If the verification reports a difference", says what to
-- do about it.
--
-- The `statements` column is left null for every row, deliberately. The CLI
-- only reads `version` to decide what a database already has; `statements` is
-- the text it recorded when IT applied something, and this file applied
-- nothing. A null there is honest and an invented value would not be.

-- ---------------------------------------------------------------------------
-- 1-4. The table, in the shape the CLI uses. Nothing here drops anything, and
-- every statement is safe to run over a database that already has it.
-- ---------------------------------------------------------------------------

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
	version text not null primary key,
	statements text[],
	name text
);

alter table supabase_migrations.schema_migrations
	add column if not exists statements text[];

alter table supabase_migrations.schema_migrations
	add column if not exists name text;

-- ---------------------------------------------------------------------------
-- 5. THE WRITE. One row per migration file from 0001 to 0210, on conflict do
-- nothing, so a second paste writes zero rows and a row already there is never
-- overwritten.
--
-- `on conflict do nothing` is written WITHOUT a conflict target on purpose: it
-- then needs no assumption about which constraint the table carries, and is
-- correct on a table this file created and on one that was already there.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name)
select v.version, v.name
from (values
    ('0001', 'profiles'),
    ('0002', 'vanguard_saves'),
    ('0003', 'profile_section'),
    ('0004', 'gauntlet'),
    ('0005', 'gauntlet_speedrun'),
    ('0006', 'gauntlet_macro'),
    ('0007', 'gauntlet_modeling_modes'),
    ('0008', 'gauntlet_knowledge_modes'),
    ('0009', 'gauntlet_authoring'),
    ('0010', 'gauntlet_rooms'),
    ('0011', 'gauntlet_gdt_seed'),
    ('0012', 'gauntlet_spot_seed'),
    ('0013', 'gauntlet_spot_fix_explanation'),
    ('0014', 'vanguard_runs'),
    ('0015', 'gauntlet_speedrun_formalize'),
    ('0016', 'gauntlet_speedrun_start'),
    ('0017', 'gauntlet_run_status'),
    ('0018', 'gauntlet_speedrun_units'),
    ('0019', 'gauntlet_purge_demo'),
    ('0020', 'profiles_identity'),
    ('0021', 'gauntlet_progression'),
    ('0022', 'gauntlet_drawing_series'),
    ('0023', 'gauntlet_reveal_focus_regions'),
    ('0024', 'gauntlet_leaderboards'),
    ('0025', 'gauntlet_room_delete'),
    ('0026', 'gauntlet_material_gate'),
    ('0027', 'gauntlet_material_density_gate'),
    ('0028', 'gauntlet_room_code_and_host_play'),
    ('0029', 'gauntlet_drop_tiers'),
    ('0030', 'gauntlet_unit_system'),
    ('0031', 'gauntlet_tools_bucket'),
    ('0032', 'vanguard_run_state'),
    ('0033', 'gauntlet_speedrun_attempts'),
    ('0034', 'gauntlet_volume_only_verification'),
    ('0035', 'gauntlet_run_events'),
    ('0036', 'gauntlet_volume_tolerance_0_1'),
    ('0037', 'vanguard_run_state_per_mode'),
    ('0038', 'profile_pathway'),
    ('0039', 'frc_user_progress'),
    ('0040', 'frc_quiz'),
    ('0041', 'frc_progress_lockdown'),
    ('0042', 'frc_gate_submissions'),
    ('0043', 'fsp_qa'),
    ('0044', 'fsp_qa_anon'),
    ('0045', 'profile_tour'),
    ('0046', 'fsp_frc_interest'),
    ('0047', 'fsp_frc_interest_parent_email'),
    ('0048', 'fsp_item_opens'),
    ('0049', 'greenline_accounts'),
    ('0050', 'greenline_loadout_slots'),
    ('0051', 'greenline_decals'),
    ('0052', 'greenline_economy'),
    ('0053', 'app_feedback'),
    ('0054', 'greenline_race_telemetry'),
    ('0055', 'greenline_phase8g_weapon_prices'),
    ('0056', 'greenline_aero_part_prices'),
    ('0057', 'greenline_community_tracks'),
    ('0058', 'greenline_track_featuring'),
    ('0059', 'greenline_track_review'),
    ('0060', 'gauntlet_view_scoping'),
    ('0061', 'gauntlet_target_disclosure'),
    ('0062', 'tournaments'),
    ('0063', 'tournament_push_rewards'),
    ('0064', 'tournament_entry_styles'),
    ('0065', 'tournament_forfeits'),
    ('0066', 'tournament_delete'),
    ('0067', 'admin_tier'),
    ('0068', 'tournament_delete_payout_ack'),
    ('0069', 'notebook'),
    ('0070', 'coin_economy'),
    ('0071', 'notebook_optional_label'),
    ('0072', 'coin_my_eating_pass_status'),
    ('0073', 'coin_sections'),
    ('0074', 'coin_roles'),
    ('0075', 'notebook_optional_photo'),
    ('0076', 'coin_role_quiz_and_expiration'),
    ('0077', 'coin_contracts'),
    ('0078', 'notebook_entry_notes'),
    ('0079', 'coin_bulk_payout'),
    ('0080', 'coin_category_admin'),
    ('0081', 'coin_debt_payment'),
    ('0082', 'classroom'),
    ('0083', 'classroom_management'),
    ('0084', 'coin_legacy_import'),
    ('0085', 'classroom_canonical_items'),
    ('0086', 'classroom_assignment_engine'),
    ('0087', 'coin_weekly_wage_tier'),
    ('0088', 'notebook_folders'),
    ('0089', 'coin_public_ledger'),
    ('0090', 'classroom_instructor_materials'),
    ('0091', 'notebook_pin_and_activity'),
    ('0092', 'classroom_reference_specs'),
    ('0093', 'short_links'),
    ('0094', 'notebook_classroom_sections'),
    ('0095', 'classroom_leveled_rubrics'),
    ('0096', 'coin_medium'),
    ('0097', 'notebook_documentation_check'),
    ('0098', 'notebook_session_postings'),
    ('0099', 'notebook_view_as'),
    ('0100', 'coin_legacy_reimport'),
    ('0101', 'classroom_decks'),
    ('0102', 'classroom_deck_uploads'),
    ('0103', 'coin_public_medium_display'),
    ('0104', 'classroom_edit_visibility'),
    ('0105', 'classroom_deck_ingest'),
    ('0106', 'notebook_instructor_student_access'),
    ('0107', 'coin_public_adjustment_bucket'),
    ('0108', 'classroom_rich_body'),
    ('0109', 'classroom_scheduled_posting'),
    ('0110', 'classroom_content_revisions'),
    ('0111', 'classroom_units'),
    ('0112', 'classroom_sentence_count_fix'),
    ('0113', 'classroom_view_as_body_doc_units'),
    ('0114', 'notebook_note_entry_session'),
    ('0115', 'coin_bulk_log_students'),
    ('0116', 'notebook_soft_delete'),
    ('0117', 'notebook_soft_delete_restore'),
    ('0118', 'notebook_draft_state'),
    ('0119', 'notebook_note_delete'),
    ('0120', 'notebook_session_item_link'),
    ('0121', 'notebook_review_acknowledged'),
    ('0122', 'rich_text_nested_lists'),
    ('0123', 'notebook_session_guidance'),
    ('0124', 'drop_orphaned_view_as'),
    ('0125', 'notebook_run_text_parity'),
    ('0126', 'app_feedback_anonymous'),
    ('0127', 'app_feedback_console_anonymous'),
    ('0128', 'classroom_instructor_copy'),
    ('0129', 'notebook_note_coalesce'),
    ('0130', 'foundry'),
    ('0131', 'foundry_service_role_writes'),
    ('0132', 'foundry_author_class'),
    ('0133', 'classroom_storage_attachments'),
    ('0134', 'classroom_submission_open_race'),
    ('0135', 'classroom_instructor_storage_and_public_attachments'),
    ('0136', 'foundry_delete'),
    ('0137', 'anon_execute_sweep'),
    ('0138', 'classroom_manager_exclusion_and_enrollment_removal'),
    ('0139', 'foundry_telemetry'),
    ('0140', 'notebook_scheduled_check_ins'),
    ('0141', 'foundry_app_cap_and_download'),
    ('0142', 'classroom_course_categories'),
    ('0143', 'classroom_hall_pass'),
    ('0144', 'classroom_hall_pass_close_by_id'),
    ('0145', 'classroom_song_queue'),
    ('0146', 'gauntlet_reveal_all_modeling_modes'),
    ('0147', 'gauntlet_close_target_disclosure'),
    ('0148', 'gauntlet_knowledge_clock'),
    ('0149', 'grant_surface_reconciliation'),
    ('0150', 'gauntlet_connect_run_analysis'),
    ('0151', 'gauntlet_meter_practice'),
    ('0152', 'gauntlet_run_review'),
    ('0153', 'gauntlet_unpublish_the_target'),
    ('0154', 'gauntlet_rank_what_is_checkable'),
    ('0155', 'gauntlet_authoring_tier'),
    ('0156', 'short_link_reserved_names'),
    ('0157', 'coin_public_surface_hardening'),
    ('0158', 'gauntlet_submit_reconcile'),
    ('0159', 'classroom_duplicate_carries_the_spec'),
    ('0160', 'classroom_submit_incomplete_work'),
    ('0161', 'maps_core'),
    ('0162', 'maps_search'),
    ('0163', 'maps_media'),
    ('0164', 'maps_search_log_retention'),
    ('0165', 'maps_search_conjunctive_tsquery'),
    ('0166', 'short_link_reserve_maps'),
    ('0167', 'frc_reviewer_tier'),
    ('0168', 'maps_media_types_and_plan_frame'),
    ('0169', 'notebook_section_reviewer_tier'),
    ('0170', 'feedback_tried_and_screenshot'),
    ('0171', 'classroom_extra_credit'),
    ('0172', 'maps_editor_grants'),
    ('0173', 'foundry_section_gate_description_and_trust'),
    ('0174', 'classroom_hall_pass_limits'),
    ('0175', 'classroom_bulk_grading'),
    ('0176', 'classroom_item_images'),
    ('0177', 'reserved_number_tombstone'),
    ('0178', 'classroom_doc_text_image_alt'),
    ('0179', 'classroom_roster_avatar'),
    ('0180', 'notebook_grid_avatar'),
    ('0181', 'avatars_private'),
    ('0182', 'classroom_submission_object_lock'),
    ('0183', 'foundry_covers_private'),
    ('0184', 'gauntlet_run_event_bounds'),
    ('0185', 'bucket_limits_under_the_global'),
    ('0186', 'maps_media_no_anon_listing'),
    ('0187', 'classroom_duplicate_drafts'),
    ('0188', 'song_spotify_and_feedback_spam'),
    ('0189', 'tournament_thumbs_no_anon_listing'),
    ('0192', 'tournament_entry_members_and_admin_hosts'),
    ('0193', 'classroom_resource_layout'),
    ('0194', 'gauntlet_verification_floor'),
    ('0195', 'classroom_html_assignments'),
    ('0196', 'short_link_reserve_hx'),
    ('0197', 'classroom_html_assignment_write_gate'),
    ('0198', 'classroom_close_assignment'),
    ('0199', 'classroom_html_instructor_write_gate'),
    ('0200', 'classroom_presence'),
    ('0201', 'ideacad_blade_editor'),
    ('0202', 'ideacad_anon_grant_repair'),
    ('0203', 'sequence_anon_grant_sweep'),
    ('0204', 'foundry_description_optional_and_public_play_stats'),
    ('0205', 'ideacad_document_sharing'),
    ('0206', 'ideacad_grant_guard'),
    ('0207', 'ideacad_assembly_parts'),
    ('0208', 'ideacad_materials'),
    ('0209', 'ideacad_history'),
    ('0210', 'notebook_note_grid')
) as v(version, name)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. 0211, CONDITIONALLY, ON THE DATABASE'S OWN ANSWER.
--
-- `supabase/migrations/0211_ideacad_realtime_policy.sql` creates
-- `public._ideacad_realtime_topic_id(text, text)`. If that function is here,
-- 0211 was applied and the row belongs. If it is not, 0211 has not been applied
-- and writing the row would tell every later reader otherwise.
--
-- `tools/idea-status.py` derives no probe for 0211 at all, which is why this is
-- written out by hand rather than delegated: the machine is silent about this
-- one migration, and a silence is not a yes.
-- ---------------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name)
select '0211', 'ideacad_realtime_policy'
where exists (
	select 1
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = '_ideacad_realtime_topic_id'
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 7. THE VERIFICATION. It returns rows -- always, including when everything is
-- correct -- because the Supabase SQL editor displays no `raise notice` and no
-- `raise warning`, and shows only the LAST statement's result set. A file that
-- reported itself through notices would report nothing at all, which cost a
-- full cycle on 2026-09-13.
--
-- It names what it examined, and it compares in BOTH directions: every version
-- this file lists against every version now in the table. A count is not an
-- answer, so a difference is reported as one row per version, by name.
--
-- READ THE FIRST ROW. `check` = `VERDICT`. If it says EQUAL, statement 5 is
-- complete. Then read the `0211` row, which is a separate question and has a
-- separate answer.
-- ---------------------------------------------------------------------------

with expected(version, name) as (
	values
		('0001', 'profiles'),
		('0002', 'vanguard_saves'),
		('0003', 'profile_section'),
		('0004', 'gauntlet'),
		('0005', 'gauntlet_speedrun'),
		('0006', 'gauntlet_macro'),
		('0007', 'gauntlet_modeling_modes'),
		('0008', 'gauntlet_knowledge_modes'),
		('0009', 'gauntlet_authoring'),
		('0010', 'gauntlet_rooms'),
		('0011', 'gauntlet_gdt_seed'),
		('0012', 'gauntlet_spot_seed'),
		('0013', 'gauntlet_spot_fix_explanation'),
		('0014', 'vanguard_runs'),
		('0015', 'gauntlet_speedrun_formalize'),
		('0016', 'gauntlet_speedrun_start'),
		('0017', 'gauntlet_run_status'),
		('0018', 'gauntlet_speedrun_units'),
		('0019', 'gauntlet_purge_demo'),
		('0020', 'profiles_identity'),
		('0021', 'gauntlet_progression'),
		('0022', 'gauntlet_drawing_series'),
		('0023', 'gauntlet_reveal_focus_regions'),
		('0024', 'gauntlet_leaderboards'),
		('0025', 'gauntlet_room_delete'),
		('0026', 'gauntlet_material_gate'),
		('0027', 'gauntlet_material_density_gate'),
		('0028', 'gauntlet_room_code_and_host_play'),
		('0029', 'gauntlet_drop_tiers'),
		('0030', 'gauntlet_unit_system'),
		('0031', 'gauntlet_tools_bucket'),
		('0032', 'vanguard_run_state'),
		('0033', 'gauntlet_speedrun_attempts'),
		('0034', 'gauntlet_volume_only_verification'),
		('0035', 'gauntlet_run_events'),
		('0036', 'gauntlet_volume_tolerance_0_1'),
		('0037', 'vanguard_run_state_per_mode'),
		('0038', 'profile_pathway'),
		('0039', 'frc_user_progress'),
		('0040', 'frc_quiz'),
		('0041', 'frc_progress_lockdown'),
		('0042', 'frc_gate_submissions'),
		('0043', 'fsp_qa'),
		('0044', 'fsp_qa_anon'),
		('0045', 'profile_tour'),
		('0046', 'fsp_frc_interest'),
		('0047', 'fsp_frc_interest_parent_email'),
		('0048', 'fsp_item_opens'),
		('0049', 'greenline_accounts'),
		('0050', 'greenline_loadout_slots'),
		('0051', 'greenline_decals'),
		('0052', 'greenline_economy'),
		('0053', 'app_feedback'),
		('0054', 'greenline_race_telemetry'),
		('0055', 'greenline_phase8g_weapon_prices'),
		('0056', 'greenline_aero_part_prices'),
		('0057', 'greenline_community_tracks'),
		('0058', 'greenline_track_featuring'),
		('0059', 'greenline_track_review'),
		('0060', 'gauntlet_view_scoping'),
		('0061', 'gauntlet_target_disclosure'),
		('0062', 'tournaments'),
		('0063', 'tournament_push_rewards'),
		('0064', 'tournament_entry_styles'),
		('0065', 'tournament_forfeits'),
		('0066', 'tournament_delete'),
		('0067', 'admin_tier'),
		('0068', 'tournament_delete_payout_ack'),
		('0069', 'notebook'),
		('0070', 'coin_economy'),
		('0071', 'notebook_optional_label'),
		('0072', 'coin_my_eating_pass_status'),
		('0073', 'coin_sections'),
		('0074', 'coin_roles'),
		('0075', 'notebook_optional_photo'),
		('0076', 'coin_role_quiz_and_expiration'),
		('0077', 'coin_contracts'),
		('0078', 'notebook_entry_notes'),
		('0079', 'coin_bulk_payout'),
		('0080', 'coin_category_admin'),
		('0081', 'coin_debt_payment'),
		('0082', 'classroom'),
		('0083', 'classroom_management'),
		('0084', 'coin_legacy_import'),
		('0085', 'classroom_canonical_items'),
		('0086', 'classroom_assignment_engine'),
		('0087', 'coin_weekly_wage_tier'),
		('0088', 'notebook_folders'),
		('0089', 'coin_public_ledger'),
		('0090', 'classroom_instructor_materials'),
		('0091', 'notebook_pin_and_activity'),
		('0092', 'classroom_reference_specs'),
		('0093', 'short_links'),
		('0094', 'notebook_classroom_sections'),
		('0095', 'classroom_leveled_rubrics'),
		('0096', 'coin_medium'),
		('0097', 'notebook_documentation_check'),
		('0098', 'notebook_session_postings'),
		('0099', 'notebook_view_as'),
		('0100', 'coin_legacy_reimport'),
		('0101', 'classroom_decks'),
		('0102', 'classroom_deck_uploads'),
		('0103', 'coin_public_medium_display'),
		('0104', 'classroom_edit_visibility'),
		('0105', 'classroom_deck_ingest'),
		('0106', 'notebook_instructor_student_access'),
		('0107', 'coin_public_adjustment_bucket'),
		('0108', 'classroom_rich_body'),
		('0109', 'classroom_scheduled_posting'),
		('0110', 'classroom_content_revisions'),
		('0111', 'classroom_units'),
		('0112', 'classroom_sentence_count_fix'),
		('0113', 'classroom_view_as_body_doc_units'),
		('0114', 'notebook_note_entry_session'),
		('0115', 'coin_bulk_log_students'),
		('0116', 'notebook_soft_delete'),
		('0117', 'notebook_soft_delete_restore'),
		('0118', 'notebook_draft_state'),
		('0119', 'notebook_note_delete'),
		('0120', 'notebook_session_item_link'),
		('0121', 'notebook_review_acknowledged'),
		('0122', 'rich_text_nested_lists'),
		('0123', 'notebook_session_guidance'),
		('0124', 'drop_orphaned_view_as'),
		('0125', 'notebook_run_text_parity'),
		('0126', 'app_feedback_anonymous'),
		('0127', 'app_feedback_console_anonymous'),
		('0128', 'classroom_instructor_copy'),
		('0129', 'notebook_note_coalesce'),
		('0130', 'foundry'),
		('0131', 'foundry_service_role_writes'),
		('0132', 'foundry_author_class'),
		('0133', 'classroom_storage_attachments'),
		('0134', 'classroom_submission_open_race'),
		('0135', 'classroom_instructor_storage_and_public_attachments'),
		('0136', 'foundry_delete'),
		('0137', 'anon_execute_sweep'),
		('0138', 'classroom_manager_exclusion_and_enrollment_removal'),
		('0139', 'foundry_telemetry'),
		('0140', 'notebook_scheduled_check_ins'),
		('0141', 'foundry_app_cap_and_download'),
		('0142', 'classroom_course_categories'),
		('0143', 'classroom_hall_pass'),
		('0144', 'classroom_hall_pass_close_by_id'),
		('0145', 'classroom_song_queue'),
		('0146', 'gauntlet_reveal_all_modeling_modes'),
		('0147', 'gauntlet_close_target_disclosure'),
		('0148', 'gauntlet_knowledge_clock'),
		('0149', 'grant_surface_reconciliation'),
		('0150', 'gauntlet_connect_run_analysis'),
		('0151', 'gauntlet_meter_practice'),
		('0152', 'gauntlet_run_review'),
		('0153', 'gauntlet_unpublish_the_target'),
		('0154', 'gauntlet_rank_what_is_checkable'),
		('0155', 'gauntlet_authoring_tier'),
		('0156', 'short_link_reserved_names'),
		('0157', 'coin_public_surface_hardening'),
		('0158', 'gauntlet_submit_reconcile'),
		('0159', 'classroom_duplicate_carries_the_spec'),
		('0160', 'classroom_submit_incomplete_work'),
		('0161', 'maps_core'),
		('0162', 'maps_search'),
		('0163', 'maps_media'),
		('0164', 'maps_search_log_retention'),
		('0165', 'maps_search_conjunctive_tsquery'),
		('0166', 'short_link_reserve_maps'),
		('0167', 'frc_reviewer_tier'),
		('0168', 'maps_media_types_and_plan_frame'),
		('0169', 'notebook_section_reviewer_tier'),
		('0170', 'feedback_tried_and_screenshot'),
		('0171', 'classroom_extra_credit'),
		('0172', 'maps_editor_grants'),
		('0173', 'foundry_section_gate_description_and_trust'),
		('0174', 'classroom_hall_pass_limits'),
		('0175', 'classroom_bulk_grading'),
		('0176', 'classroom_item_images'),
		('0177', 'reserved_number_tombstone'),
		('0178', 'classroom_doc_text_image_alt'),
		('0179', 'classroom_roster_avatar'),
		('0180', 'notebook_grid_avatar'),
		('0181', 'avatars_private'),
		('0182', 'classroom_submission_object_lock'),
		('0183', 'foundry_covers_private'),
		('0184', 'gauntlet_run_event_bounds'),
		('0185', 'bucket_limits_under_the_global'),
		('0186', 'maps_media_no_anon_listing'),
		('0187', 'classroom_duplicate_drafts'),
		('0188', 'song_spotify_and_feedback_spam'),
		('0189', 'tournament_thumbs_no_anon_listing'),
		('0192', 'tournament_entry_members_and_admin_hosts'),
		('0193', 'classroom_resource_layout'),
		('0194', 'gauntlet_verification_floor'),
		('0195', 'classroom_html_assignments'),
		('0196', 'short_link_reserve_hx'),
		('0197', 'classroom_html_assignment_write_gate'),
		('0198', 'classroom_close_assignment'),
		('0199', 'classroom_html_instructor_write_gate'),
		('0200', 'classroom_presence'),
		('0201', 'ideacad_blade_editor'),
		('0202', 'ideacad_anon_grant_repair'),
		('0203', 'sequence_anon_grant_sweep'),
		('0204', 'foundry_description_optional_and_public_play_stats'),
		('0205', 'ideacad_document_sharing'),
		('0206', 'ideacad_grant_guard'),
		('0207', 'ideacad_assembly_parts'),
		('0208', 'ideacad_materials'),
		('0209', 'ideacad_history'),
		('0210', 'notebook_note_grid')
),
seeded as (
	select version from supabase_migrations.schema_migrations
),
paired as (
	select
		coalesce(e.version, s.version) as version,
		(e.version is not null) as in_file,
		(s.version is not null) as in_table
	from expected e
	full outer join seeded s on s.version = e.version
),
missing as (select * from paired where in_file and not in_table),
extra as (select * from paired where in_table and not in_file),
holes(version) as (values ('0190'), ('0191'))
select * from (

	-- The verdict, over statement 5's list only. EQUAL when neither direction
	-- has a row, EXCEPT that a version at or above 0211 is a migration applied
	-- after this list was written, which is expected rather than a difference.
	select
		0 as sort_key,
		'VERDICT' as check,
		case
			when (select count(*) from missing) = 0
			     and (select count(*) from extra where version >= '0211')
			         = (select count(*) from extra)
			then 'EQUAL'
			else 'NOT EQUAL -- read the rows below'
		end as subject,
		'this file lists ' || (select count(*)::text from expected)
			|| ' migration(s), 0001 to 0210; the table now holds '
			|| (select count(*)::text from seeded)
			|| '; ' || (select count(*)::text from missing)
			|| ' listed here are missing from it; '
			|| (select count(*)::text from extra)
			|| ' are in it and not listed here' as detail
	from (select 1) as one

	union all

	-- 0211 is its own question, so it gets its own answer. Neither outcome is a
	-- fault of this file; one of them is work still to do.
	select 1, '0211',
		case
			when exists (select 1 from seeded s where s.version = '0211')
			then 'APPLIED, and now recorded'
			else 'NOT APPLIED to this database'
		end,
		case
			when exists (select 1 from seeded s where s.version = '0211')
			then 'public._ideacad_realtime_topic_id is present, so 0211 was applied and statement 6 wrote its row. Nothing to do.'
			else 'public._ideacad_realtime_topic_id is absent, so 0211 has not been applied and NO row was written for it. Apply it -- the Migrate workflow will, or paste supabase/migrations/0211_ideacad_realtime_policy.sql by hand -- and its row is written with it.'
		end
	from (select 1) as one

	union all

	-- Direction one: this file lists it and the table does not have it. This is
	-- the only row shape that means statement 5 did not do its job.
	select 2, 'IN THIS FILE, NOT IN THE TABLE', m.version,
		'the insert above did not land this row. Re-paste the whole file.'
	from missing m

	union all

	-- Direction two: the table has it and this file does not list it. At or
	-- above 0211 that is a migration applied after this list was written, which
	-- is what is supposed to happen. Below it, it is not, and says so.
	select 3, 'IN THE TABLE, NOT IN THIS FILE', x.version,
		case
			when x.version >= '0211'
			then 'applied at or after 0211, which this list deliberately stops short of. EXPECTED -- nothing to do.'
			else 'UNEXPECTED. Nothing should have written this row. Read docs/MIGRATIONS.md before doing anything else.'
		end
	from extra x

	union all

	-- The two permanent holes, confirmed absent, so the gap in the numbering
	-- reads as a decision rather than as something this file forgot.
	select 4, 'PERMANENT HOLE', h.version,
		case
			when exists (select 1 from seeded s where s.version = h.version)
			then 'PRESENT, and it should not be: there is no migration file with this number.'
			else 'absent, as intended. No migration file has ever carried this number.'
		end
	from holes h

	union all

	-- What was examined, so the reader is never guessing which table was read.
	select 5, 'EXAMINED', 'supabase_migrations.schema_migrations',
		'versions ' || (select min(version) from expected) || ' to ' || (select max(version) from expected)
			|| ' listed by supabase/data/0209-seed-migration-history.sql, plus 0211 conditionally; '
			|| 'lowest in the table ' || coalesce((select min(version) from seeded), 'NONE')
			|| ', highest ' || coalesce((select max(version) from seeded), 'NONE')
	from (select 1) as one

) as report
order by sort_key, subject;
