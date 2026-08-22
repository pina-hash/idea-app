<script lang="ts">
	import CheckInGuidance from '$lib/CheckInGuidance.svelte';
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import { guidanceWordCount, type GuidanceSaveResult } from '$lib/check-in-guidance';
	import type { ItemDoc } from '$lib/classroom/classroom-doc';
	import type { TiptapNode } from '$lib/rich-text';
	import '$lib/notebook/notebook-theme.css';

	/**
	 * DEV HARNESS for the guidance prompt field (0123), dev-only and 404 in
	 * production (see +page.ts).
	 *
	 * IT MOUNTS THE REAL COMPONENTS. `CheckInGuidance` in BOTH of its modes --
	 * staging (no `onsave`, the composer's shape) and saving (with one, the
	 * review console's and the item page's) -- plus the `Disclosure` + `ItemBody`
	 * pair the two READING surfaces use, so what is drawn here is what a student
	 * and an instructor actually see. No auth, no Supabase, no network: the save
	 * transport answers in memory and can be made to refuse.
	 *
	 * WHY IT EXISTS beyond the usual rule. The field is a rich-text editor
	 * (dynamically imported, browser-only) wired to a five-state save machine,
	 * and neither of those is visible to `svelte-check`. It is also where this
	 * bundle's ONE browser-only defect was found: mounting the editor inside the
	 * review console's check-in list wedged the renderer, and an isolated mount
	 * is what separated "the editor is broken" from "the editor is broken THERE".
	 *
	 * `?refuse=1` makes every save a REFUSAL, which is the path the save-state
	 * vocabulary exists for: reported once, in the server's own words, never
	 * retried.
	 */
	let refuse = $state(false);
	let stagedDoc = $state<TiptapNode | null>(null);
	let savedDoc = $state<TiptapNode | null>(null);
	let saveCount = $state(0);

	/** A seeded prompt, in the STORED shape a real read hands over. */
	const SEED: ItemDoc = [
		{
			type: 'p',
			runs: [
				{ text: 'Photograph ' },
				{ text: 'both pages', bold: true },
				{ text: ' of your teardown notes, flat and in focus.' }
			]
		},
		{
			type: 'ul',
			items: [
				[{ text: 'The bearing numbers you read off the races.' }],
				[
					{ text: 'What you measured, and with what:' },
					{
						type: 'ul',
						items: [[{ text: 'Calipers to the nearest 0.01 mm.' }], [{ text: 'Bore and OD both.' }]]
					}
				]
			]
		},
		{
			type: 'p',
			runs: [
				{ text: 'Torque values are in the ' },
				{ text: 'unit reference', href: 'https://example.org/unit-3' },
				{ text: '.' }
			]
		}
	];

	async function save(doc: TiptapNode | null): Promise<GuidanceSaveResult> {
		saveCount += 1;
		// A real round trip is not instant, and a `writing` state nobody can see
		// is a state nobody can verify.
		await new Promise((r) => setTimeout(r, 250));
		if (refuse) return { ok: false, message: 'Only the teacher of record can write this.' };
		savedDoc = doc;
		return { ok: true, cleared: !doc };
	}
</script>

<div class="harness">
	<h1>Check-in guidance (0123)</h1>
	<label class="row">
		<input type="checkbox" bind:checked={refuse} data-testid="refuse-toggle" />
		<span>Refuse every save (the not-your-class path)</span>
	</label>
	<p class="meta" data-testid="save-count">saves attempted: {saveCount}</p>

	<section>
		<h2>Saving mode (review console / item page)</h2>
		<div class="panel" data-testid="saving-mode">
			<CheckInGuidance value={SEED} onchange={() => {}} onsave={save} testId="guidance-saving" />
		</div>
	</section>

	<section>
		<h2>Staging mode (composer, before the check-in exists)</h2>
		<div class="panel" data-testid="staging-mode">
			<CheckInGuidance
				onchange={(doc) => (stagedDoc = doc)}
				hint="Optional. Students read this in their notebook."
				testId="guidance-staging"
			/>
		</div>
		<p class="meta" data-testid="staged-words">staged words: {guidanceWordCount(stagedDoc)}</p>
	</section>

	<section class="nb-root">
		<h2>How a student reads it</h2>
		<div class="nb-guidance">
			<Disclosure label="What to do" testId="reader-open">
				<ItemBody item={{ body: '', body_doc: SEED }} compact />
			</Disclosure>
		</div>
		<div class="nb-guidance">
			<Disclosure label="What was asked for" collapseWhen={true} testId="reader-started">
				<ItemBody item={{ body: '', body_doc: SEED }} compact />
			</Disclosure>
		</div>
	</section>
</div>

<style>
	.harness {
		max-width: 52rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4);
		display: grid;
		gap: var(--space-5);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		margin: 0;
	}
	.panel {
		padding: var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	.nb-root {
		padding: var(--space-4);
		border-radius: var(--radius-control);
	}
	.nb-guidance {
		min-width: 0;
		margin: 0 0 var(--space-3);
		padding: 0 var(--space-3);
		border: 1px solid var(--hairline);
		border-left: 3px solid var(--nb-accent-ink);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
</style>
