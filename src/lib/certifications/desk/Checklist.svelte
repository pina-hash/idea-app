<script lang="ts">
	/**
	 * The requirement checklist the student's page draws, drawn here for a
	 * certifier: one row per part in the fixed order, a glyph, the part's
	 * word, its state in words, and who checked it and when. The shape is
	 * `cert.css`'s `.cert-check-row` so the two surfaces cannot drift.
	 */
	import { CERT_PARTS, type CertCheckJson } from '$lib/certifications/types';
	import { PART_WORDS } from '$lib/certifications/parts';
	import { formatCertDate } from '$lib/certifications/status';
	import { CHECK_READOUTS } from './desk';

	let { checks, testId = 'cert-checklist' }: { checks: CertCheckJson[]; testId?: string | null } = $props();

	const ordered = $derived(
		CERT_PARTS.map((part) => checks.find((c) => c.part === part)).filter((c): c is CertCheckJson => !!c)
	);
</script>

<ol class="cert-checklist" data-testid={testId}>
	{#each ordered as check (check.part)}
		{@const r = CHECK_READOUTS[check.state]}
		<li class="cert-check-row is-{check.state}" data-part={check.part} data-state={check.state}>
			<span class="cert-check-glyph" aria-hidden="true">{r.glyph}</span>
			<div>
				<div class="cert-check-word"><strong>{PART_WORDS[check.part]}</strong></div>
				<div class="cert-check-meta">
					{r.word}{#if check.state === 'done' && check.checked_by_name}, checked by {check.checked_by_name}{/if}{#if check.checked_at}
						on {formatCertDate(check.checked_at)}{/if}
				</div>
				{#if check.note}<div class="cert-check-meta">{check.note}</div>{/if}
			</div>
			<span class="cert-readout is-{r.tone}"><span aria-hidden="true">{r.glyph}</span>{r.word}</span>
		</li>
	{/each}
</ol>
