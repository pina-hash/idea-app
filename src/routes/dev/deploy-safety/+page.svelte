<script lang="ts">
	import '$lib/classroom/classroom.css';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import { registerLocalDeckUrl, type ClassroomDeck } from '$lib/classroom/deck';
	import { createEngineTransports } from '$lib/classroom/transports';
	import type {
		AssignmentEngineTransports,
		AssignmentSpec,
		ResponseRow,
		ResponseValue,
		StudentEngineData
	} from '$lib/classroom/assignment-spec';
	import type { ClassroomItem } from '$lib/classroom/classroom';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { describeBuild } from '$lib/feedback/context';
	import { appendLog } from './harness';

	/**
	 * A DEPLOY LANDING UNDER AN OPEN PAGE, in a real browser.
	 *
	 * The REAL `AssignmentEngine` (a written answer and a photo zone) and the
	 * REAL `DeckViewer` (`?case=deck`), under the harness layout's counters.
	 * The specs flip SvelteKit's `updated` flag, type or upload or go full
	 * screen, press an ordinary in-app link, and count the full page loads that
	 * follow in `sessionStorage` -- which survives the very reload being
	 * counted.
	 *
	 * WHAT IS REAL AND WHAT IS NOT. The save transport answers in memory after
	 * 300ms and logs its acknowledgement (on `?case=hang` it never answers). The
	 * upload transport is the PRODUCTION one (`createEngineTransports(...).uploadSubmissionFile`), so the
	 * real `uploadClassroomFile` -- the choke point that holds off a reload --
	 * runs, and its PUT is a real request the harness holds open while "Slow
	 * uploads" is on. The engine's other transports never touch the client
	 * handed to the production factory, so it is handed none.
	 */
	let { data } = $props();

	const ITEM_ID = 'item-deploy-1';
	const TEXT_BLOCK = 'b-why';
	const PHOTO_BLOCK = 'z-photo';

	const SPEC = {
		version: '1.1',
		kind: 'assignment',
		meta: { assignmentId: 'idea100-deploy-01', title: 'Bridge lab', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Analysis',
				blocks: [
					{ type: 'instructions', content: 'Answer in two or three sentences, then add a photo.' },
					{ type: 'textField', id: TEXT_BLOCK, prompt: 'What failed first, and why?' },
					{ type: 'imageZone', id: PHOTO_BLOCK, minImages: 1 }
				]
			}
		]
	} as unknown as AssignmentSpec;

	const ITEM = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Bridge lab writeup',
		attachments: []
	} as unknown as ClassroomItem;

	let serverRows = $state<ResponseRow[]>([]);

	const engineData: StudentEngineData = $derived({
		spec: SPEC,
		rubric: null,
		submission: null,
		responses: serverRows,
		files: [],
		approvals: []
	});

	const production = createEngineTransports(null as unknown as SupabaseClient);

	const transports = {
		async saveResponse(_itemId: string, blockId: string, value: ResponseValue) {
			// `?case=hang`: the request leaves and never answers, the shape a dead
			// wifi connection gives a save -- what the guard's deadline is for.
			if (data.dsCase === 'hang') return new Promise<never>(() => {});
			await new Promise((resolve) => setTimeout(resolve, 300));
			serverRows = [
				...serverRows.filter((r) => r.block_id !== blockId),
				{ item_id: ITEM_ID, student_email: 'student@boscotech.net', block_id: blockId, value }
			];
			appendLog({ kind: 'ack', at: Date.now(), name: blockId });
			return { ok: true as const, data: { ok: true } };
		},
		async reloadStudent() {
			return { ok: true as const, data: engineData };
		},
		async submitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		async unsubmitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		uploadSubmissionFile: production.uploadSubmissionFile,
		async deleteSubmissionFile() {
			return { ok: true as const, data: { ok: true } };
		},
		async setFileCaption() {
			return { ok: true as const, data: { ok: true } };
		}
	} as unknown as AssignmentEngineTransports;

	const DECK: ClassroomDeck = {
		id: 'deck-deploy-1',
		item_id: ITEM_ID,
		title: 'Bridge lab deck',
		entry_path: 'index.html',
		thumbnail_path: null,
		file_count: 1,
		total_bytes: 420,
		has_state_file: true,
		slides: []
	};
	registerLocalDeckUrl(DECK.id, DECK.entry_path, '/dev/deploy-safety/slide');
</script>

<svelte:head><title>Deploy safety</title></svelte:head>

{#if data.dsCase === 'deck'}
	<!-- IN THE ROOM THE REAL DECK ROUTE IS IN: its report control relocated into
	     the bar (the real route's `controls` snippet), and the shell's floating
	     copies absent, as the real route's exclusion makes them (see the style
	     block). A floating control left over the bar sits on Full screen. -->
	<DeckViewer deck={DECK} backHref="/dev/deploy-safety/next" backLabel="Back to the class">
		{#snippet controls()}
			<SiteFeedback
				place="relocated"
				routeId="/classroom/[sectionId]/item/[itemId]/deck"
				pathname="/dev/deploy-safety"
				role="teacher"
				build={describeBuild({ sha: 'a1b2c3d', complete: true }, null)}
				submit={async () => ({ error: null, retryable: false })}
				label="Report"
			/>
		{/snippet}
	</DeckViewer>
{:else}
	<main class="harness">
		<h1>A new version lands under an open page</h1>
		<nav class="ds-links" aria-label="In-app links">
			<a class="btn secondary tap-44" href="/dev/deploy-safety/next" data-testid="link-next">
				Next page
			</a>
			<a class="btn secondary tap-44" href="/dev/deploy-safety?case=deck" data-testid="link-deck">
				The deck
			</a>
			<a class="btn secondary tap-44" href="/fsp/live" data-testid="link-projector">
				A projector surface
			</a>
			<a class="btn secondary tap-44" href="/dev/deploy-safety/editors" data-testid="link-editors">
				The editors
			</a>
		</nav>
		<div class="engine-box card" data-testid="engine-here">
			<AssignmentEngine item={ITEM} data={engineData} {transports} />
		</div>
	</main>
{/if}

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-3) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	.ds-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* The real deck route is in the shell's exclusion registry, so neither the
	   floating report control nor voice navigation is rendered over it. A dev
	   route cannot join that registry, so the harness hides them while a deck is
	   on the page, and only then. */
	:global(body:has(.deck-page) .sfb-shell),
	:global(body:has(.deck-page) .vnav) {
		display: none;
	}
	.engine-box {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		background: var(--bg1);
	}
</style>
