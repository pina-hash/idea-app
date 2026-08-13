import type { ImportBatchRow, ImportProfile, SavedMappingRow } from '$lib/coin-desk/migrate';
import type { PageServerLoad } from './$types';

/**
 * Migrate: the legacy Sheets import wizard's resumable state. Admin-gating
 * lives once in the group's +layout.server.ts; the reads here are direct
 * RLS-scoped selects (all three 0084 tables are admin-read).
 *
 * The working batch is the COMMITTED one if any exists (resuming lands on
 * Verify), else the most recent pull (resuming lands on Map). The mapping
 * draft and the student profiles feed the Map step's prefill.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: committedRows, error: batchError } = await supabase
		.from('coin_import_batches')
		.select('id, raw, pulled_at, committed_at, committed_by, report')
		.not('committed_at', 'is', null)
		.order('committed_at', { ascending: false })
		.limit(1);

	let batch = (committedRows?.[0] as ImportBatchRow | undefined) ?? null;
	if (!batch && !batchError) {
		const { data: latest } = await supabase
			.from('coin_import_batches')
			.select('id, raw, pulled_at, committed_at, committed_by, report')
			.order('pulled_at', { ascending: false })
			.limit(1);
		batch = (latest?.[0] as ImportBatchRow | undefined) ?? null;
	}

	const { data: mappings, error: mappingsError } = await supabase
		.from('coin_import_mappings')
		.select('legacy_name, email, status');

	// The MAP step's profile matching: students who have signed in, matched
	// client-side by name token sets (the resolveApplicant idea). A miss is
	// normal -- most legacy students may never have signed in.
	const { data: profiles } = await supabase
		.from('profiles')
		.select('email, full_name, display_name')
		.eq('role', 'student');

	return {
		batch,
		savedMappings: (mappings ?? []) as SavedMappingRow[],
		profiles: (profiles ?? []) as ImportProfile[],
		// Fails soft: 0084 not applied reads as a clearly-flagged banner, not a
		// crashed page (the per-area fail-soft convention).
		migrateConfigured: !batchError && !mappingsError
	};
};
