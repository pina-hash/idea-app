<script lang="ts">
	/**
	 * THE KIT (ledger 0391): every part of the automated learning environment,
	 * in the order it is earned, each an anchored section with an id the
	 * checklist jumps to, folded in `Disclosure` (scope per record, so a long
	 * section a person closed stays closed for them on that certification).
	 *
	 *   Definition        definition, allows, does not allow
	 *   Training          one block per item in order (a video through surface
	 *                     e's player, a lesson through the HTML assignment
	 *                     frame), each with its progress; a quick check after
	 *                     the item it names
	 *   Practice quiz     ungraded, one question at a time
	 *   Study guide       markdown
	 *   Common mistakes   a list
	 *   Guided project    the spec with faded steps, the hand-in form while
	 *                     the part is unlocked and pending, every past review
	 *   Exam              configuration, lockdown, seats, attempts
	 *   Autonomous        the spec, the outside-help notice, the form
	 *   Checkout          card and filming guide, the form with a YouTube link
	 *
	 * Transports are injected: `post` (form actions), `rpc` (browser RPCs),
	 * `makeUploader` (an evidence uploader per attempt). Absent, the control
	 * each drives is not offered. `refusal` is a refusal from a native (no
	 * script) post, rendered at the top of the section the person was in.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import { OUTSIDE_HELP_SENTENCE } from '$lib/certifications/copy';
	import type { CertGetJson, CertSettings, EvidenceItem, SubmissionPart } from '$lib/certifications/types';
	import type { CertActionPost, CertRpc } from './actions';
	import type { EvidenceUploader } from './evidence-upload';
	import { formStateFor, KIT_SECTION_WORDS, sectionId, submissionsFor, trainingProgressFor, type KitSection } from './kit';
	import CertNotice from './CertNotice.svelte';
	import ExamSection from './ExamSection.svelte';
	import LessonFrame from './LessonFrame.svelte';
	import PracticeQuiz from './PracticeQuiz.svelte';
	import ProjectView from './ProjectView.svelte';
	import QuickCheck from './QuickCheck.svelte';
	import ReviewHistory from './ReviewHistory.svelte';
	import SubmissionForm from './SubmissionForm.svelte';
	import VideoItem from './VideoItem.svelte';

	let {
		cert,
		settings = null,
		anchorPrefix = 'kit',
		post = null,
		rpc = null,
		makeUploader = null,
		refusal = null,
		onchanged = null
	}: {
		cert: CertGetJson;
		settings?: CertSettings | null;
		anchorPrefix?: string;
		post?: CertActionPost | null;
		rpc?: CertRpc | null;
		makeUploader?: ((attemptId: string) => EvidenceUploader) | null;
		refusal?: { section: string; message: string } | null;
		/** Told when a browser RPC changed what the page shows (a lesson done, training checked off). */
		onchanged?: (() => void) | null;
	} = $props();

	const pkg = $derived(cert.package);
	const attempt = $derived(cert.my_attempt);
	const uploader = $derived(attempt && makeUploader ? makeUploader(attempt.id) : null);
	const checkinTimeout = $derived(settings?.checkin_timeout_seconds ?? 60);
	const lessonsBySlug = $derived(new Map(cert.lessons.map((l) => [l.slug, l])));
	const quickChecksAfter = (key: string) => pkg.training.quick_checks.filter((q) => q.after === key);

	const CHECKOUT_EVIDENCE: EvidenceItem[] = [
		{ kind: 'youtube', label: 'Your unlisted YouTube video: one continuous, unedited take', required: true },
		{ kind: 'text', label: 'Anything your certifier should know before watching', required: false }
	];
	const CHECKOUT_SELF_INSPECTION = ['This is one continuous take with no cuts or edits', 'The video is uploaded to YouTube as unlisted, not private', 'I did this alone, start to finish, with no help'];

	const id = (s: KitSection) => sectionId(anchorPrefix, s);
	const scope = (s: KitSection) => `cert:${cert.code}:${s}`;
	const refusalFor = (s: KitSection) => (refusal && refusal.section === s ? refusal.message : null);
	const formFor = (part: SubmissionPart) => formStateFor(cert, part);
