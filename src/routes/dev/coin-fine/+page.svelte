<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import FineScreen from '$lib/coin-fine/FineScreen.svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import type {
		HallPassClosed,
		HallPassEvents,
		HallPassManagerState,
		HallPassResult,
		HallPassStudentState,
		HallPassTransports
	} from '$lib/classroom/hall-pass';
	import { createFakeFine, SECTION_A, SECTION_B } from './fake';

	/**
	 * DEV HARNESS for the IDEA Coin V2 fine screen (404 in production, see
	 * +page.ts). It mounts the REAL `FineScreen` over an in-memory ledger shaped
	 * like 0240's answers, and the REAL `HallPass` card with its warnings and
	 * fines (0243) for an instructor and for a student.
	 *
	 *   ?missing=1      every call answers as a database without the coin update
	 *   ?session=none   no class in session (lands on the last class used, B)
	 *   ?session=b      the second class is in session
	 *   ?embedded=1     the live class panel's shape: one class, no picker
	 *   ?refuse=1       one student's every post is refused, to show it in words
	 *   ?hall=0         leave the hall pass cards out
	 *
	 * THE LOG BENEATH RECORDS WHAT THE COMPONENT SENT, which is the assertion a
	 * screen cannot make: a post names the students and the category and never a
	 * price for a flat fine.
	 */
	const q = untrack(() => page.url.searchParams);
	const missing = q.get('missing') === '1';
	const embedded = q.get('embedded') === '1';
	const session = q.get('session');
	const inSession = session === 'none' ? null : session === 'b' ? SECTION_B : SECTION_A;
	const showHall = q.get('hall') !== '0';

	let log = $state<string[]>([]);
	const note = (line: string) => {
		log = [...log.slice(-30), line];
	};
	const transports = createFakeFine(
		{ missing, inSession, refuse: q.get('refuse') === '1' ? 'ben.okonkwo@boscotech.net' : null },
		note
	);
	let remembered = $state<string | null>(null);

	// ---------------------------------------------------------------------
	// THE HALL PASS, with warnings and fines
	// ---------------------------------------------------------------------
	const NOW = Date.parse('2026-10-14T18:42:00Z');
	const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
	const PASS = '44444444-4444-4444-8444-444444444444';
	const managerEvents: HallPassEvents = {
		scope: 'manager',
		warn_minutes: 10,
		fine_minutes: 20,
		events: [
			{ pass_id: 'p-2', kind: 'fine', minutes: 24.4, created_at: ago(30), opened_at: ago(55), student_name: 'Okonkwo, Ben', student_email: 'ben.okonkwo@boscotech.net', fine_amount: 2 },
			{ pass_id: 'p-2', kind: 'warning', minutes: 24.4, created_at: ago(30), opened_at: ago(55), student_name: 'Okonkwo, Ben', student_email: 'ben.okonkwo@boscotech.net', fine_amount: null },
			{ pass_id: 'p-1', kind: 'warning', minutes: 12.2, created_at: ago(1500), opened_at: ago(1513), student_name: 'Reyes, Ana', student_email: 'ana.reyes@boscotech.net', fine_amount: null }
		]
	};
	const studentEvents: HallPassEvents = {
		scope: 'student',
		warn_minutes: 10,
		fine_minutes: 20,
		events: [{ pass_id: 'p-1', kind: 'warning', minutes: 12.2, created_at: ago(1500), opened_at: ago(1513) }]
	};
	const studentMine: HallPassStudentState = {
		scope: 'student',
		section_id: SECTION_A,
		taken: true,
		mine: true,
		opened_at: ago(23)
	};
	const manager: HallPassManagerState = {
		scope: 'manager',
		section_id: SECTION_A,
		taken: false,
		mine: false,
		open: null,
		history: []
	};
	/** A student closing a pass that ran 23 minutes: the close answers fined, and the events say how much. */
	function studentTransports(): HallPassTransports {
		return {
			async load() {
				return null;
			},
			async open() {
				return { ok: true, data: { pass_id: PASS, opened_at: ago(0) } };
			},
			async closeMine(): Promise<HallPassResult<HallPassClosed>> {
				note('hall pass closeMine()');
				studentEvents.events = [
					{ pass_id: PASS, kind: 'fine', minutes: 23, created_at: ago(0), opened_at: ago(23), fine_amount: 2 },
					{ pass_id: PASS, kind: 'warning', minutes: 23, created_at: ago(0), opened_at: ago(23) },
					...studentEvents.events
				];
				return {
					ok: true,
					data: { pass_id: PASS, opened_at: ago(23), closed_at: ago(0), closed_by_manager: false, student_name: null, warned: true, fined: true }
				};
			},
			async closeById() {
				return { ok: false, message: 'Not in this harness.' };
			}
		};
	}
</script>

<svelte:head><title>Fine screen harness</title></svelte:head>

<div class="harness fh-wrap" data-testid="coin-fine-harness">
	{#if embedded}
		<section class="fh-panel" data-testid="fh-embedded">
			<h2 class="fh-h2">Coins</h2>
			<FineScreen {transports} section={SECTION_A} embedded />
		</section>
	{:else}
		<FineScreen {transports} lastSection={SECTION_B} onSectionUsed={(id) => (remembered = id)} />
	{/if}

	<details class="fh-log">
		<summary>What the screen sent ({log.length})</summary>
		<p data-testid="fh-remembered">Remembered class: {remembered ?? 'none yet'}</p>
		<ol data-testid="fh-log">
			{#each log as line, i (i)}
				<li>{line}</li>
			{/each}
		</ol>
	</details>

	{#if showHall && !missing}
		<div class="cr-root {CLASSROOM_PLATE} fh-hall">
			<h2 class="fh-h2">Hall pass: warnings and fines</h2>
			<section data-mount="hall-manager">
				<h3>Instructor</h3>
				<HallPass sectionId={SECTION_A} state={manager} transports={null} now={NOW} events={async () => managerEvents} />
			</section>
			<section data-mount="hall-student">
				<h3>Student, out 23 minutes</h3>
				<HallPass
					sectionId={SECTION_A}
					state={studentMine}
					transports={studentTransports()}
					now={NOW}
					events={async () => ({ ...studentEvents, events: [...studentEvents.events] })}
				/>
			</section>
		</div>
	{/if}
</div>

<style>
	.fh-wrap {
		box-sizing: border-box;
		max-width: 72rem;
		margin: 0 auto;
		padding: 12px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		background: var(--surface-0);
		min-height: 100dvh;
		position: relative;
		z-index: 1;
	}
	.fh-panel {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: 1rem;
	}
	.fh-h2 {
		margin: 0 0 0.75rem;
		font-size: 1.15rem;
	}
	.fh-log {
		color: var(--text-2);
		font-family: var(--font-mono, monospace);
		font-size: 0.85rem;
	}
	.fh-log summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	.fh-hall {
		display: grid;
		gap: 1rem;
		background: transparent;
	}
	.fh-hall h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		color: var(--text-2);
	}
</style>
