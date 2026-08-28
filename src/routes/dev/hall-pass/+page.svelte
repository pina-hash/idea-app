<script lang="ts">
	import HallPass from '$lib/classroom/HallPass.svelte';
	import type {
		HallPassClosed,
		HallPassManagerState,
		HallPassOpened,
		HallPassResult,
		HallPassState,
		HallPassStudentState,
		HallPassTransports
	} from '$lib/classroom/hall-pass';

	/**
	 * DEV HARNESS for the digital hall pass, dev-only and 404 in production
	 * (see +page.ts).
	 *
	 * IT MOUNTS THE REAL COMPONENT, once per projection, so what is drawn here
	 * is what a student and an instructor actually see. The five mounts are the
	 * five states the payload can be in, which is the whole state space: a
	 * student with the pass free, a student holding it, a student blocked by a
	 * peer, a manager with somebody out, and a manager with nobody out.
	 *
	 * WHY IT EXISTS. 0143 shipped this feature with no harness of any kind, so
	 * the one control it has -- a 44px phone target, `aria-disabled` rather than
	 * `disabled` so it can explain itself -- had never been measured anywhere.
	 * 0144 then split the close by role, which put a BRANCH in the handler
	 * behind that control: a manager sends the pass id from their own payload
	 * and a student sends nothing. A branch is exactly what `svelte-check`
	 * cannot see, and the wrong side of it is invisible on screen -- the button
	 * looks identical either way.
	 *
	 * THE TRANSPORTS RECORD WHAT WAS SENT, which is the point of the harness
	 * rather than a convenience: the assertion that matters after 0144 is that
	 * the manager's press carried the PASS ID it was looking at and the
	 * student's carried no identifier at all. That is readable here, in the log
	 * beneath each mount, without a database.
	 *
	 * NOTE FOR WHOEVER OWNS `tools/`: this route is deliberately NOT in
	 * `tools/browser-verify/routes.mjs`, because the session that added it was
	 * scoped out of that directory. Adding it there is a one-line change and
	 * would put the hall pass control into the automated 375/1440 sweep.
	 */

	/** A pinned instant, so every elapsed label is deterministic. */
	const NOW = Date.parse('2026-08-28T17:42:00Z');
	const OPENED = new Date(NOW - 6 * 60_000).toISOString();

	const SECTION = '11111111-1111-1111-1111-111111111111';
	const PASS_ID = '22222222-2222-2222-2222-222222222222';

	/** What each mount's transports were asked to do, newest last. */
	let log = $state<string[]>([]);

	/**
	 * IN-MEMORY TRANSPORTS THAT RECORD THE ARGUMENT. They answer immediately and
	 * never touch the network. `closeById` and `closeMine` are separate methods
	 * for the same reason they are separate in `$lib/classroom/hall-pass`: a
	 * single close taking a role flag is what let the section-keyed close serve
	 * both callers, which is the defect 0144 removes.
	 */
	function transports(label: string): HallPassTransports {
		const note = (line: string) => {
			log = [...log, `${label}: ${line}`];
		};
		return {
			async load() {
				return null;
			},
			async open(sectionId: string): Promise<HallPassResult<HallPassOpened>> {
				note(`open(section=${sectionId.slice(0, 8)})`);
				return { ok: true, data: { pass_id: PASS_ID, opened_at: OPENED } };
			},
			async closeMine(sectionId: string): Promise<HallPassResult<HallPassClosed>> {
				// THE STUDENT SENDS NO IDENTIFIER. The section is the only argument.
				note(`closeMine(section=${sectionId.slice(0, 8)}) -- no identifier sent`);
				return {
					ok: true,
					data: {
						pass_id: PASS_ID,
						opened_at: OPENED,
						closed_at: new Date(NOW).toISOString(),
						closed_by_manager: false,
						student_name: null
					}
				};
			},
			async closeById(passId: string): Promise<HallPassResult<HallPassClosed>> {
				// THE MANAGER NAMES THE PASS, and this is the line to read: the id
				// must be the one from the payload on screen, not the section.
				note(`closeById(pass=${passId.slice(0, 8)}) -- named the pass`);
				return {
					ok: true,
					data: {
						pass_id: passId,
						opened_at: OPENED,
						closed_at: new Date(NOW).toISOString(),
						closed_by_manager: true,
						student_name: 'Ana Reyes'
					}
				};
			}
		};
	}

	const studentFree: HallPassStudentState = {
		scope: 'student',
		section_id: SECTION,
		taken: false,
		mine: false,
		opened_at: null
	};
	const studentMine: HallPassStudentState = {
		scope: 'student',
		section_id: SECTION,
		taken: true,
		mine: true,
		opened_at: OPENED
	};
	/** A PEER HOLDS IT: taken, not mine, and `opened_at` withheld even as a value. */
	const studentBlocked: HallPassStudentState = {
		scope: 'student',
		section_id: SECTION,
		taken: true,
		mine: false,
		opened_at: null
	};
	const managerOpen: HallPassManagerState = {
		scope: 'manager',
		section_id: SECTION,
		taken: true,
		mine: false,
		open: {
			pass_id: PASS_ID,
			student_email: 'ana@boscotech.net',
			student_name: 'Ana Reyes',
			opened_at: OPENED
		},
		history: [
			{
				pass_id: PASS_ID,
				student_email: 'ana@boscotech.net',
				student_name: 'Ana Reyes',
				opened_at: OPENED,
				closed_at: null,
				closed_by: null
			},
			{
				pass_id: '33333333-3333-3333-3333-333333333333',
				student_email: 'ben@boscotech.net',
				student_name: 'Ben Okonkwo',
				opened_at: new Date(NOW - 52 * 60_000).toISOString(),
				closed_at: new Date(NOW - 45 * 60_000).toISOString(),
				closed_by: 'ben@boscotech.net'
			}
		]
	};
	const managerEmpty: HallPassManagerState = {
		scope: 'manager',
		section_id: SECTION,
		taken: false,
		mine: false,
		open: null,
		history: []
	};

	const MOUNTS: { key: string; label: string; state: HallPassState }[] = [
		{ key: 'student-free', label: 'Student, pass free', state: studentFree },
		{ key: 'student-mine', label: 'Student, holding it', state: studentMine },
		{ key: 'student-blocked', label: 'Student, a peer holds it', state: studentBlocked },
		{ key: 'manager-open', label: 'Instructor, somebody out', state: managerOpen },
		{ key: 'manager-empty', label: 'Instructor, nobody out', state: managerEmpty }
	];
