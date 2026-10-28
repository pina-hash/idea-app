/**
 * COPY A CLASS'S POSTS FORWARD (ledger 0455, reports 3a549386, 64441b57, and
 * the site half of f8c1b1d8). The client's reading of 0318's
 * `classroom_copy_forward_preview` and `classroom_copy_forward`: one plan,
 * shown as a preview with every post's old and new due date, then one confirm.
 *
 * The rule for moving a date lives in the database once
 * (`_classroom_shift_school_day`, counted in school days from the IDEA
 * calendar's no-school days); nothing here recomputes a date. This module only
 * reads the answer, words it, and builds the two calls, so the class page, its
 * dev harness and the test all read the same plan the same way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CopyAction = 'copy' | 'share' | 'already_there' | 'already_copied';

export interface CopyPlanPost {
	id: string;
	title: string;
	kind: 'assignment' | 'material' | 'post' | string;
	action: CopyAction;
	draft: boolean;
	live: boolean;
	classes: string[];
	oldDue: string | null;
	newDue: string | null;
	oldOpens: string | null;
	newOpens: string | null;
	pacingSteps: number;
	checkpoints: number;
}

export interface CopyPlan {
	ok: true;
	from: { id: string; label: string; firstDay: string };
	to: { id: string; label: string; firstDay: string };
	posts: CopyPlanPost[];
	counts: { copy: number; share: number; skip: number };
}

export type CopyAnswer =
	| CopyPlan
	| { ok: false; reason: string; message: string };

export interface CopyResult {
	ok: true;
	copied: number;
	shared: number;
	skipped: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** The refusal sentence for a reason, in the teacher's words. */
export function copyRefusal(reason: string, message?: string | null): string {
	switch (reason) {
		case 'same_class':
			return 'Pick a different class to copy into.';
		case 'first_day':
			return 'Choose the new class\'s first class day.';
		case 'not_found':
			return 'One of those classes is not there any more.';
		case 'unavailable':
			return 'Copying a class forward is not on this site yet. It arrives with the next update.';
		case 'refused':
			return 'Only the teacher of both classes can copy posts between them.';
		default:
			return message ?? 'The copy did not go through. Nothing was changed.';
	}
}

/** The preview or copy answer, read tolerantly; anything malformed is a refusal. */
export function parseCopyPlan(raw: unknown): CopyAnswer {
	if (!isRecord(raw)) return { ok: false, reason: 'failed', message: copyRefusal('failed') };
	if (raw.ok !== true) {
		const reason = str(raw.reason) ?? 'failed';
		return { ok: false, reason, message: copyRefusal(reason, str(raw.message)) };
	}
	const side = (v: unknown) => {
		const o = isRecord(v) ? v : {};
		return { id: str(o.id) ?? '', label: str(o.label) ?? '', firstDay: str(o.first_day) ?? '' };
	};
	const posts: CopyPlanPost[] = [];
	for (const p of Array.isArray(raw.posts) ? raw.posts : []) {
		if (!isRecord(p) || !str(p.id)) continue;
		posts.push({
			id: String(p.id),
			title: str(p.title) ?? 'Untitled',
			kind: str(p.kind) ?? 'post',
			action: (str(p.action) ?? 'copy') as CopyAction,
			draft: p.draft === true,
			live: p.live === true,
			classes: Array.isArray(p.classes) ? p.classes.filter((c): c is string => typeof c === 'string') : [],
			oldDue: str(p.old_due),
			newDue: str(p.new_due),
			oldOpens: str(p.old_opens),
			newOpens: str(p.new_opens),
			pacingSteps: num(p.pacing_steps),
			checkpoints: num(p.checkpoints)
		});
	}
	const c = isRecord(raw.counts) ? raw.counts : {};
	return {
		ok: true,
		from: side(raw.from),
		to: side(raw.to),
		posts,
		counts: { copy: num(c.copy), share: num(c.share), skip: num(c.skip) }
	};
}

const SCHOOL_TZ = 'America/Los_Angeles';

