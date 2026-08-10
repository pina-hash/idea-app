<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { NotebookFlagReason, NotebookPhoto } from '$lib/notebook';
	import type {
		GridSession,
		ReviewEntry,
		ReviewResult,
		ReviewTransports,
		SectionGrid,
		SessionInput
	} from '$lib/notebook-review';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The one place the real server calls live. Every transport runs as the
	 * CALLER'S OWN session through the browser client, so 0069's RLS and the
	 * SECURITY DEFINER RPCs' own instructor-or-admin checks are what actually
	 * decide the answer -- nothing here re-implements a permission rule.
	 *
	 * Errors are turned into `{ ok: false }` rather than thrown: the RPCs
	 * raise on refusal (wrong tier, missing session, bad unit number), and the
	 * message they raise is written to be shown, so it is surfaced as-is.
	 */
	function fail(err: unknown, fallback: string): ReviewResult<never> {
		const message = (err as { message?: string } | null)?.message?.trim();
		return { ok: false, error: message || fallback };
	}

	const transports: ReviewTransports = {
		async loadSessions(sectionId) {
			// A plain RLS-scoped select, not an RPC: notebook_sessions is
			// readable by any signed-in user (0069), which is also why the grid
			// itself is the thing that gates section access, not this.
			const { data: rows, error } = await data.supabase
				.from('notebook_sessions')
				.select('id, unit_number, session_date, session_label')
				.eq('section_id', sectionId)
				.order('session_date');
			if (error) return fail(error, 'Could not load this section’s check-ins.');
			return { ok: true, value: (rows ?? []) as GridSession[] };
		},

		async saveSession(input: SessionInput) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_upsert_session', {
				p_section_id: input.section_id,
				p_unit_number: input.unit_number,
				p_session_date: input.session_date,
				p_session_label: input.session_label,
				p_id: input.id
			});
			if (error) return fail(error, 'Could not save that check-in.');
			return { ok: true, value: result as { session_id: string } };
		},

		async deleteSession(sessionId) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_delete_session', {
				p_session_id: sessionId
			});
			if (error) return fail(error, 'Could not delete that check-in.');
			return { ok: true, value: result as { detached_entries: number } };
		},

		async loadGrid(sectionId, unitNumber) {
			const { data: result, error } = await data.supabase.rpc('notebook_get_section_grid', {
				p_section_id: sectionId,
				p_unit_number: unitNumber
			});
			if (error) return fail(error, 'Could not load the grid for this section.');
			return { ok: true, value: result as SectionGrid };
		},

		async loadEntry(entryId) {
			// RLS decides: 'section staff read notebook entries' covers the
			// instructor and the admin tier, and the photos follow the entry
			// via notebook_can_read_entry. No .eq('student_id', ...) filter and
			// no RPC -- the filtering IS the policy (the /coin-balance and
			// /notebook doctrine).
			const { data: row, error } = await data.supabase
				.from('notebook_entries')
				.select(
					`id, student_id, session_id, custom_label, upload_timestamp, status, flag_reason,
					 instructor_comment,
					 notebook_entry_photos ( id, drive_file_id, variant, sequence_order, original_filename )`
				)
				.eq('id', entryId)
				.maybeSingle();
			if (error) return fail(error, 'Could not load that entry.');
			if (!row) return { ok: false, error: 'That entry is no longer available.' };
			const r = row as Record<string, unknown>;
			return {
				ok: true,
				value: {
					id: r.id as string,
					student_id: r.student_id as string,
					session_id: (r.session_id as string | null) ?? null,
					custom_label: (r.custom_label as string | null) ?? null,
					upload_timestamp: r.upload_timestamp as string,
					status: r.status as ReviewEntry['status'],
					flag_reason: (r.flag_reason as NotebookFlagReason | null) ?? null,
					instructor_comment: (r.instructor_comment as string | null) ?? null,
					photos: (r.notebook_entry_photos as NotebookPhoto[]) ?? []
				}
			};
		},

		async flagEntry(entryId, reason, comment) {
			const { error } = await data.supabase.rpc('notebook_flag_entry', {
				p_entry_id: entryId,
				p_flag_reason: reason,
				p_instructor_comment: comment
			});
			if (error) return fail(error, 'Could not flag that entry.');
			return { ok: true, value: undefined };
		},

		async resolveEntry(entryId, comment) {
			const { error } = await data.supabase.rpc('notebook_resolve_entry', {
				p_entry_id: entryId,
				p_instructor_comment: comment
			});
			if (error) return fail(error, 'Could not accept that entry.');
			return { ok: true, value: undefined };
		}
	};
</script>

<ReviewConsole
	sections={data.sections}
	isChair={data.isChair}
	configured={data.configured}
	{transports}
/>
