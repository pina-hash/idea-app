<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { onMount, tick } from 'svelte';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import {
		createMemoryClassroomLive,
		type ClassroomLive,
		type ClassroomLiveTopic
	} from '$lib/classroom/live';
	import type {
		HallPassClosed,
		HallPassEntry,
		HallPassManagerState,
		HallPassOpened,
		HallPassOpenedFor,
		HallPassResult,
		HallPassStudentState,
		HallPassTransports
	} from '$lib/classroom/hall-pass';
	import type {
		SongDecided,
		SongQueueManagerState,
		SongQueueStudentState,
		SongQueueTransports,
		SongRequestStatus,
		SongRequested,
		SongResult
	} from '$lib/classroom/song-queue';

	/**
	 * DEV HARNESS for the two class-pane TOOLS (prompt 0118), dev-only and 404 in
	 * production (see +page.ts).
	 *
	 * IT MOUNTS THE REAL COMPONENTS in `tool` mode -- the trigger, the chip and
	 * the native dialog -- inside the same `.cr-root` room and the same
	 * `.class-tools` row the section layout renders them in, so a browser spec
	 * measuring this page measures the row a class actually sees. Two rows: the
	 * student projection and the manager projection, each holding both tools.
	 *
	 * ONE SHARED IN-MEMORY LIVE BUS. `createMemoryClassroomLive()` is a real
	 * implementation of the interface, not a stub of it: an announce reaches
	 * every other subscriber synchronously, so the four mounts here behave
	 * exactly as four browsers in one section would. The two "announce"
	 * controls on this page change the FIXTURE and then announce the topic --
	 * which is what a fifth browser writing would look like from these four --
	 * and the chips move with no poll and no press on any tool. That is the one
	 * claim a spec cannot settle from a static page. `?live=stalled` is the
	 * other state a static page cannot reach: the bus reports `stalled`, and
	 * the sentence beneath every trigger is on screen with every dialog shut.
	 *
	 * THE TRANSPORTS READ A MUTABLE STORE rather than answering a constant, so a
	 * refresh after a notice actually has something new to return; every load
	 * is COUNTED per mount, because "the chip changed" is the effect and "the
	 * component re-asked once, not on the poll" is the mechanism, and a spec
	 * should be able to read both.
	 *
	 * WHAT A STUDENT SEES IS READABLE HERE. The student mounts are handed
	 * student payloads, whose TYPES have no field capable of naming a classmate,
	 * so the chip reading "Taken" beside the manager's "1 out · Ana Reyes" is
	 * the disclosure boundary on screen rather than in a comment.
	 */

	let { data } = $props();

	/** A pinned instant, so every elapsed label is deterministic. */
	const NOW = Date.parse('2026-08-28T17:42:00Z');
	const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

	const SECTION = '11111111-1111-1111-1111-111111111111';
	/** The student the two student mounts stand for. */
	const ME = { student_email: 'sam@boscotech.net', student_name: 'Sam Ortiz' };
	const ANA = { student_email: 'ana@boscotech.net', student_name: 'Ana Reyes' };
	const BEN = { student_email: 'ben@boscotech.net', student_name: 'Ben Okonkwo' };
	const ROSTER = [ANA, BEN, ME];
	const LIMITS = { cooldown_minutes: 10, daily_limit: 3 };

	/* ---------------------------------------------------------------- *
	 * THE FIXTURE STORE. Plain mutable objects, deliberately NOT `$state`:
	 * the transports read them from inside effects the components own, and
	 * a reactive store read there would be a dependency of somebody else's
	 * effect. The page's own readouts below are `$state` and are written
	 * beside every mutation.
	 * ---------------------------------------------------------------- */
	interface OpenPass {
		pass_id: string;
		student_email: string;
		student_name: string;
		opened_at: string;
		opened_by: string | null;
	}
	interface SongRow {
		request_id: string;
		url: string;
		note: string | null;
		created_at: string;
		student_email: string;
		student_name: string;
		status: SongRequestStatus;
		decided_at: string | null;
		rejection_reason: string | null;
	}
	const store: { pass: OpenPass | null; history: HallPassEntry[]; songs: SongRow[]; seq: number } = {
		pass: null,
		history: [
			{
				pass_id: 'p-earlier',
				student_email: BEN.student_email,
				student_name: BEN.student_name,
				opened_at: ago(52),
				closed_at: ago(45),
				closed_by: BEN.student_email
			}
		],
		songs: [
			{
				request_id: 's-mine',
				url: 'https://open.example.org/track/4Xyz',
				note: 'clean version',
				created_at: ago(6),
				student_email: ME.student_email,
				student_name: ME.student_name,
				status: 'pending',
				decided_at: null,
				rejection_reason: null
			},
			{
				request_id: 's-ben',
				url: 'https://open.example.org/track/9Abc',
				note: null,
				created_at: ago(40),
				student_email: BEN.student_email,
				student_name: BEN.student_name,
				status: 'approved',
				decided_at: ago(30),
				rejection_reason: null
			}
		],
		seq: 0
	};

	function studentHallState(): HallPassStudentState {
		const mine = store.pass?.student_email === ME.student_email;
		return {
			scope: 'student',
			section_id: SECTION,
			taken: !!store.pass,
			mine,
			opened_at: mine && store.pass ? store.pass.opened_at : null,
			limits: LIMITS,
			used_today: 1
		};
	}
	function managerHallState(): HallPassManagerState {
		return {
			scope: 'manager',
			section_id: SECTION,
			taken: !!store.pass,
			mine: false,
			open: store.pass
				? {
						pass_id: store.pass.pass_id,
						student_email: store.pass.student_email,
						student_name: store.pass.student_name,
						opened_at: store.pass.opened_at
					}
				: null,
			history: [
				...(store.pass
					? [
							{
								pass_id: store.pass.pass_id,
								student_email: store.pass.student_email,
								student_name: store.pass.student_name,
								opened_at: store.pass.opened_at,
								closed_at: null,
								closed_by: null,
								opened_by: store.pass.opened_by
							}
						]
					: []),
				...store.history
			],
			limits: LIMITS,
			roster: ROSTER
		};
	}
	function studentSongState(): SongQueueStudentState {
		const mine = store.songs.filter((s) => s.student_email === ME.student_email);
		return {
			scope: 'student',
			section_id: SECTION,
			price: 2,
			pending_cap: 3,
			my_pending: mine.filter((s) => s.status === 'pending').length,
			approved: store.songs
				.filter((s) => s.status === 'approved')
				.map((s) => ({
					request_id: s.request_id,
					url: s.url,
					note: s.note,
					decided_at: s.decided_at ?? s.created_at,
					mine: s.student_email === ME.student_email
				})),
			mine: mine.map((s) => ({
				request_id: s.request_id,
				url: s.url,
				note: s.note,
				created_at: s.created_at,
				decided_at: s.decided_at,
				rejection_reason: s.rejection_reason,
				status: s.status
			}))
		};
	}
	function managerSongState(): SongQueueManagerState {
		return {
			scope: 'manager',
			section_id: SECTION,
			price: 2,
			pending_cap: 3,
			pending: store.songs
				.filter((s) => s.status === 'pending')
				.map((s) => ({
					request_id: s.request_id,
					url: s.url,
					note: s.note,
					created_at: s.created_at,
					student_email: s.student_email,
					student_name: s.student_name,
					status: s.status
				})),
			decided: store.songs
				.filter((s) => s.status !== 'pending')
				.map((s) => ({
					request_id: s.request_id,
					url: s.url,
					note: s.note,
					created_at: s.created_at,
					student_email: s.student_email,
					student_name: s.student_name,
					status: s.status,
					decided_at: s.decided_at ?? s.created_at,
					decided_by: 'pina@boscotech.edu',
					rejection_reason: s.rejection_reason
				}))
		};
	}

	/* ---------------------------------------------------------------- *
	 * READOUTS: what each mount's transport was asked, and every announce
	 * that went over the bus. The counters are what a spec reads to say
	 * "re-asked once, on the notice, not on the poll".
	 * ---------------------------------------------------------------- */
	let log = $state<string[]>([]);
	let loads = $state<Record<string, number>>({
		'student-hall': 0,
		'manager-hall': 0,
		'student-song': 0,
		'manager-song': 0
	});
	let announced = $state<string[]>([]);
	const note = (line: string) => {
		log = [...log, line];
	};

	/**
	 * The one bus, with every announce mirrored into a reactive readout.
	 *
	 * `?live=stalled` reports `stalled` to every subscriber straight after the
	 * memory bus's own `live`, so the last status each mount hears is the one
	 * the query asked for. Notices still flow: a stalled channel is a channel
	 * that reported a fault, not one that was torn down, and the poll underneath
	 * is untouched either way.
	 */
	const bus = createMemoryClassroomLive();
	const live: ClassroomLive = {
		subscribe: (sectionId, onChange, onStatus) => {
			const off = bus.subscribe(sectionId, onChange, onStatus);
			if (data.live === 'stalled') onStatus?.('stalled');
			return off;
		},
		announce(sectionId: string, topic: ClassroomLiveTopic) {
			announced = [...announced, topic];
			bus.announce(sectionId, topic);
		}
	};

	function hallTransports(key: 'student-hall' | 'manager-hall'): HallPassTransports {
		const scope = key === 'student-hall' ? 'student' : 'manager';
		return {
			async load() {
				loads = { ...loads, [key]: loads[key] + 1 };
				return scope === 'student' ? studentHallState() : managerHallState();
			},
			async open(): Promise<HallPassResult<HallPassOpened>> {
				if (store.pass) return { ok: false, refusal: 'taken' };
				store.seq += 1;
				store.pass = { pass_id: `p-${store.seq}`, ...ME, opened_at: new Date(NOW).toISOString(), opened_by: null };
				note(`${key}: open() -- no identifier sent`);
				return { ok: true, data: { pass_id: store.pass.pass_id, opened_at: store.pass.opened_at } };
			},
			async closeMine(): Promise<HallPassResult<HallPassClosed>> {
				const p = store.pass;
				if (!p || p.student_email !== ME.student_email) return { ok: false, refusal: 'not_yours' };
				store.pass = null;
				note(`${key}: closeMine() -- no identifier sent`);
				return {
					ok: true,
					data: { pass_id: p.pass_id, opened_at: p.opened_at, closed_at: new Date(NOW).toISOString(), closed_by_manager: false, student_name: null }
				};
			},
			async closeById(passId: string): Promise<HallPassResult<HallPassClosed>> {
				const p = store.pass;
				if (!p || p.pass_id !== passId) return { ok: false, refusal: 'already_closed' };
				store.pass = null;
				note(`${key}: closeById(${passId}) -- named the pass`);
				return {
					ok: true,
					data: { pass_id: p.pass_id, opened_at: p.opened_at, closed_at: new Date(NOW).toISOString(), closed_by_manager: true, student_name: p.student_name }
				};
			},
			async openFor(_sectionId: string, email: string): Promise<HallPassResult<HallPassOpenedFor>> {
				const who = ROSTER.find((r) => r.student_email === email);
				if (!who) return { ok: false, refusal: 'not_enrolled' };
				if (store.pass) return { ok: false, refusal: 'taken' };
				store.seq += 1;
				store.pass = { pass_id: `p-${store.seq}`, ...who, opened_at: new Date(NOW).toISOString(), opened_by: 'pina@boscotech.edu' };
				note(`${key}: openFor(${email}) -- named the student`);
				return {
					ok: true,
					data: { pass_id: store.pass.pass_id, opened_at: store.pass.opened_at, ...who, opened_by: 'pina@boscotech.edu' }
				};
			}
		};
	}

	function songTransports(key: 'student-song' | 'manager-song'): SongQueueTransports {
		const scope = key === 'student-song' ? 'student' : 'manager';
		const decide = (requestId: string, status: SongRequestStatus, reason: string | null): SongResult<SongDecided> => {
			const row = store.songs.find((s) => s.request_id === requestId);
			if (!row) return { ok: false, message: 'No such request.' };
			if (row.status !== 'pending') return { ok: false, refusal: 'already_decided', detail: { status: row.status } };
			row.status = status;
			row.decided_at = new Date(NOW).toISOString();
			row.rejection_reason = reason;
			return {
				ok: true,
				data: { request_id: requestId, status, student_name: row.student_name, charged: status === 'approved' ? 2 : 0 }
			};
		};
		return {
			async load() {
				loads = { ...loads, [key]: loads[key] + 1 };
				return scope === 'student' ? studentSongState() : managerSongState();
			},
			async submit(_sectionId: string, url: string, noteText: string | null): Promise<SongResult<SongRequested>> {
				store.seq += 1;
				store.songs = [
					{ request_id: `s-${store.seq}`, url, note: noteText, created_at: new Date(NOW).toISOString(), ...ME, status: 'pending', decided_at: null, rejection_reason: null },
					...store.songs
				];
				note(`${key}: submit(url=${url}) -- no identifier sent`);
				const pending = store.songs.filter((s) => s.student_email === ME.student_email && s.status === 'pending').length;
				return { ok: true, data: { request_id: `s-${store.seq}`, pending, cap: 3 } };
			},
			async approve(requestId: string) {
				note(`${key}: approve(${requestId}) -- named the request`);
				return decide(requestId, 'approved', null);
			},
			async reject(requestId: string, reason: string) {
				note(`${key}: reject(${requestId}, "${reason}") -- charged nothing`);
				return decide(requestId, 'rejected', reason);
			}
		};
	}

	/* THE FOUR MOUNTS' TRANSPORTS AND INITIAL STATES, built once. */
	const studentHall = hallTransports('student-hall');
	const managerHall = hallTransports('manager-hall');
	const studentSong = songTransports('student-song');
	const managerSong = songTransports('manager-song');
	const initialStudentHall = studentHallState();
	const initialManagerHall = managerHallState();
	const initialStudentSong = studentSongState();
	const initialManagerSong = managerSongState();

	/* ---------------------------------------------------------------- *
	 * THE ANNOUNCE CONTROLS: a fifth browser writing. Each changes the
	 * store and then announces the topic, exactly as a component does after
	 * its own successful write -- and nothing on this page tells any mount
	 * to refresh. If a chip moves, the notice moved it.
	 * ---------------------------------------------------------------- */
	function classmateTakesPass(): void {
		if (store.pass) return;
		store.seq += 1;
		store.pass = { pass_id: `p-${store.seq}`, ...ANA, opened_at: ago(3), opened_by: null };
		note('page: a classmate (Ana) took the pass; announcing hall-pass');
		live.announce(SECTION, 'hall-pass');
	}
	function teacherApprovesMine(): void {
		const row = store.songs.find((s) => s.request_id === 's-mine');
		if (!row || row.status !== 'pending') return;
		row.status = 'approved';
		row.decided_at = new Date(NOW).toISOString();
		note("page: the teacher approved Sam's song; announcing song-queue");
		live.announce(SECTION, 'song-queue');
	}
	function announceUnrelated(): void {
		// A notice for the OTHER topic must move nothing on the hall pass, and
		// vice versa; this is the negative control for the two above.
		note('page: announced hall-pass with nothing changed');
		live.announce(SECTION, 'hall-pass');
	}

	/**
	 * `?open=` OPENS ONE DIALOG ON LOAD, by pressing the real trigger after the
	 * mounts settle. Pressing rather than a prop: the components' contract is
	 * two props (`live`, `tool`) and a third one that exists for a harness
	 * would be a prop production never sets. `showModal()` needs no gesture,
	 * so a programmatic click opens it exactly as a finger would.
	 */
	onMount(() => {
		if (!data.open) return;
		void tick().then(() => {
			const trigger = document.querySelector<HTMLButtonElement>(
				`[data-projection="${data.scope}"] [data-testid="${data.open}-tool"]`
			);
			trigger?.click();
		});
	});