/** A due instant in school time, short: "Wed Nov 4, 11:59 PM". */
export function dueWords(iso: string | null): string {
	if (!iso) return 'No due date';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return 'No due date';
	return d.toLocaleString('en-US', {
		timeZone: SCHOOL_TZ,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** A calendar day, short: "Thu Oct 29". */
export function dayWords(day: string | null): string {
	if (!day) return '';
	const d = new Date(`${day}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

/** What happens to one post, in a word or two. */
export function actionWords(p: CopyPlanPost): string {
	switch (p.action) {
		case 'copy':
			return p.draft ? 'Copied, stays a draft' : 'Copied as a draft';
		case 'share':
			return 'Shared, one post in both';
		case 'already_there':
			return 'Already in the new class';
		case 'already_copied':
			return 'Already copied';
	}
	return '';
}

/** What a copy with these choices will do, in one line, for the confirm. */
export function planSummary(plan: CopyPlan, publish: boolean): string {
	const parts: string[] = [];
	const copies = plan.posts.filter((p) => p.action === 'copy');
	if (copies.length) {
		const live = copies.filter((p) => !p.draft).length;
		parts.push(
			`${copies.length} ${copies.length === 1 ? 'post' : 'posts'} copied${
				publish && live ? `, ${live} scheduled to open on their new days` : ' as drafts'
			}`
		);
	}
	if (plan.counts.share) parts.push(`${plan.counts.share} shared`);
	if (plan.counts.skip) parts.push(`${plan.counts.skip} already there`);
	return parts.length ? `${parts.join(', ')}.` : 'Nothing to copy: every post is already in the new class.';
}

/** The answer of the copy itself. */
export function parseCopyResult(raw: unknown): CopyResult | { ok: false; reason: string; message: string } {
	if (!isRecord(raw)) return { ok: false, reason: 'failed', message: copyRefusal('failed') };
	if (raw.ok !== true) {
		const reason = str(raw.reason) ?? 'failed';
		return { ok: false, reason, message: copyRefusal(reason, str(raw.message)) };
	}
	return { ok: true, copied: num(raw.copied), shared: num(raw.shared), skipped: num(raw.skipped) };
}

/** A refusal from the transport, by the database's code alone. */
function transportRefusal(error: { code?: string; message?: string }): { ok: false; reason: string; message: string } {
	if (error.code === 'PGRST202') return { ok: false, reason: 'unavailable', message: copyRefusal('unavailable') };
	if (/teacher of record for both/.test(error.message ?? '')) return { ok: false, reason: 'refused', message: copyRefusal('refused') };
	return { ok: false, reason: 'failed', message: error.message ?? copyRefusal('failed') };
}

export interface CopyForwardTransports {
	preview(toSection: string, firstDay: string, fromFirstDay: string | null): Promise<CopyAnswer>;
	copy(
		toSection: string,
		firstDay: string,
		fromFirstDay: string | null,
		itemIds: string[] | null,
		publish: boolean
	): Promise<CopyResult | { ok: false; reason: string; message: string }>;
}

/** The two calls, over the caller's own session; both RPCs re-check the caller. */
export function createCopyForwardTransports(supabase: SupabaseClient, fromSection: string): CopyForwardTransports {
	return {
		async preview(toSection, firstDay, fromFirstDay) {
			const { data, error } = await supabase.rpc('classroom_copy_forward_preview', {
				p_from_section: fromSection,
				p_to_section: toSection,
				p_first_day: firstDay,
				p_from_first_day: fromFirstDay,
				p_item_ids: null
			});
			if (error) return transportRefusal(error);
			return parseCopyPlan(data);
		},
		async copy(toSection, firstDay, fromFirstDay, itemIds, publish) {
			const { data, error } = await supabase.rpc('classroom_copy_forward', {
				p_from_section: fromSection,
				p_to_section: toSection,
				p_first_day: firstDay,
				p_from_first_day: fromFirstDay,
				p_item_ids: itemIds,
				p_publish: publish
			});
			if (error) return transportRefusal(error);
			return parseCopyResult(data);
		}
	};
}
