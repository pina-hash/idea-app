<script lang="ts">
	import SongQueue from '$lib/classroom/SongQueue.svelte';
	import type {
		SongDecided,
		SongQueueManagerState,
		SongQueueState,
		SongQueueStudentState,
		SongQueueTransports,
		SongRequested,
		SongResult
	} from '$lib/classroom/song-queue';

	/**
	 * DEV HARNESS for the classroom song queue, dev-only and 404 in production
	 * (see +page.ts).
	 *
	 * IT MOUNTS THE REAL COMPONENT, once per projection, so what is drawn here is
	 * what a student and an instructor actually see. The five mounts are the
	 * states the payload can be in that DIFFER ON SCREEN: a student with room to
	 * ask, a student at the cap (the `aria-disabled` control that has to explain
	 * itself), a student reading their own rejection, a manager with a queue to
	 * work, and a manager with nothing waiting.
	 *
	 * WHY IT EXISTS. The one thing this feature gives a student is a form on a
	 * phone: two inputs and a button, at 375px, against the 44px floor. None of
	 * that is visible to `svelte-check`, and the cap control in particular is
	 * `aria-disabled` rather than `disabled` precisely so it can still be tapped
	 * and still say why -- a property that only a real browser can be asked
	 * about.
	 *
	 * AND THE DISCLOSURE IS READABLE HERE. The student mounts are handed student
	 * payloads, whose TYPE has no field capable of naming a classmate, so "what
	 * does a student see" is answerable by looking at this page rather than by
	 * reasoning about a filter. The approved list below deliberately contains a
	 * row somebody else asked for: it renders as a link with no name.
	 *
	 * THE TRANSPORTS RECORD WHAT WAS SENT, which is the point rather than a
	 * convenience: the assertions that matter are that a student's submit carries
	 * NO identifier, and that each decision carries the REQUEST ID the instructor
	 * was looking at rather than a section. Both are readable in the log beneath
	 * the mounts, with no database.
	 *
	 * NOTE FOR WHOEVER OWNS `tools/`: this route is deliberately NOT in
	 * `tools/browser-verify/routes.mjs`, because the session that added it was
	 * scoped out of that directory. Adding it there is a one-line change and
	 * would put the song queue's form and its four controls into the automated
	 * 375/1440 sweep.
	 */

	/** A pinned instant, so every waiting label is deterministic. */
	const NOW = Date.parse('2026-08-28T17:42:00Z');
	const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

	const SECTION = '11111111-1111-1111-1111-111111111111';

	/** What each mount's transports were asked to do, newest last. */
	let log = $state<string[]>([]);

	/**
	 * IN-MEMORY TRANSPORTS THAT RECORD THE ARGUMENT. They answer immediately and
	 * never touch the network. `approve` and `reject` are separate methods for
	 * the same reason they are separate in `$lib/classroom/song-queue`: a single
	 * decision taking a boolean is what lets a caller take the wrong side of a
	 * branch, and the reason being a required parameter of `reject` is one of the
	 * properties worth seeing exercised.
	 */
	function transports(label: string): SongQueueTransports {
		const note = (line: string) => {
			log = [...log, `${label}: ${line}`];
		};
		return {
			async load() {
				return null;
			},
			async submit(
				sectionId: string,
				url: string,
				noteText: string | null
			): Promise<SongResult<SongRequested>> {
				// THE STUDENT SENDS NO IDENTIFIER. The section, the link and the note
				// are the only arguments there are.
				note(
					`submit(section=${sectionId.slice(0, 8)}, url=${url}, note=${noteText ?? 'null'}) -- no identifier sent`
				);
				return { ok: true, data: { request_id: 'new-request', pending: 1, cap: 3 } };
			},
			async approve(requestId: string): Promise<SongResult<SongDecided>> {
				// THE MANAGER NAMES THE REQUEST, and this is the line to read: the id
				// must be the row's own, not the section's.
				note(`approve(request=${requestId}) -- named the request`);
				return {
					ok: true,
					data: { request_id: requestId, status: 'approved', student_name: 'Ana Reyes', charged: 2 }
				};
			},
			async reject(requestId: string, reason: string): Promise<SongResult<SongDecided>> {
				note(`reject(request=${requestId}, reason="${reason}") -- charged nothing`);
				return {
					ok: true,
					data: { request_id: requestId, status: 'rejected', student_name: 'Ana Reyes', charged: 0 }
				};
			}
		};
	}

	/**
	 * A STUDENT WITH ROOM TO ASK. The approved list holds one row somebody else
	 * asked for and one of their own -- the peer's renders with no name, because
	 * `SongApprovedRow` has no field that could carry one.
	 */
	const studentOpen: SongQueueStudentState = {
		scope: 'student',
		section_id: SECTION,
		price: 2,
		pending_cap: 3,
		my_pending: 1,
		approved: [
			{
				request_id: 'a1',
				url: 'https://example.com/watch?v=abc123&list=xyz',
				note: 'for the last ten minutes',
				decided_at: ago(90),
				mine: false
			},
			{ request_id: 'a2', url: 'https://cdn.example.net/a/b/c.mp3', note: null, decided_at: ago(30), mine: true }
		],
		mine: [
			{
				request_id: 'm1',
				url: 'https://cdn.example.net/a/b/c.mp3',
				note: null,
				created_at: ago(45),
				decided_at: ago(30),
				rejection_reason: null,
				status: 'approved'
			},
			{
				request_id: 'm2',
				url: 'https://open.example.org/track/4Xyz',
				note: 'clean version',
				created_at: ago(6),
				decided_at: null,
				rejection_reason: null,
				status: 'pending'
			}
		]
	};

	/** AT THE CAP: the Request control is aria-disabled and must say why. */
	const studentCapped: SongQueueStudentState = {
		...studentOpen,
		my_pending: 3,
		approved: [],
		mine: [
			{
				request_id: 'c1',
				url: 'https://example.com/one',
				note: null,
				created_at: ago(20),
				decided_at: null,
				rejection_reason: null,
				status: 'pending'
			},
			{
				request_id: 'c2',
				url: 'https://example.com/two',
				note: null,
				created_at: ago(12),
				decided_at: null,
				rejection_reason: null,
				status: 'pending'
			},
			{
				request_id: 'c3',
				url: 'https://example.com/three',
				note: null,
				created_at: ago(4),
				decided_at: null,
				rejection_reason: null,
				status: 'pending'
			}
		]
	};

	/** READING THEIR OWN REJECTION, which reaches them and nobody else. */
	const studentRejected: SongQueueStudentState = {
		...studentOpen,
		my_pending: 0,
		approved: [],
		mine: [
			{
				request_id: 'r1',
				url: 'https://example.com/loud',
				note: null,
				created_at: ago(200),
				decided_at: ago(180),
				rejection_reason: 'Lyrics are not classroom appropriate. Try the clean version.',
				status: 'rejected'
			}
		]
	};

	/** NO PRICE SET: the retired-category state, which 0145 refuses approvals on. */
	const studentUnpriced: SongQueueStudentState = { ...studentOpen, price: null };

	const managerBusy: SongQueueManagerState = {
		scope: 'manager',
		section_id: SECTION,
		price: 2,
		pending_cap: 3,
		pending: [
			{
				request_id: 'p1',
				url: 'https://example.com/watch?v=abc123&list=xyz',
				note: 'for the last ten minutes',
				created_at: ago(22),
				student_email: 'ana@boscotech.net',
				student_name: 'Ana Reyes',
				status: 'pending'
			},
			{
				request_id: 'p2',
				url: 'https://open.example.org/track/4Xyz',
				note: null,
				created_at: ago(7),
				student_email: 'ben@boscotech.net',
				student_name: 'Ben Okonkwo',
				status: 'pending'
			}
		],
		decided: [
			{
				request_id: 'd1',
				url: 'https://cdn.example.net/a/b/c.mp3',
				note: null,
				created_at: ago(120),
				decided_at: ago(100),
				decided_by: 'tvargas@boscotech.edu',
				rejection_reason: null,
				student_email: 'ana@boscotech.net',
				student_name: 'Ana Reyes',
				status: 'approved'
			},
			{
				request_id: 'd2',
				url: 'https://example.com/loud',
				note: null,
				created_at: ago(200),
				decided_at: ago(180),
				decided_by: 'tvargas@boscotech.edu',
				rejection_reason: 'Lyrics are not classroom appropriate.',
				student_email: 'ben@boscotech.net',
				student_name: 'Ben Okonkwo',
				status: 'rejected'
			}
		]
	};

	const managerEmpty: SongQueueManagerState = {
		...managerBusy,
		pending: [],
		decided: []
	};

	const mounts: { label: string; state: SongQueueState; live: boolean }[] = [
		{ label: 'student / room to ask', state: studentOpen, live: true },
		{ label: 'student / at the cap', state: studentCapped, live: true },
		{ label: 'student / own rejection', state: studentRejected, live: true },
		{ label: 'student / no price set', state: studentUnpriced, live: true },
		{ label: 'manager / queue to work', state: managerBusy, live: true },
		{ label: 'manager / nothing waiting', state: managerEmpty, live: true },
		// TRANSPORTS OMITTED: read-only is STRUCTURAL, not a flag. There is no
		// form, no Approve and no Reject in this mount because there is no write
		// to execute -- which is what the class page renders for a viewer on a
		// deployment where the writes are not available.
		{ label: 'manager / no transports (read-only)', state: managerBusy, live: false }
	];
</script>

<svelte:head><title>dev / song queue</title></svelte:head>

<div class="harness cr-root">
	<h1>Song queue (0145)</h1>
	<p class="lead">
		The REAL <code>SongQueue</code> in each projection, against in-memory transports. Nothing here
		touches Supabase. Measure at 375px: every control has a 44px floor, and the Request button on
		the capped mount is <code>aria-disabled</code> rather than <code>disabled</code>, so it still
		takes the tap and answers with the cap.
	</p>

	{#each mounts as mount (mount.label)}
		<section class="mount" data-mount={mount.label}>
			<h2>{mount.label}</h2>
			<SongQueue
				sectionId={SECTION}
				state={mount.state}
				transports={mount.live ? transports(mount.label) : null}
				now={NOW}
			/>
		</section>
	{/each}

	<section class="mount">
		<h2>What the transports were asked</h2>
		{#if log.length === 0}
			<p class="lead">Nothing yet. Use a control above.</p>
		{:else}
			<ul class="log" data-testid="song-queue-log">
				{#each log as line, i (i)}
					<li>{line}</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.lead {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.mount {
		min-width: 0;
	}
	.log {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.76rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
</style>
