<script lang="ts">
	/**
	 * THE TRUSTED-PUBLISHER APPLICATION, BOTH HALVES, ON ONE PAGE (report
	 * 6d076258). The real components, in the room, with in-memory transports:
	 *
	 *   student   the form a student fills in (open state, six questions,
	 *             two of them tricks the student cannot tell apart), then the
	 *             waiting, trusted, cooldown and not-yet-switched-on states.
	 *   admin     the applications panel (one pending application with a red
	 *             flag, one decided), the question editor and the roster.
	 *
	 * Nothing here reaches a database; Approve, Decline, Save and Send record
	 * what they were handed in `last`, which a spec reads.
	 */
	import '$lib/foundry/forge.css';
	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryPublisherApplications from '$lib/foundry/FoundryPublisherApplications.svelte';
	import FoundryPublisherApply from '$lib/foundry/FoundryPublisherApply.svelte';
	import FoundryPublisherQuestions from '$lib/foundry/FoundryPublisherQuestions.svelte';
	import FoundryReviewNav from '$lib/foundry/FoundryReviewNav.svelte';
	import FoundryShell from '$lib/foundry/FoundryShell.svelte';
	import FoundryTrustRoster from '$lib/foundry/FoundryTrustRoster.svelte';
	import type {
		FoundryPublisherApplication,
		FoundryPublisherQuestion,
		FoundryPublisherQuestionAdmin,
		FoundryPublisherStatus,
		PublisherRead
	} from '$lib/foundry/publisher';

	const NOW = new Date('2026-10-01T16:00:00Z');

	/* The six drafted questions 0230 seeds, as the editor reads them. */
	const ADMIN_QUESTIONS: FoundryPublisherQuestionAdmin[] = [
		['What do you want to publish, and who is it for?', 'text', [], [], false, 'Look for a real audience and a plan.'],
		['Why should your apps go live without waiting in the review queue?', 'text', [], [], false, 'Wanting to skip the rules is a red flag.'],
		['Who wrote the code in your apps? Say what you wrote yourself, what an AI tool wrote, and what came from somewhere else.', 'text', [], [], false, 'Any honest mix is fine.'],
		[
			"A friend's game was sent back by a reviewer. They ask you to publish it under your name so it skips the queue. What do you do?",
			'choice',
			['Publish it under my name', 'Say no, and help them fix what the reviewer found', 'Publish it with a new title so nobody notices'],
			['Publish it under my name', 'Publish it with a new title so nobody notices'],
			true,
			'Trick question. Either publish answer means they would use the trusted path to get around a review.'
		],
		[
			'Which of these would you put in an app that goes live without review?',
			'choice',
			['A joke that names a classmate', 'A button that sends people to another site without saying where', 'A pop-up that asks for a school password', 'None of these'],
			['A joke that names a classmate', 'A button that sends people to another site without saying where', 'A pop-up that asks for a school password'],
			true,
			'Trick question. Only "None of these" is acceptable.'
		],
		['Someone reports a problem with one of your apps. What do you do?', 'text', [], [], false, 'Look for taking it seriously.']
	].map(([prompt, kind, choices, flags, trick, note], i) => ({
		id: `aaaaaaaa-0000-4000-8000-00000000000${i + 1}`,
		position: i + 1,
		prompt: prompt as string,
		kind: kind as 'text' | 'choice',
		choices: choices as string[],
		flag_choices: flags as string[],
		is_trick: trick as boolean,
		reviewer_note: note as string,
		active: true,
		updated_at: '2026-10-01T00:00:00Z',
		updated_by: null
	}));

	/* What a STUDENT is sent: the prompts and choices and nothing else. */
	const STUDENT_QUESTIONS: FoundryPublisherQuestion[] = ADMIN_QUESTIONS.map((q) => ({
		id: q.id,
		position: q.position,
		prompt: q.prompt,
		kind: q.kind,
		choices: q.choices
	}));

	function status(over: Partial<FoundryPublisherStatus> = {}): PublisherRead<FoundryPublisherStatus> {
		return {
			state: 'ready',
			value: {
				ok: true,
				eligible: true,
				trusted: false,
				questions: STUDENT_QUESTIONS,
				application: null,
				cooldown_until: null,
				...over
			}
		};
	}

	const PENDING: FoundryPublisherApplication = {
		id: 'bbbbbbbb-0000-4000-8000-000000000001',
		applicant: 'cccccccc-0000-4000-8000-000000000001',
		applicant_email: 'ana.reyes.2029@boscotech.net',
		applicant_display_name: null,
		applicant_full_name: 'Ana Reyes',
		status: 'pending',
		submitted_at: '2026-09-30T15:00:00Z',
		decided_at: null,
		decided_by: null,
		decision_note: null,
		trusted_now: false,
		flagged_count: 1,
		answers: ADMIN_QUESTIONS.map((q, i) => ({
			question_id: q.id,
			position: q.position,
			prompt: q.prompt,
			kind: q.kind,
			answer: q.kind === 'choice' ? q.choices[i === 3 ? 0 : 3]! : 'A physics game for my class to practise projectile motion.',
			is_trick: q.is_trick,
			flagged: i === 3,
			reviewer_note: q.reviewer_note
		}))
	};
	const DECIDED: FoundryPublisherApplication = {
		...PENDING,
		id: 'bbbbbbbb-0000-4000-8000-000000000002',
		applicant: 'cccccccc-0000-4000-8000-000000000002',
		applicant_email: 'sam.cruz.2028@boscotech.net',
		applicant_full_name: 'Sam Cruz',
		status: 'approved',
		decided_at: '2026-09-29T15:00:00Z',
		decided_by: 'apina@boscotech.edu',
		decision_note: 'Welcome aboard.',
		trusted_now: true,
		flagged_count: 0,
		answers: PENDING.answers.map((a) => ({ ...a, flagged: false }))
	};

	let last = $state('(nothing yet)');