</script>

<svelte:head><title>Hall pass harness</title></svelte:head>

<div class="cr-root wrap">
	<h1>Hall pass harness</h1>
	<p class="lede">
		The real <code>HallPass</code> in all five projections, against in-memory transports. The log
		beneath each mount records what the transport was handed: an instructor's close names the
		PASS, a student's names nothing.
	</p>

	{#each MOUNTS as mount (mount.key)}
		<section class="mount" data-mount={mount.key}>
			<h2>{mount.label}</h2>
			<HallPass
				sectionId={SECTION}
				state={mount.state}
				transports={transports(mount.key)}
				now={NOW}
			/>
		</section>
	{/each}

	<section class="mount">
		<h2>Read-only (no transports)</h2>
		<!-- ABSENCE IS THE MECHANISM: an omitted transports object removes both
		     controls, rather than a flag somebody honours. -->
		<HallPass sectionId={SECTION} state={managerOpen} transports={null} now={NOW} />
	</section>

	<section class="mount">
		<h2>Transport log</h2>
		{#if log.length === 0}
			<p class="lede">Nothing pressed yet.</p>
		{:else}
			<ul class="log" data-testid="hall-pass-log">
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
	.log {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-1);
		padding-left: 1.1rem;
		line-height: 1.7;
	}
</style>
