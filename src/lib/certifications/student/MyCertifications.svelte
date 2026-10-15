<script lang="ts">
	/**
	 * My certifications (ledger 0391): earned awards grouped by category, then
	 * level, as `AwardCard`s; in-progress attempts with their checklist progress
	 * ("3 of 5 parts done") linking to the certification page; and the history
	 * (withdrawn and dormant attempts, expired awards) in a closed Disclosure.
	 * Suspended and revoked awards stay in the earned grid with their status
	 * said, because they are records of this person's own.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { certHref } from '$lib/certifications/nav';
	import { PART_WORDS, partsProgress } from '$lib/certifications/parts';
	import { formatCertDate } from '$lib/certifications/status';
	import type { CertAttemptJson, CertAwardMine, CertMeJson } from '$lib/certifications/types';
	import AwardCard from './AwardCard.svelte';
	import CertNotice from './CertNotice.svelte';

	let { me }: { me: CertMeJson } = $props();

	interface Group {
		category: string;
		levels: { level: number; awards: CertAwardMine[] }[];
	}
	const earned = $derived(me.awards.filter((a) => a.status !== 'expired'));
	const expired = $derived(me.awards.filter((a) => a.status === 'expired'));
	const groups = $derived.by((): Group[] => {
		const out: Group[] = [];
		for (const a of earned) {
			let g = out.find((x) => x.category === a.category);
			if (!g) {
				g = { category: a.category, levels: [] };
				out.push(g);
			}
			let l = g.levels.find((x) => x.level === a.level);
			if (!l) {
				l = { level: a.level, awards: [] };
				g.levels.push(l);
				g.levels.sort((p, q) => p.level - q.level);
			}
			l.awards.push(a);
		}
		return out;
	});
	const inProgress = $derived(me.attempts.filter((a) => a.state === 'active'));
	const history = $derived(me.attempts.filter((a) => a.state === 'withdrawn' || a.state === 'dormant'));
	const historyCount = $derived(history.length + expired.length);

	const progressWords = (a: CertAttemptJson) => {
		const p = partsProgress(a.checks);
		return `${p.done} of ${p.total} parts done`;
	};
	const nextWords = (a: CertAttemptJson) => (a.next_part ? `Next: ${PART_WORDS[a.next_part]}` : "Every part is checked; the award is a certifier's press away");
</script>

<div class="cert-me" data-testid="cert-me">
	<section class="cert-me-section" aria-labelledby="cert-me-earned-h">
		<h2 class="cert-section-h" id="cert-me-earned-h">Earned <span class="cert-readout">{earned.length}</span></h2>
		{#if earned.length === 0}
			<CertNotice tone="quiet" title="Nothing earned yet." testId="cert-me-no-awards">Start one from the catalog. Every part you finish shows up here.</CertNotice>
		{:else}
			{#each groups as g (g.category)}
				<h3 class="cert-me-category">{g.category}</h3>
				{#each g.levels as l (l.level)}
					<p class="cert-me-level"><span class="cert-readout">Level {l.level}</span></p>
					<div class="cert-cols">
						{#each l.awards as award (award.id)}
							<AwardCard {award} />
						{/each}
					</div>
				{/each}
			{/each}
		{/if}
	</section>

	<section class="cert-me-section" aria-labelledby="cert-me-progress-h">
		<h2 class="cert-section-h" id="cert-me-progress-h">In progress <span class="cert-readout">{inProgress.length}</span></h2>
		{#if inProgress.length === 0}
			<p class="cert-help" data-testid="cert-me-no-progress">Nothing in progress right now.</p>
		{:else}
			<ul class="cert-well cert-me-attempts" data-testid="cert-me-attempts">
				{#each inProgress as a (a.id)}
					<li class="cert-me-attempt" data-testid="cert-me-attempt">
						<div class="cert-me-attempt-body">
							<a class="cert-me-attempt-name" href={certHref(a.certification.code)}>{a.certification.name}</a>
							<span class="cert-help">{a.certification.code}, started {formatCertDate(a.started_at)}. {nextWords(a)}.</span>
						</div>
						<span class="cert-readout is-info" data-testid="cert-me-progress">{progressWords(a)}</span>
						<a class="btn secondary cert-btn" href={certHref(a.certification.code)}>Continue</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="cert-panel cert-me-history" data-testid="cert-me-history">
		<Disclosure label="History" heading={2} collapseWhen={true} scope="cert:me:history" testId="cert-me-history-toggle">
			{#snippet meta()}{historyCount} {historyCount === 1 ? 'item' : 'items'}{/snippet}
			{#if historyCount === 0}
				<p class="cert-help">Nothing here yet. Withdrawn and dormant attempts and expired awards will be listed.</p>
			{:else}
				<ul class="cert-well cert-me-attempts">
					{#each history as a (a.id)}
						<li class="cert-me-attempt" data-testid="cert-me-history-row" data-kind={a.state}>
							<div class="cert-me-attempt-body">
								<a class="cert-me-attempt-name" href={certHref(a.certification.code)}>{a.certification.name}</a>
								<span class="cert-help">{a.certification.code}, started {formatCertDate(a.started_at)}{#if a.withdrawn_at}, withdrawn {formatCertDate(a.withdrawn_at)}{/if}</span>
							</div>
							<span class="cert-readout {a.state === 'dormant' ? 'is-warn' : ''}">{a.state === 'dormant' ? 'Dormant' : 'Withdrawn'}</span>
							<a class="btn secondary cert-btn" href={certHref(a.certification.code)}>{a.state === 'dormant' ? 'Continue' : 'Start again'}</a>
						</li>
					{/each}
					{#each expired as a (a.id)}
						<li class="cert-me-attempt" data-testid="cert-me-history-row" data-kind="expired">
							<div class="cert-me-attempt-body">
								<a class="cert-me-attempt-name" href={certHref(a.code)}>{a.name}</a>
								<span class="cert-help"><span class="cert-serial">{a.serial}</span>, awarded {formatCertDate(a.awarded_at)}, expired {formatCertDate(a.expires_at)}</span>
							</div>
							<span class="cert-readout is-bad"><span aria-hidden="true">✕</span> Expired</span>
							<a class="btn secondary cert-btn" href={certHref(a.code)}>Retake</a>
						</li>
					{/each}
				</ul>
			{/if}
		</Disclosure>
	</section>
</div>

<style>
	.cert-me-section {
		margin: 0 0 1.5rem;
	}
	.cert-me-section h2 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.cert-me-category {
		margin: 0.5rem 0 0.4rem;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
	}
	.cert-me-category::before {
		content: none;
	}
	.cert-me-level {
		margin: 0 0 0.6rem;
	}
	.cert-me-attempts {
		margin: 0;
	}
	.cert-me-attempt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.9rem;
		min-height: 44px;
		padding: 0.5rem 0;
	}
	.cert-me-attempt-body {
		display: grid;
		flex: 1 1 14rem;
		min-width: 0;
	}
	.cert-me-attempt-name {
		color: var(--text-1);
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.cert-me-attempt-name:hover {
		color: var(--hover-ink, var(--green));
	}
</style>