</script>

<svelte:head><title>dev: Foundry publishers</title></svelte:head>

<div class="fg-root">
	<FoundryShell active="review" isAdmin={true} reviewPending={1}>
		<FoundryPage heading="Trusted publisher" measure="52rem" testid="harness-student">
			<p class="note">Last transport call: <code data-testid="last-call">{last}</code></p>
			<section data-state="open">
				<FoundryPublisherApply
					read={status()}
					now={NOW}
					apply={async (answers) => {
						last = JSON.stringify({ apply: Object.keys(answers).length });
						return { ok: true, submittedAt: NOW.toISOString() };
					}}
				/>
			</section>
			<section data-state="pending">
				<FoundryPublisherApply
					read={status({
						application: {
							id: 'x',
							status: 'pending',
							submitted_at: '2026-09-30T15:00:00Z',
							decided_at: null,
							decision_note: null
						}
					})}
					now={NOW}
				/>
			</section>
			<section data-state="cooldown">
				<FoundryPublisherApply
					read={status({
						application: {
							id: 'y',
							status: 'declined',
							submitted_at: '2026-09-28T15:00:00Z',
							decided_at: '2026-09-29T15:00:00Z',
							decision_note: 'Tell me more about who wrote the code, then try again.'
						},
						cooldown_until: '2026-10-06T15:00:00Z'
					})}
					now={NOW}
				/>
			</section>
			<section data-state="trusted">
				<FoundryPublisherApply read={status({ trusted: true })} now={NOW} />
			</section>
			<section data-state="unavailable">
				<FoundryPublisherApply read={{ state: 'unavailable' }} now={NOW} />
			</section>
		</FoundryPage>

		<FoundryPage
			heading="Publishers"
			lead="Students who asked to publish without waiting for review, the questions they answer, and everybody who is already trusted."
			testid="harness-admin"
		>
			{#snippet nav()}
				<FoundryReviewNav active="publishers" pendingApps={1} pendingApplications={1} />
			{/snippet}
			<FoundryPublisherApplications
				pending={{ state: 'ready', value: [PENDING] }}
				decided={{ state: 'ready', value: [DECIDED] }}
				decide={async (id, decision, note) => {
					last = JSON.stringify({ decide: decision, note });
					return { ok: true, status: decision === 'approve' ? 'approved' : 'declined' };
				}}
			/>
			<FoundryPublisherQuestions
				read={{ state: 'ready', value: ADMIN_QUESTIONS }}
				save={async (qs) => {
					last = JSON.stringify({ save: qs.length });
					return { ok: true, active: qs.length, retired: 0 };
				}}
			/>
			<FoundryTrustRoster
				rows={[
					{
						email: 'sam.cruz.2028@boscotech.net',
						granted_by: 'apina@boscotech.edu',
						granted_at: '2026-09-29T15:00:00Z',
						note: 'Approved from a publisher application'
					}
				]}
				transports={{
					async grantTrust() {
						return { ok: true };
					},
					async revokeTrust() {
						return { ok: true };
					}
				}}
			/>
		</FoundryPage>
	</FoundryShell>
</div>

<style>
	section {
		display: block;
	}

	.note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
	}
</style>
