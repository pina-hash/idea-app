/**
 * FRC Team 5669 interest form: the client seam onto the `fsp_frc_interest`
 * table (0046). Unlike every other FSP/GAUNTLET/FRC write path in this repo,
 * this one is a genuinely public, unauthenticated INSERT (RLS itself is the
 * write path, no RPC), because the form is reached cold from a QR code by
 * prospective freshmen and parents who have no Bosco Tech account.
 *
 * Reads (the /fsp/frc-interest/admin roster) are teacher-only under RLS
 * (`is_teacher()`), and fail soft to an empty list + `ready: false` until the
 * 0046 migration is applied, the same convention as `frc/gate-submissions.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FRC_INTEREST_TABLE = 'fsp_frc_interest';

export const INTEREST_AREAS = [
	'Mechanical & Build',
	'Electrical & Wiring',
	'Programming & Controls',
	'CAD & Design',
	'Business & Outreach',
	'Drive Team',
	'Not sure yet'
] as const;

export type InterestArea = (typeof INTEREST_AREAS)[number];

export interface FrcInterestSubmission {
	fullName: string;
	email: string;
	phone: string;
	interestAreas: string[];
	priorExperience: string;
}

/** A submitted row, as shown on the teacher admin roster. */
export interface FrcInterestRow {
	id: string;
	fullName: string;
	email: string;
	phone: string;
	interestAreas: string[];
	priorExperience: string;
	createdAt: string;
}

interface Row {
	id: string;
	full_name: string;
	email: string;
	phone: string | null;
	interest_areas: string[] | null;
	prior_experience: string | null;
	created_at: string;
}

function toRow(r: Row): FrcInterestRow {
	return {
		id: r.id,
		fullName: r.full_name,
		email: r.email,
		phone: r.phone ?? '',
		interestAreas: r.interest_areas ?? [],
		priorExperience: r.prior_experience ?? '',
		createdAt: r.created_at
	};
}

/** Insert a new interest-form submission. Anonymous-safe (RLS grants the insert). */
export async function submitFrcInterest(
	supabase: SupabaseClient,
	submission: FrcInterestSubmission
): Promise<{ error: string | null }> {
	const { error } = await supabase.from(FRC_INTEREST_TABLE).insert({
		full_name: submission.fullName.trim(),
		email: submission.email.trim(),
		phone: submission.phone.trim() || null,
		interest_areas: submission.interestAreas,
		prior_experience: submission.priorExperience.trim() || null
	});
	return { error: error?.message ?? null };
}

/** Teacher-only: every submission, newest first. Fails soft pre-migration. */
export async function loadFrcInterestSubmissions(
	supabase: SupabaseClient
): Promise<{ ready: boolean; rows: FrcInterestRow[] }> {
	const { data, error } = await supabase
		.from(FRC_INTEREST_TABLE)
		.select('id, full_name, email, phone, interest_areas, prior_experience, created_at')
		.order('created_at', { ascending: false });

	if (error) return { ready: false, rows: [] };
	return { ready: true, rows: ((data as Row[] | null) ?? []).map(toRow) };
}
