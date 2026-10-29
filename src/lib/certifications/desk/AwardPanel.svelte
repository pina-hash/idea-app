<script lang="ts">
	/**
	 * THE AWARD MOMENT (the spec's Award screen; `docs/CERTIFICATIONS.md`
	 * "The award moment"): the requirement checklist with every part's state,
	 * then THE AWARD KEY, dark until `cert_award_prepare` answered ok and the
	 * caller is not the student, lit as a deliberately important control. It
	 * opens a native <dialog> (showModal, the Lightbox's shape) that shows
	 * exactly what will be recorded as `.cert-facts`, with Cancel and Award.
	 * Award POSTs `CERT_API.award` with `{ attempt_id }`; `{ ok }` navigates to
	 * the certificate; a refusal (no signing key, a mismatch) renders its
	 * message verbatim inside the dialog and the key re-enables.
	 *
	 * NOTHING HERE USES requestAnimationFrame: a click handler and a fetch are
	 * all this path needs, and a teardown on an animation frame never runs
	 * in exactly the case it exists for (CLAUDE.md, the Foundry stop rule).
	 *
	 * The dialog's `close` is wired with addEventListener, because Svelte's
	 * delegated `onclose` never fires on a dialog in the verification pane.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		AWARD_BUTTON_WORD,
		AWARD_CONFIRM_SENTENCE,
		AWARD_CONFIRM_TITLE,
		AWARD_LOCKED_SENTENCE
	} from '$lib/certifications/copy';
	import { CERT_API, deskStudentHref } from '$lib/certifications/nav';
	import { allPartsDone } from '$lib/certifications/parts';
	import { formatCertDate } from '$lib/certifications/status';
	import type { AwardRecordPreview, CertAttemptJson } from '$lib/certifications/types';
	import { awardHeldWords, awardKeyLit, personWords, type AwardAnswer } from './desk';
	import Checklist from './Checklist.svelte';

	let {
		attempt,
		student,
		record = null,
		refusal = null,
		callerEmail = null,
		openOnMount = false,
		initialProblem = null,
		award = defaultAward
	}: {
		attempt: CertAttemptJson;
		student: { email: string; name: string | null };
		/** What `cert_award_prepare` answered when it answered ok. */
		record?: AwardRecordPreview | null;
		/** What it answered otherwise. */
		refusal?: { reason: string; message: string } | null;
		callerEmail?: string | null;
		/** The harness opens the dialog on load so a spec can measure it. */
		openOnMount?: boolean;
		/** The harness's pre-answered refusal inside the dialog. */
		initialProblem?: string | null;
		/** The commit transport; the route's default is the award API. */
		award?: (attemptId: string) => Promise<AwardAnswer>;
	} = $props();

	async function defaultAward(attemptId: string): Promise<AwardAnswer> {
		try {
			const res = await fetch(CERT_API.award, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ attempt_id: attemptId })
			});
			const body = (await res.json().catch(() => null)) as { ok?: boolean; certificate_href?: string; message?: string } | null;
			if (res.ok && body?.ok === true && typeof body.certificate_href === 'string') {
				return { ok: true, certificate_href: body.certificate_href };
			}
			return { ok: false, message: body?.message || `The award was not recorded (HTTP ${res.status}).` };
		} catch (e) {
			return { ok: false, message: (e as Error)?.message || 'The award was not recorded: the server could not be reached.' };
		}
	}

	const self = $derived(!!callerEmail && callerEmail.trim().toLowerCase() === student.email.trim().toLowerCase());
	const allDone = $derived(allPartsDone(attempt.checks));
	const lit = $derived(awardKeyLit({ prepared: !!record && !refusal, callerEmail, studentEmail: student.email }));
	const held = $derived(awardHeldWords({ refusal, self, allDone }));

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let open = $state(false);
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let problem = $state<string | null>(initialProblem);

	function openDialog() {
		if (!lit || !dialogEl) return;
		if (!initialProblem) problem = null;
		if (!dialogEl.open) dialogEl.showModal();
		open = true;
	}
	function closeDialog() {
		if (busy) return;
		dialogEl?.close();
	}

	onMount(() => {
		const el = dialogEl;
		if (!el) return;
		const onClose = () => {
			open = false;
		};
		el.addEventListener('close', onClose);
		if (openOnMount) openDialog();
		return () => el.removeEventListener('close', onClose);
	});

	async function commit() {
		if (busy || !lit) return;
		busy = true;
		problem = null;
		try {
			const answer = await award(attempt.id);
			if (answer.ok) {
				await goto(answer.certificate_href);
				return;
			}
			problem = answer.message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="dk-award" data-testid="cert-award" data-lit={lit ? 'yes' : 'no'}>
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">Award</p>
			<h1 class="cert-title plate-title">{attempt.certification.code} {attempt.certification.name}</h1>
			<p class="dk-row-meta">
				<a class="tap-reach-44 dk-inline-name" href={deskStudentHref(student.email)} data-testid="cert-award-student">{personWords(student)}</a>, Level {attempt.certification.level}, {attempt.certification.category}
			</p>
		</div>
	</header>

	<section class="cert-panel" id="requirements" aria-labelledby="cert-award-req-h">
		<h2 id="cert-award-req-h">Requirements</h2>
		<Checklist checks={attempt.checks} testId="cert-award-checklist" />
	</section>

	<div class="dk-award-stage" data-testid="cert-award-stage">
		<button
			type="button"
			class="btn cert-btn cert-award-key"
			aria-disabled={lit ? undefined : 'true'}
			aria-describedby={held ? 'cert-award-held' : undefined}
			data-testid="cert-award-key"
			onclick={openDialog}
		>
			<svg class="dk-seal" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
				<circle cx="12" cy="10" r="6.5" />
				<path d="M12 6.5v7M8.5 10h7" />
				<path d="M8.5 15.5 7 22l5-2.5 5 2.5-1.5-6.5" />
			</svg>
			{AWARD_BUTTON_WORD}
		</button>
		{#if held}
			<p class="dk-held" id="cert-award-held" data-testid="cert-award-held">{held}</p>
		{:else}
			<p class="dk-held" data-testid="cert-award-ready">Every required part is checked. One press records a signed award and opens the certificate.</p>
		{/if}
		<p class="dk-sr">{AWARD_LOCKED_SENTENCE}</p>
	</div>

	<dialog class="dk-dialog" bind:this={dialogEl} aria-labelledby="cert-award-dialog-h" data-testid="cert-award-dialog" data-open={open ? 'yes' : 'no'}>
		<h2 id="cert-award-dialog-h">{AWARD_CONFIRM_TITLE}</h2>
		<p>{AWARD_CONFIRM_SENTENCE}</p>
		{#if record}
			<dl class="cert-facts" data-testid="cert-award-facts">
				<dt>Student</dt><dd data-fact="student_name">{record.student.name}</dd>
				<dt>Email</dt><dd data-fact="student_email">{record.student.email}</dd>
				<dt>Certification</dt><dd data-fact="certification_name">{record.certification.name}</dd>
				<dt>Code</dt><dd data-fact="code">{record.certification.code}</dd>
				<dt>Level</dt><dd data-fact="level">{record.certification.level}</dd>
				<dt>Category</dt><dd data-fact="category">{record.certification.category}</dd>
				<dt>Award date</dt><dd data-fact="awarded_at">{formatCertDate(record.awarded_at)}</dd>
				<dt>Expires</dt><dd data-fact="expires_at">{record.expires_at ? formatCertDate(record.expires_at) : 'Never'}</dd>
				<dt>Certifier</dt><dd data-fact="certifier_name">{record.certifier.name}</dd>
			</dl>
		{/if}
		{#if problem}
			<p class="cert-notice cert-notice-bad" role="alert" data-testid="cert-award-problem">
				<span class="cert-notice-glyph" aria-hidden="true">!</span>
				<span>{problem}</span>
			</p>
		{/if}
		<div class="cert-actions">
			<button type="button" class="btn cert-btn secondary" onclick={closeDialog} aria-disabled={busy ? 'true' : undefined} data-testid="cert-award-cancel">Cancel</button>
			<button type="button" class="btn cert-btn" onclick={commit} aria-disabled={busy || !lit ? 'true' : undefined} data-testid="cert-award-commit">{busy ? 'Recording' : AWARD_BUTTON_WORD}</button>
		</div>
	</dialog>
</div>
