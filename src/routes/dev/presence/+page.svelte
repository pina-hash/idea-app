<script lang="ts">
	import { page } from '$app/state';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import PresenceHeartbeat from '$lib/classroom/presence/PresenceHeartbeat.svelte';
	import {
		PRESENCE_LIMITS_FALLBACK,
		PRESENCE_STATES,
		presenceActiveLabel,
		type PresencePayload,
		type PresenceRow,
		type PresenceState
	} from '$lib/classroom/presence/state';
	import { createMemoryPresence } from '$lib/classroom/presence/transports';
	import type { PresenceBeat } from '$lib/classroom/presence/heartbeat';
	import type {
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type {
		AssignmentTeacherTransports,
		GradingData
	} from '$lib/classroom/assignment-spec';
	import type { TxResult } from '$lib/classroom/classroom';

	/**
	 * THE REAL CONSOLE AND THE REAL HEARTBEAT. The argument for every row of the
	 * fixture is in `+page.ts`; this file builds them and drives them.
	 */

	const section: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'A',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	const item = {
		id: 'i-1',
		kind: 'assignment',
		title: 'Cantilever bridge sketch',
		body: 'Sketch it, dimension it, and say why.',
		points: 20,
		published: true
	} as unknown as ClassroomItem;

	const forced = $derived(
		PRESENCE_STATES.includes(page.url.searchParams.get('state') as PresenceState)
			? (page.url.searchParams.get('state') as PresenceState)
			: null
	);
	const presenceOff = $derived(page.url.searchParams.get('presence') === 'off');

	const ROSTER: ClassroomEnrollment[] = [
		{ section_id: 's-1', student_email: 'ana@boscotech.net', display_name: 'Ana Reyes', active: true },
		{ section_id: 's-1', student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: true },
		{
			section_id: 's-1',
			student_email: 'cruz@boscotech.net',
			display_name: 'Cruz Delgado',
			active: true
		},
		{ section_id: 's-1', student_email: 'dee@boscotech.net', display_name: 'Dee Marsh', active: true },
		{
			section_id: 's-1',
			student_email: 'eli@boscotech.net',
			display_name: 'Eli Nakamura',
			active: true
		}
	];

	/**
	 * NO WORK ON THE FIXTURE, deliberately. This harness is about presence, and a
	 * student with nothing handed in is exactly the row a presence line carries
	 * the most information on -- "not opened" and "working for 25 minutes" are
	 * the two things an empty grading row cannot tell them apart by.
	 */
	const grading: GradingData = {
		roster: ROSTER,
		submissions: [],
		responses: [],
		files: [],
		approvals: []
	};

	/**
	 * OFFSETS, NOT INSTANTS. See `+page.ts`: presence is a function of elapsed
	 * time, so a fixture pinned to a literal drifts into `away` for every row and
	 * goes on looking plausible while it does.
	 */
	const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

	/** One student per state, plus a fifth with NO ROW -- "never opened". */
	function naturalRows(): PresenceRow[] {
		return [
			{
				student_email: 'ana@boscotech.net',
				state: null,
				last_seen_at: ago(4),
				last_input_at: ago(4),
				page_visible: true,
				active_seconds: 1_512,
				first_seen_at: ago(2_400)
			},
			{
				student_email: 'ben@boscotech.net',
				state: null,
				last_seen_at: ago(9),
				last_input_at: ago(420),
				page_visible: true,
				active_seconds: 247,
				first_seen_at: ago(1_800)
			},
			{
				student_email: 'cruz@boscotech.net',
				state: null,
				last_seen_at: ago(22),
				last_input_at: ago(95),
				page_visible: false,
				active_seconds: 46,
				first_seen_at: ago(700)
			},
			{
				// ZERO ACTIVE SECONDS ON A STUDENT WHO HAS BEEN AWAY. This is the
				// row the coverage sentence exists for -- a reader who sees 0s and no
				// sentence concludes the student did nothing.
				student_email: 'dee@boscotech.net',
				state: null,
				last_seen_at: ago(640),
				last_input_at: null,
				page_visible: true,
				active_seconds: 0,
				first_seen_at: ago(660)
			}
		];
	}

	/**
	 * `?state=` PUTS EVERY ROW IN ONE STATE, by moving the stamps rather than by
	 * writing the state down. The chip on screen is then still whatever
	 * `presenceState` decides, so this cannot paint a state the real rule would
	 * not have produced -- which a fixture that set `state` directly could.
	 */
	function forcedRows(state: PresenceState): PresenceRow[] {
		const shape: Record<PresenceState, { seen: number; input: number | null; visible: boolean }> =
			{
				working: { seen: 5, input: 5, visible: true },
				viewing: { seen: 5, input: 400, visible: true },
				'open-elsewhere': { seen: 20, input: 90, visible: false },
				away: { seen: 600, input: 650, visible: true }
			};
		const s = shape[state];
		return naturalRows().map((row) => ({
			...row,
			last_seen_at: ago(s.seen),
			last_input_at: s.input === null ? null : ago(s.input),
			page_visible: s.visible
		}));
	}

	const payload = $derived<PresencePayload>({
		item_id: 'i-1',
		section_id: 's-1',
		at: new Date().toISOString(),
		limits: PRESENCE_LIMITS_FALLBACK,
		students: forced ? forcedRows(forced) : naturalRows()
	});

	const presence = $derived(
		presenceOff ? null : { loadPresence: async () => payload }
	);

	// ---------------------------------------------------------------------
	// THE STUDENT SIDE, through the SAME in-memory twin the rules live in.
	//
	// Its clock is this page's own, so a period can be driven through it in
	// milliseconds -- and its throttle and credit rule are the database's, so
	// the counter below is what a real period would produce.
	// ---------------------------------------------------------------------
	let simNow = $state(Date.now());
	const twin = createMemoryPresence({
		now: () => simNow,
		studentEmail: 'ana@boscotech.net'
	});
	let beats = $state(0);
	let writes = $state(0);
	let seconds = $state(0);

	function sendBeat(beat: PresenceBeat) {
		twin.ping(beat);
		beats = twin.beats.length;
		writes = twin.writes();
		seconds = twin.rows.get('ana@boscotech.net')?.active_seconds ?? 0;
	}

	/** Advance the twin's clock, which is what makes a beat land rather than throttle. */
	function advance(seconds_: number) {
		simNow += seconds_ * 1000;
	}

	/**
	 * THE GRADING TRANSPORTS, AND THE FOUR WRITES REFUSE RATHER THAN NO-OP.
	 *
	 * `AssignmentTeacherTransports` requires them, so absence is not available
	 * here the way it is for `close` and `presence` -- and a harness that
	 * silently accepted a grade would be a surface where pressing Save looks like
	 * it worked. A refusal that names the harness is the honest answer: this page
	 * is about presence, and nothing on it is a grading fixture.
	 */
	const REFUSED = 'This harness does not grade. Use /dev/grading-bulk.';
	const transports: AssignmentTeacherTransports = {
		loadGrading: async (): Promise<TxResult<GradingData>> => ({ ok: true, data: grading }),
		setSpec: async () => ({ ok: false, message: REFUSED }),
		setRubric: async () => ({ ok: false, message: REFUSED }),
		gradeSubmission: async () => ({ ok: false, message: REFUSED }),
		approveModule: async () => ({ ok: false, message: REFUSED })
	};
</script>

<svelte:head><title>dev / presence</title></svelte:head>

<main class="harness cr-root">
	<header class="head">
		<h1>Presence on the grading console</h1>
		<p class="lede">
			The real <code>GradingConsole</code> with the real
			<code>PresenceLine</code>. One student per state, plus a fifth who has never opened it.
		</p>
		<nav class="links" data-testid="presence-links">
			<a href="/dev/presence">Natural</a>
			{#each PRESENCE_STATES as s (s)}
				<a href="/dev/presence?state={s}">{s}</a>
			{/each}
			<a href="/dev/presence?presence=off">No transport</a>
		</nav>
	</header>

	<!--
		THE STUDENT SIDE, MOUNTED FOR REAL. It renders nothing, which is the
		point: the readout below is this harness's own, driven from the beats the
		component emits through `onbeat`.
	-->
	<PresenceHeartbeat send={sendBeat} onbeat={() => undefined} />

	<section class="card sim" data-testid="presence-sim">
		<h2>The heartbeat, driven</h2>
		<p class="sim-note">
			The in-memory twin applies the same 20 second floor and the same credit rule the
			database does. Advance the clock, then beat.
		</p>
		<div class="sim-row">
			<button type="button" class="btn tiny" onclick={() => advance(30)}>+30s</button>
			<button type="button" class="btn tiny" onclick={() => advance(5)}>+5s</button>
			<button
				type="button"
				class="btn tiny"
				data-testid="sim-beat"
				onclick={() => sendBeat({ typed: true, visible: true })}>Beat (typed)</button
			>
			<button
				type="button"
				class="btn tiny"
				onclick={() => sendBeat({ typed: false, visible: true })}>Beat (idle)</button
			>
		</div>
		<dl class="sim-out" data-testid="sim-out">
			<div><dt>Beats sent</dt><dd data-testid="sim-beats">{beats}</dd></div>
			<div><dt>Row writes</dt><dd data-testid="sim-writes">{writes}</dd></div>
			<div><dt>Active</dt><dd data-testid="sim-active">{presenceActiveLabel(seconds)}</dd></div>
		</dl>
	</section>

	<GradingConsole
		{section}
		{item}
		spec={null}
		rubric={[
			{
				id: 'c1',
				criterion: 'Sketch',
				points: 20,
				levels: [
					{ label: 'Proficient', short: 'P', points: 20, descriptor: 'Clear and scaled.' },
					{ label: 'Developing', short: 'D', points: 10, descriptor: 'Rough.' },
					{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing usable.' }
				]
			}
		]}
		{transports}
		{presence}
	/>
</main>

<style>
	.harness {
		padding: var(--space-3) var(--space-3) var(--space-5);
	}
	.head {
		max-width: 60rem;
		margin: 0 auto var(--space-3);
	}
	.lede {
		color: var(--text-2);
		margin: 0 0 var(--space-2);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.links a {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		/* 44px, because a harness is still a surface somebody taps. */
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	.sim {
		max-width: 60rem;
		margin: 0 auto var(--space-3);
		padding: var(--space-3);
	}
	.sim h2 {
		margin: 0 0 var(--space-1);
		font-size: 1rem;
	}
	.sim-note {
		color: var(--text-2);
		font-size: 0.8rem;
		margin: 0 0 var(--space-2);
	}
	.sim-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.sim-out {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin: 0;
	}
	.sim-out div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.sim-out dt {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
	}
	.sim-out dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1.1rem;
		color: var(--green);
	}
</style>
