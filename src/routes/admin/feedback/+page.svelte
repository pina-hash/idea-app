<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import SpamFinePrompt from '$lib/feedback/SpamFinePrompt.svelte';
	import { spamPrompts } from '$lib/feedback/spam';
	import { bulkStatusTransport } from '$lib/feedback/bulk';
	import type { FeedbackScreenshotBytes } from '$lib/feedback/archive';
	import {
		feedbackRetryable,
		type FeedbackEditInput,
		type FeedbackEditResult,
		type FeedbackHorizon,
		type FeedbackStatus
	} from '$lib/feedback/feedback';
	import { FEEDBACK_MEDIA_BUCKET } from '$lib/feedback/screenshot';
	import { isTransientSqlstate } from '$lib/pg-errors';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;

	/** Ledger 0432: a selection in one call (`app_feedback_set_status_many`). */
	const setStatusMany = bulkStatusTransport(supabase, 'app_feedback_set_status_many', (id, st) => setStatus(id, st), () => void invalidateAll());

	/** Ledger 0432: pay a report's student 1 to 10 coins for a change it led to. */
	async function rewardReport(id: string, amount: number) {
		const { data: answer, error } = await supabase.rpc('app_feedback_reward', { p_report_id: id, p_amount: amount });
		if (error) return { ok: false, message: error.message };
		const r = (answer ?? {}) as { ok?: unknown; reason?: unknown };
		if (r.ok === true) {
			void invalidateAll();
			return { ok: true };
		}
		const words: Record<string, string> = {
			already_rewarded: 'That report was already rewarded.',
			anonymous: 'That report was sent signed out, so there is nobody to pay.',
			not_a_student: 'That report is not from a student account.',
			amount: 'A reward is a whole number from 1 to 10.'
		};
		return { ok: false, message: words[String(r.reason)] ?? `The reward did not go through (${String(r.reason)}).` };
	}

	const prompts = $derived(data.spamReview ? spamPrompts(data.spamReview) : []);
	async function spamAct(fn: string, args: Record<string, unknown>) {
		const { data: answer, error } = await supabase.rpc(fn, args);
		if (error) return { ok: false, message: error.message };
		const r = (answer ?? {}) as { ok?: unknown; reason?: unknown };
		if (r.ok === true) {
			void invalidateAll();
			return { ok: true };
		}
		return { ok: false, reason: typeof r.reason === 'string' ? r.reason : 'unknown' };
	}

	async function setStatus(id: string, status: FeedbackStatus) {
		const { error } = await supabase.rpc('app_feedback_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}

	/**
	 * MOVE A REPORT BETWEEN "FIX SOON" AND "LONG-TERM IDEAS" (0230), the
	 * `setStatus` shape: one RPC on the admin's own client, which re-checks
	 * `is_admin()` inside itself, then a reload. Handed to the console ONLY
	 * when the load proved 0230 is applied, so absence removes the control on a
	 * deployment that could only refuse it.
	 */
	async function setHorizon(id: string, horizon: FeedbackHorizon) {
		const { error } = await supabase.rpc('app_feedback_set_horizon', {
			p_id: id,
			p_horizon: horizon
		});
		if (error) return { ok: false, message: error.message };
		void invalidateAll();
		return { ok: true };
	}

	/**
	 * AN ADMIN'S CORRECTION OF A FILED REPORT (0233, report d362bfb3): one RPC
	 * on the admin's own client, which re-checks `is_admin()` inside itself and
	 * answers a structured refusal for anything the form can fix. Handed to the
	 * console ONLY when the load saw the `edit` key the same apply adds, so a
	 * deployment that could only refuse an edit is never offered one.
	 *
	 * A CODELESS ERROR IS THE NETWORK and may be re-sent, and so is a NAMED
	 * transient SQLSTATE (a deadlock, a statement timeout), which
	 * `$lib/pg-errors` is the one list of; every other code is the database
	 * saying no, answered once. A re-send is safe because the database answers
	 * words it already holds as unchanged before it asks about staleness.
	 *
	 * EVERY ANSWER THAT SAYS OK RELOADS, `changed` or not: a retry whose first
	 * attempt landed reads `changed: false` at a newer revision, and the card
	 * has to catch up to it either way.
	 */
	async function editFeedback(id: string, input: FeedbackEditInput): Promise<FeedbackEditResult> {
		const { data: answer, error } = await supabase.rpc('app_feedback_edit', {
			p_id: id,
			p_kind: input.kind,
			p_message: input.message,
			p_tried: input.tried,
			p_base_revision: input.baseRevision
		});
		if (error) {
			return {
				ok: false,
				message: error.message,
				retryable: feedbackRetryable(error.code) || isTransientSqlstate(error.code)
			};
		}
		const r = (answer ?? {}) as { ok?: unknown; changed?: unknown; revision?: unknown; reason?: unknown };
		if (r.ok === true) {
			void invalidateAll();
			return { ok: true, changed: r.changed === true, revision: Number(r.revision) || 0 };
		}
		return { ok: false, reason: typeof r.reason === 'string' ? r.reason : 'unknown' };
	}

	/**
	 * ONE SCREENSHOT'S BYTES, FOR THE ARCHIVE EXPORT.
	 *
	 * ON THE ADMIN'S OWN CLIENT, SO THE STORAGE POLICY IS STILL THE BOUNDARY.
	 * `feedback-media` is private and 0170 gives it exactly one policy that
	 * reaches another person's object -- `feedback media admin read`, `select`,
	 * `to authenticated`, `using (bucket_id = 'feedback-media' and is_admin())`.
	 * This runs as the caller, so that policy answers, and NOTHING HAD TO BE
	 * WIDENED to build the archive: the same session already reads the same
	 * bytes to draw the thumbnail on the row.
	 *
	 * A DOWNLOAD RATHER THAN A SIGNED URL, and the difference is staleness. The
	 * load mints signed URLs valid for five minutes, which is right for a
	 * thumbnail on a page somebody is looking at now; a queue is worked through
	 * for a good deal longer, so an export pressed twenty minutes in would fetch
	 * a set of expired links and produce an archive with no images and no reason
	 * on screen. Asking storage at the moment of the press has no window to be
	 * outside of.
	 *
	 * IT NEVER THROWS. Every outcome is a value, because one unreachable object
	 * must not cost the other thirty-seven reports their archive; the builder
	 * records the absence per report and the archive states it.
	 */
	async function fetchScreenshot(key: string): Promise<FeedbackScreenshotBytes | null> {
		try {
			const { data: blob, error } = await supabase.storage
				.from(FEEDBACK_MEDIA_BUCKET)
				.download(key);
			if (error || !blob) return null;
			return {
				bytes: new Uint8Array(await blob.arrayBuffer()),
				// WHAT THE STORE SAYS THE BYTES ARE. It can be empty or generic,
				// which is why the archive falls back to the key's own extension
				// rather than trusting this alone.
				contentType: blob.type || null
			};
		} catch {
			return null;
		}
	}
</script>

<!-- The portal header and the three-source strip are the area's layout
     (src/routes/admin/feedback/+layout.svelte); this page is the site queue. -->
<FeedbackConsole
	ready={data.ready}
	rows={data.rows}
	classroomSections={data.classroomSections}
	screenshotUrls={data.screenshotUrls}
	{fetchScreenshot}
	{setStatus}
	setHorizon={data.horizonReady ? setHorizon : undefined}
	horizonUnavailable={data.horizonReady
		? null
		: 'Moving a report between Fix soon and Long-term ideas needs a database update that has not been applied yet. Reports marked long-term when they were sent still show under their own tab.'}
	editFeedback={data.editReady ? editFeedback : undefined}
	{setStatusMany}
	rewardReport={data.rewardReady ? rewardReport : undefined}
	rewarded={data.rewarded}
>
	{#snippet top()}
		<SpamFinePrompt
			{prompts}
			fine={(ids, amount) => spamAct('app_feedback_spam_fine', { p_report_ids: ids, p_amount: amount, p_note: null })}
			dismiss={(ids) => spamAct('app_feedback_spam_dismiss', { p_report_ids: ids })}
		/>
	{/snippet}
</FeedbackConsole>
