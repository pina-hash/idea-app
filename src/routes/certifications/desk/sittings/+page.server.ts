import { requireCertAdmin, requireCertifier } from '$lib/server/certifications/gate';
import { schoolLocalToIso, type SeatTodayRow } from '$lib/certifications/desk/desk';
import { formatCertTime } from '$lib/certifications/status';
import type { CertSettings, CertSittingJson } from '$lib/certifications/types';
import { dataOrNull, isUuid, loadRpc, num, refuseAction, runAction, str } from '../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * SITTINGS (the spec's Sittings screen): the open windows (`cert_sittings`),
 * the pending requests (the layout's `cert_desk`), the settings for the
 * release window, and the seats a certifier may release today.
 *
 * `seats` IS READ OFF A KEY THE CONTRACT DOES NOT NAME YET (`cert_desk`'s
 * `seats_today`), failing to an empty list: no catalogued function lists the
 * approved and booked seats of the caller's certifications, so until one does
 * the release key lives on each student's own page as well. The desk report's
 * DEVIATIONS says so.
 *
 * Every time typed into a `datetime-local` box is SCHOOL TIME and is turned
 * into an instant by `schoolLocalToIso`, never by the server's own zone.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	await requireCertifier(locals);
	const { desk, authority } = await parent();
	const [sittings, settings] = await Promise.all([
		loadRpc<CertSittingJson[]>(locals.supabase, 'cert_sittings'),
		loadRpc<CertSettings>(locals.supabase, 'cert_settings')
	]);
	const seatsRaw = (desk as unknown as { seats_today?: unknown } | null)?.seats_today;
	const seats = Array.isArray(seatsRaw) ? (seatsRaw as SeatTodayRow[]) : [];
	return {
		title: 'Sittings',
		unavailable: !sittings.ok,
		sittings: dataOrNull(sittings) ?? [],
		requests: desk?.requests ?? [],
		seats,
		settings: dataOrNull(settings),
		certifications: authority.certifications
	};
};

export const actions: Actions = {
	post: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const starts = schoolLocalToIso(str(form, 'starts_at'));
		const ends = schoolLocalToIso(str(form, 'ends_at'));
		if (!starts || !ends) return refuseAction('post', 'Both the start and the end need a date and a time.');
		if (new Date(ends).getTime() <= new Date(starts).getTime()) return refuseAction('post', 'The window has to end after it starts.');
		const certId = str(form, 'certification_id');
		if (certId && !isUuid(certId)) return refuseAction('post', 'Choose a certification from the list, or Any.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'post',
			fn: 'cert_sitting_post',
			args: {
				p: {
					starts_at: starts,
					ends_at: ends,
					seat_limit: Math.round(num(form, 'seat_limit', 8)),
					location: str(form, 'location') || null,
					note: str(form, 'note') || null,
					certification_id: certId || null,
					repeat_weeks: Math.max(0, Math.min(26, Math.round(num(form, 'repeat_weeks', 0))))
				}
			},
			okMessage: (d) => {
				const n = Array.isArray(d.sitting_ids) ? d.sitting_ids.length : 1;
				return `Posted ${n} window${n === 1 ? '' : 's'}. Students can sign up now.`;
			}
		});
	},
	cancel: async ({ request, locals, url }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const sittingId = str(form, 'sitting_id');
		if (!isUuid(sittingId)) return refuseAction('cancel', 'The window was not named.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'cancel',
			fn: 'cert_sitting_cancel',
			args: { p_sitting: sittingId },
			okMessage: () => 'The window is cancelled and every booked student was told.'
		});
	},
	decide: async ({ request, locals, url }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const seatId = str(form, 'seat_id');
		const decision = str(form, 'decision');
		const note = str(form, 'note');
		if (!isUuid(seatId)) return refuseAction('decide', 'The request was not named.');
		if (decision !== 'approve' && decision !== 'decline') return refuseAction('decide', 'Choose Approve or Decline.');
		const scheduledAt = decision === 'approve' ? schoolLocalToIso(str(form, 'scheduled_at')) : null;
		if (decision === 'approve' && !scheduledAt) return refuseAction('decide', 'An approval needs the date and time the student sits.');
		if (decision === 'decline' && !note) return refuseAction('decide', 'A decline needs a note saying why.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'decide',
			fn: 'cert_seat_decide',
			args: { p_seat: seatId, p_decision: decision, p_scheduled_at: scheduledAt, p_note: note || null },
			okMessage: () => (decision === 'approve' ? 'Approved. The student was told when to come.' : 'Declined, with your note. The student was told.')
		});
	},
	release: async ({ request, locals, url }) => {
		await requireCertifier(locals);
		const form = await request.formData();
		const seatId = str(form, 'seat_id');
		if (!isUuid(seatId)) return refuseAction('release', 'The seat was not named.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'release',
			fn: 'cert_exam_release',
			args: { p_seat: seatId },
			okMessage: (d) => `Released until ${formatCertTime(String(d.release_expires_at ?? ''))}.`,
			extra: (d) => ({ seat_id: seatId, exam_id: d.exam_id ?? null, release_expires_at: d.release_expires_at ?? null })
		});
	}
};
