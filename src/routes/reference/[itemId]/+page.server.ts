import { error } from '@sveltejs/kit';
import { validateReferenceSpec, type PublicReferencePayload } from '$lib/classroom/reference-spec';
import type { PageServerLoad } from './$types';

/**
 * The PUBLIC reference viewer. A parent scanning the QR code on a printed
 * syllabus has no boscotech.net account, so this route takes no session and
 * lives OUTSIDE /classroom deliberately -- that prefix is in authedPrefixes and
 * would bounce them to / before this load ever ran.
 *
 * THE ONE READ IS classroom_public_reference (0092), run as whoever is asking
 * (usually `anon`). It is a separate, narrow SECURITY DEFINER function rather
 * than the authenticated read with a check bypassed: it answers only for a
 * PUBLISHED, PUBLIC MATERIAL that has a reference document, and it returns only
 * the title, the document, and that material's own attachment metadata. There
 * is no parameter through which a roster, an enrollment, a submission, a
 * section membership, another item's content, or an email could be requested.
 *
 * A null answer is 404 -- and the same 404 covers an unknown id, a private
 * material, an unpublished one, one with no document, and anything that is not
 * a material. Distinguishing them would confirm a real id to a stranger.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data, error: rpcError } = await supabase.rpc('classroom_public_reference', {
		p_item_id: params.itemId
	});

	// A pre-0092 deployment answers PGRST202 (no such function). That is a
	// deployment state, not a missing document, but there is nothing for a
	// visitor to do about either -- both read as "not found".
	if (rpcError || !data) error(404, 'Not found');

	const payload = data as PublicReferencePayload;
	// The document is validated at import; re-validating here means a row that
	// somehow predates a rule still cannot render as something half-built.
	const { spec, errors } = validateReferenceSpec(payload.spec);
	if (!spec) error(404, 'Not found');

	return {
		itemId: payload.item_id,
		title: payload.title,
		spec,
		attachments: payload.attachments ?? [],
		updatedAt: payload.updated_at ?? null,
		specErrors: errors
	};
};