</script>

<svelte:head><title>Class tools harness</title></svelte:head>

<div class="cr-root wrap">
	<h1>Class tools harness</h1>
	<p class="lede">
		The real <code>HallPass</code> and <code>SongQueue</code> in <code>tool</code> mode: a trigger
		with a live chip, and a dialog holding the card. Both projections share one in-memory live bus;
		the controls under the rows write to the fixture and announce, the way a fifth browser would.
	</p>

	<section class="mount" data-projection="student">
		<h2>Student</h2>
		<div class="class-tools" data-testid="class-tools">
			<HallPass
				sectionId={SECTION}
				state={initialStudentHall}
				transports={studentHall}
				now={NOW}
				{live}
				tool
			/>
			<SongQueue
				sectionId={SECTION}
				state={initialStudentSong}
				transports={studentSong}
				now={NOW}
				{live}
				tool
			/>
		</div>
	</section>

	<section class="mount" data-projection="manager">
		<h2>Instructor</h2>
		<div class="class-tools" data-testid="class-tools">
			<HallPass
				sectionId={SECTION}
				state={initialManagerHall}
				transports={managerHall}
				now={NOW}
				{live}
				tool
			/>
			<SongQueue
				sectionId={SECTION}
				state={initialManagerSong}
				transports={managerSong}
				now={NOW}
				{live}
				tool
			/>
		</div>
	</section>

	<section class="mount">
		<h2>A fifth browser</h2>
		<div class="controls">
			<button type="button" class="btn" data-testid="announce-hall-pass" onclick={classmateTakesPass}>
				A classmate takes the pass
			</button>
			<button type="button" class="btn" data-testid="announce-song-queue" onclick={teacherApprovesMine}>
				The teacher approves your song
			</button>
			<button type="button" class="btn" data-testid="announce-unrelated" onclick={announceUnrelated}>
				Announce hall pass, nothing changed
			</button>
		</div>
	</section>

	<section class="mount">
		<h2>Readouts</h2>
		<p class="counters" data-testid="load-counters">
			{#each Object.entries(loads) as [key, n] (key)}
				<span class="counter" data-testid={`loads-${key}`}>{key} loads {n}</span>
			{/each}
		</p>
		<p class="counters">
			<span class="counter" data-testid="announced">announced {announced.length}: {announced.join(', ') || 'nothing'}</span>
		</p>
		{#if log.length === 0}
			<p class="lede">Nothing written yet.</p>
		{:else}
			<ul class="log" data-testid="tools-log">
				{#each log as line, i (i)}
					<li>{line}</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--space-4);
		min-width: 0;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--text-1);
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: var(--space-4) 0 var(--space-2);
	}
	.lede {
		color: var(--text-2);
		line-height: 1.5;
	}
	.mount {
		min-width: 0;
	}
	/*
	 * THE SAME WRAPPER THE SECTION LAYOUT RENDERS AROUND THE TWO TOOLS
	 * (`src/routes/classroom/[sectionId]/+layout.svelte`, `.class-tools`): the
	 * two rules below are that file's, COPIED VERBATIM, and
	 * `tests/classroom-hall-pass-tool.test.ts` pins the two rule bodies equal --
	 * a harness that measured a slightly different row (this one used to carry a
	 * wider gap, no `align-items` and no child rule) is a harness whose numbers
	 * are not the class page's. If the layout's rule moves, that test reddens
	 * and this copy moves with it.
	 */
	.class-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	.class-tools > :global(*) {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.counters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-1);
	}
	.log {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-1);
		padding-left: 1.1rem;
		line-height: 1.7;
	}
</style>