</script>

{#snippet refused(section: KitSection)}
	{#if refusalFor(section)}
		<CertNotice tone="bad" testId="cert-section-refusal">{refusalFor(section)}</CertNotice>
	{/if}
{/snippet}

{#snippet submission(part: SubmissionPart, evidence: EvidenceItem[], selfInspection: string[])}
	{@const state = formFor(part)}
	{#if state.open && attempt}
		<SubmissionForm attemptId={attempt.id} {part} {evidence} {selfInspection} upload={uploader} {post} />
	{:else if !state.open}
		<p class="cert-help cert-form-why" data-testid="cert-form-why" data-reason={state.reason}>{state.words}</p>
	{/if}
	<ReviewHistory submissions={submissionsFor(attempt, part)} />
{/snippet}

<div class="cert-kit" data-testid="cert-kit">
	<section class="cert-panel cert-kit-section" id={id('definition')} data-testid="cert-kit-section" data-section="definition">
		<Disclosure label={KIT_SECTION_WORDS.definition} heading={2} scope={scope('definition')}>
			{@render refused('definition')}
			<dl class="cert-facts cert-definition">
				<dt>Means</dt>
				<dd>{cert.definition}</dd>
				<dt>Allows</dt>
				<dd>{cert.allows}</dd>
				<dt>Does not allow</dt>
				<dd>{cert.does_not_allow}</dd>
			</dl>
		</Disclosure>
	</section>

	<section class="cert-panel cert-kit-section" id={id('training')} data-testid="cert-kit-section" data-section="training">
		<Disclosure label={KIT_SECTION_WORDS.training} heading={2} scope={scope('training')}>
			{@render refused('training')}
			{#if pkg.training.items.length === 0}
				<p class="cert-help">No training content yet.</p>
			{/if}
			{#each pkg.training.items as item (item.key)}
				{@const progress = trainingProgressFor(cert.my_training, item.key)}
				{#if item.kind === 'video'}
					<VideoItem {item} certId={cert.id} {progress} checkinTimeoutSeconds={checkinTimeout} {rpc} onreported={() => onchanged?.()} />
				{:else}
					<LessonFrame {item} lesson={lessonsBySlug.get(item.slug) ?? null} certId={cert.id} {progress} {rpc} onreported={() => onchanged?.()} />
				{/if}
				{#each quickChecksAfter(item.key) as check (check.id)}
					<QuickCheck {check} certId={cert.id} {rpc} />
				{/each}
			{/each}
		</Disclosure>
	</section>

	<section class="cert-panel cert-kit-section" id={id('practice')} data-testid="cert-kit-section" data-section="practice">
		<Disclosure label={KIT_SECTION_WORDS.practice} heading={2} scope={scope('practice')}>
			<p class="cert-help">Ungraded. Its own questions, written from the exam's topics; never the exam's questions.</p>
			<PracticeQuiz questions={pkg.practice_quiz} certId={cert.id} {rpc} />
		</Disclosure>
	</section>

	<section class="cert-panel cert-kit-section" id={id('study')} data-testid="cert-kit-section" data-section="study">
		<Disclosure label={KIT_SECTION_WORDS.study} heading={2} scope={scope('study')}>
			<div class="cert-prose cert-study">
				{#if pkg.study_guide.trim()}<MarkdownText body={pkg.study_guide} />{:else}<p class="cert-help">No study guide yet.</p>{/if}
			</div>
		</Disclosure>
	</section>

	<section class="cert-panel cert-kit-section" id={id('mistakes')} data-testid="cert-kit-section" data-section="mistakes">
		<Disclosure label={KIT_SECTION_WORDS.mistakes} heading={2} scope={scope('mistakes')}>
			{#if pkg.common_mistakes.length === 0}
				<p class="cert-help">None written down yet.</p>
			{:else}
				<ul class="cert-well cert-mistakes" data-testid="cert-mistakes">
					{#each pkg.common_mistakes as m, i (i)}
						<li class="cert-mistake">
							<span class="cert-mistake-glyph cert-tone-warn" aria-hidden="true">!</span>
							<div><strong>{m.title}</strong><p class="cert-mistake-body">{m.body}</p></div>
						</li>
					{/each}
				</ul>
			{/if}
		</Disclosure>
	</section>

	{#if pkg.parts.guided && pkg.guided_project}
		<section class="cert-panel cert-kit-section" id={id('guided')} data-testid="cert-kit-section" data-section="guided">
			<Disclosure label={KIT_SECTION_WORDS.guided} heading={2} scope={scope('guided')}>
				{@render refused('guided')}
				<p class="cert-help">A follow-along project that teaches the skill. The help fades as you go, so you are working alone by the end. A certifier passes it.</p>
				<ProjectView project={pkg.guided_project} kind="guided" code={cert.code} />
				{@render submission('guided', pkg.guided_project.evidence, pkg.guided_project.self_inspection)}
			</Disclosure>
		</section>
	{/if}

	{#if pkg.parts.exam}
		<section class="cert-panel cert-kit-section" id={id('exam')} data-testid="cert-kit-section" data-section="exam">
			<Disclosure label={KIT_SECTION_WORDS.exam} heading={2} scope={scope('exam')}>
				{@render refused('exam')}
				<ExamSection {cert} {post} />
			</Disclosure>
		</section>
	{/if}

	{#if pkg.parts.autonomous && pkg.autonomous_project}
		<section class="cert-panel cert-kit-section" id={id('autonomous')} data-testid="cert-kit-section" data-section="autonomous">
			<Disclosure label={KIT_SECTION_WORDS.autonomous} heading={2} scope={scope('autonomous')}>
				{@render refused('autonomous')}
				<CertNotice tone="warn" title="Done alone." testId="cert-outside-help">{OUTSIDE_HELP_SENTENCE}</CertNotice>
				<ProjectView project={pkg.autonomous_project} kind="autonomous" code={cert.code} />
				{@render submission('autonomous', pkg.autonomous_project.evidence, pkg.autonomous_project.self_inspection)}
			</Disclosure>
		</section>
	{/if}

	{#if pkg.parts.checkout && pkg.checkout}
		<section class="cert-panel cert-kit-section" id={id('checkout')} data-testid="cert-kit-section" data-section="checkout">
			<Disclosure label={KIT_SECTION_WORDS.checkout} heading={2} scope={scope('checkout')}>
				{@render refused('checkout')}
				<p class="cert-help">Perform the skill cold, start to finish, with no help: in person when a certifier is available, or on one continuous unlisted YouTube video.</p>
				<h4 class="cert-section-h">Checkout card</h4>
				<div class="cert-prose"><MarkdownText body={pkg.checkout.card} /></div>
				<h4 class="cert-section-h">Filming guide</h4>
				<div class="cert-prose"><MarkdownText body={pkg.checkout.filming_guide} /></div>
				{@render submission('checkout', CHECKOUT_EVIDENCE, CHECKOUT_SELF_INSPECTION)}
			</Disclosure>
		</section>
	{/if}
</div>

<style>
	.cert-kit-section {
		margin-bottom: 1rem;
	}
	.cert-kit-section :global(.disc-trigger) {
		font-size: 0.86rem;
		letter-spacing: 0.12em;
	}
	.cert-definition {
		margin: 0.25rem 0 0.5rem;
	}
	.cert-definition dd {
		line-height: 1.5;
	}
	.cert-form-why {
		margin: 0.75rem 0;
	}
	.cert-mistake {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		padding: 0.6rem 0;
		min-height: 44px;
	}
	.cert-mistake-glyph {
		font-family: var(--font-mono);
		font-weight: 700;
		flex: none;
		width: 1.2rem;
		text-align: center;
	}
	.cert-mistake-body {
		margin: 0.15rem 0 0;
		line-height: 1.45;
		color: var(--text-1);
	}
	.cert-study {
		margin-top: 0.25rem;
	}
</style>
