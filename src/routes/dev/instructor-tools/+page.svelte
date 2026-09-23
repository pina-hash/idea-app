<script lang="ts">
	// The room the real route renders in (ledger 0297, harness fidelity): the
	// classroom stylesheet and the route's own measure, or every width read here
	// is a width production never has (CLAUDE.md).
	import '$lib/classroom/classroom.css';
	import { page } from '$app/state';
	import HallPass from '$lib/classroom/HallPass.svelte';
	import PeoplePanel from '$lib/classroom/PeoplePanel.svelte';
	import type { Team, TeamSet, TeamTransports } from '$lib/classroom/teams';
	import type {
		ClassroomEnrollment,
		ClassroomPeopleTransports,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type {
		HallPassResult,
		HallPassOpened,
		HallPassState,
		HallPassStudentState,
		HallPassTransports
	} from '$lib/classroom/hall-pass';

	/**
	 * DEV HARNESS for the four instructor tools, dev-only and 404 in production
	 * (see +page.ts).
	 *
	 * IT MOUNTS THE REAL COMPONENTS. `PeoplePanel` is the whole People tab, so
	 * the Class tools card here is byte-identically the one a teacher sees; the
	 * two `HallPass` mounts are the same component the class page puts at the
	 * top of its pane.
	 *
	 * WHY THESE FOUR STATES. Three of the four tools have no server call at all
	 * -- the CSV, the mail draft and the picker are pure functions over rows the
	 * page already holds -- so what is worth driving is the SURFACE: does the
	 * export land, does the mail control say how many drafts it will open, does
	 * a draw survive a re-render. The fourth is the one with a branch behind it:
	 * a hall pass refused by 0174's limit renders an `aria-disabled` control
	 * that must still explain itself, which is invisible to `svelte-check` and
	 * looks identical to a working one on screen.
	 *
	 * THE ROSTER IS BIG ON PURPOSE. 41 students is past the point where one
	 * `mailto:` URL fits, which is the case the mail control exists to handle
	 * and the one a five-row fixture would never reach.
	 */

	/** A pinned instant, so every elapsed label and every draw is deterministic. */
	const NOW = Date.parse('2026-09-02T18:20:00Z');
	const SECTION_ID = '11111111-1111-1111-1111-111111111111';

	const SECTION: ClassroomSection = {
		id: SECTION_ID,
		course_id: 'c-1',
		label: 'Block 1',
		block: '1',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I', active: true }
	};

	const FIRST = [
		'Ana', 'Ben', 'Cara', 'Diego', 'Elena', 'Farid', 'Gia', 'Hugo',
		'Iris', 'Jonah', 'Kara', 'Luis', 'Mira', 'Noor', 'Omar', 'Pia',
		'Quinn', 'Rosa', 'Samir', 'Tessa', 'Umar', 'Vera', 'Wes', 'Xiomara',
		'Yara', 'Zane', 'Aliyah', 'Bruno', 'Celia', 'Dante', 'Esme', 'Felix',
		'Gemma', 'Hector', 'Ines', 'Jorge', 'Kaia', 'Leo', 'Maya', 'Nico'
	];
	const LAST = [
		'Reyes', 'Ortiz', 'Alvarez', 'Nakamura', 'Okonkwo', 'Haddad', 'Rossi',
		'Petrov', 'Silva', 'Ibrahim'
	];

	/**
	 * 40 active students plus the teacher's own enrollment row (0138), which is
	 * the row the export must LABEL and the mail draft must LEAVE OUT -- two
	 * different correct answers about one row, which is exactly the thing a
	 * fixture without it cannot show.
	 */
	const CLASS_ROSTER: ClassroomEnrollment[] = [
		...FIRST.map((first, i) => ({
			section_id: SECTION_ID,
			student_email: `${first.toLowerCase()}.${LAST[i % LAST.length].toLowerCase()}@boscotech.net`,
			display_name: `${first} ${LAST[i % LAST.length]}`,
			active: i !== 7,
			manages: false
		})),
		{
			section_id: SECTION_ID,
			student_email: 'teacher@boscotech.edu',
			display_name: 'Tee Cher',
			active: true,
			manages: true
		}
	];

	/**
	 * `?class=big` SWAPS IN AN OVERSIZED ROSTER, AND IT EXISTS FOR ONE BRANCH.
	 *
	 * A REALISTIC CLASS DOES NOT REACH THE `mailto:` CEILING, which is worth
	 * writing down because it was measured rather than assumed: 39 recipients at
	 * `first.last@boscotech.net` encode to roughly 1140 characters, well under
	 * the 1800 the module refuses past. So the ordinary case is ONE draft, and
	 * the split -- several links, each saying who is on it -- is a branch no
	 * real roster in this fixture would ever render.
	 *
	 * That branch is exactly the kind that fails silently: a single link that
	 * dropped the overflow renders just as convincingly. So the harness can be
	 * asked for a roster big enough to force it. 68 students is not a claim
	 * about a class size; it is the smallest fixture that crosses the ceiling.
	 */
	const BIG = page.url.searchParams.get('class') === 'big';
	const ROSTER = BIG
		? [
				...Array.from({ length: 68 }, (_, i) => ({
					section_id: SECTION_ID,
					student_email: `${FIRST[i % FIRST.length].toLowerCase()}.${LAST[i % LAST.length].toLowerCase()}${i}@boscotech.net`,
					display_name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`,
					active: true,
					manages: false
				})),
				CLASS_ROSTER[CLASS_ROSTER.length - 1]
			]
		: CLASS_ROSTER;

	/** What a transport was asked to do, newest last. */
	let log = $state<string[]>([]);
	function note(line: string) {
		log = [...log, line];
	}

	const refuse = async () => ({ ok: false as const, message: 'Harness: not wired.' });

	/**
	 * IN-MEMORY PEOPLE TRANSPORTS. Every write refuses, deliberately: this
	 * harness is for the three read-only tools and the panel's own roster
	 * rendering, and a fixture that mutated would make a driven pass
	 * order-dependent. `removeEnrollment` is OMITTED, which is how the Remove
	 * control is absent -- absence is the mechanism everywhere in this module.
	 */
	const peopleTransports: ClassroomPeopleTransports = {
		upsertSection: refuse,
		setSectionActive: refuse,
		deleteSection: refuse,
		async loadRoster() {
			note('loadRoster');
			return { ok: true, data: ROSTER };
		},
		setEnrollment: refuse,
		updateEnrollment: refuse,
		importRoster: refuse
	};

	// -----------------------------------------------------------------------
	// IN-MEMORY TEAMS (0223).
	//
	// THIS FIXTURE IS DELIBERATELY THE HOSTILE SHAPE FOR AN `$effect`. `board`
	// reads and writes `teamSets`, which is `$state`, and calls `note`, which
	// appends to another `$state` array. An effect that called it without
	// `untrack` would take a dependency on everything it touches and re-trigger
	// itself -- `effect_update_depth_exceeded` on mount, naming nothing about
	// the transport. The production transport is a plain Supabase call with no
	// reactivity in it, so only a harness like this one can exercise that, which
	// is exactly why it is written this way.
	//
	// It is also the one fixture where the drawn teams are STYLED, because a
	// student style editor is not mounted anywhere yet: the render path has to
	// be drivable before the surface that writes it exists.
	// -----------------------------------------------------------------------

	const TEAM_SEED = '305441741';

	function seededTeams(): TeamSet[] {
		const names = ROSTER.slice(0, 8);
		const mk = (n: number, from: number, to: number, extra: Partial<Team> = {}): Team => ({
			id: `team-${n}`,
			team_number: n,
			name: null,
			accent_color: null,
			background_type: null,
			background_value: null,
			badge: null,
			flourish: null,
			tagline: null,
			style_updated_by: null,
			style_updated_at: null,
			mine: false,
			members: names.slice(from, to).map((e, i) => ({
				student_email: e.student_email,
				display_name: e.display_name,
				// ONE MEMBER HAS LEFT THE CLASS, because that is the state that
				// will actually occur and the one a screenshot needs to show.
				still_enrolled: !(n === 2 && i === 0)
			})),
			...extra
		});
		return [
			{
				id: 'set-posted',
				label: 'Build teams',
				seed: TEAM_SEED,
				mode: 'count',
				mode_value: 3,
				created_at: '2026-09-02T17:00:00.000Z',
				posted_at: '2026-09-02T17:05:00.000Z',
				visible_until: null,
				showing: true,
				teams: [
					mk(1, 0, 3, {
						name: 'The Gearboxes',
						accent_color: '#3f8f5f',
						background_type: 'gradient',
						background_value: ['#0e1a12', '#1c3326'],
						tagline: 'Built to last',
						style_updated_by: 'alvarez.a@boscotech.net',
						style_updated_at: '2026-09-02T17:30:00.000Z'
					}),
					mk(2, 3, 6, { name: 'Torque Squad', accent_color: '#b06be0' }),
					mk(3, 6, 8)
				]
			},
			{
				id: 'set-draft',
				label: 'Lab partners',
				seed: '48879',
				mode: 'size',
				mode_value: 2,
				created_at: '2026-09-01T17:00:00.000Z',
				posted_at: null,
				visible_until: null,
				showing: false,
				teams: [mk(1, 0, 2), mk(2, 2, 4)]
			}
		];
	}

	let teamSets = $state<TeamSet[]>(seededTeams());

	const teamTransports: TeamTransports = {
		async board() {
			note('teams.board');
			return { ok: true, manages: true, sets: teamSets };
		},
		async save(input) {
			note(`teams.save ${input.label} (${input.mode} ${input.modeValue})`);
			return { ok: true, id: 'set-new' };
		},
		async post(setId) {
			note(`teams.post ${setId}`);
			teamSets = teamSets.map((s) =>
				s.id === setId ? { ...s, posted_at: '2026-09-02T18:00:00.000Z', showing: true } : s
			);
			return { ok: true };
		},
		async unpost(setId) {
			note(`teams.unpost ${setId}`);
			teamSets = teamSets.map((s) =>
				s.id === setId ? { ...s, posted_at: null, visible_until: null, showing: false } : s
			);
			return { ok: true };
		},
		async archive(setId) {
			note(`teams.archive ${setId}`);
			teamSets = teamSets.filter((s) => s.id !== setId);
			return { ok: true };
		}
		// `style` is OMITTED: no style editor is mounted yet, and absence is
		// what removes the controls rather than a flag.
	};

	// -----------------------------------------------------------------------
	// THE HALL PASS, IN THE TWO STATES 0174 ADDED.
	// -----------------------------------------------------------------------

	const LIMITS = { cooldown_minutes: 10, daily_limit: 3 };

	/** A student who may still go: the control is live and the count is shown. */
	const FREE: HallPassStudentState = {
		scope: 'student',
		section_id: SECTION_ID,
		taken: false,
		mine: false,
		opened_at: null,
		limits: LIMITS,
		used_today: 1,
		retry_at: null
	};

	/**
	 * A STUDENT REFUSED BY THE COOLDOWN, which is the state this harness exists
	 * for. `retry_at` is eight minutes ahead of the pinned NOW, so the control
	 * is `aria-disabled` and the card names a clock time -- the two things that
	 * would look identical to a working control if either broke.
	 */
	const COOLED: HallPassStudentState = {
		...FREE,
		used_today: 2,
		retry_at: new Date(NOW + 8 * 60_000).toISOString()
	};

	/** A student who has spent the day's passes. Same control, different sentence. */
	const SPENT: HallPassStudentState = { ...FREE, used_today: 3, retry_at: null };

	function passTransports(label: string): HallPassTransports {
		return {
			async load() {
				return null;
			},
			async open(): Promise<HallPassResult<HallPassOpened>> {
				// The DATABASE is the limit; this stands in for its refusal so the
				// card's notice can be driven without one.
				note(`${label}: open refused (cooldown)`);
				return {
					ok: false,
					refusal: 'cooldown',
					retryAt: new Date(NOW + 8 * 60_000).toISOString()
				};
			},
			async closeMine() {
				note(`${label}: closeMine`);
				return { ok: false, message: 'Harness: not wired.' };
			},
			async closeById(passId) {
				note(`${label}: closeById ${passId}`);
				return { ok: false, message: 'Harness: not wired.' };
			}
		};
	}

	const MOUNTS: { key: string; title: string; blurb: string; state: HallPassState }[] = [
		{
			key: 'free',
			title: 'Student, one pass used',
			blurb: 'The control is live and the count is on screen before anybody taps.',
			state: FREE
		},
		{
			key: 'cooldown',
			title: 'Student, refused by the cooldown',
			blurb:
				'aria-disabled rather than disabled, so the tap still lands and the card names the clock time.',
			state: COOLED
		},
		{
			key: 'spent',
			title: "Student, the day's passes spent",
			blurb: 'The refusal names the cap and points at the person who can override it.',
			state: SPENT
		}
	];
</script>

<div class="harness cr-root" style="--cr-measure-route: var(--measure-split)">
	<h1>Instructor tools</h1>
	<p class="lede">
		Dev harness for prompt 0016. The real <code>PeoplePanel</code> and the real
		<code>HallPass</code>, against in-memory transports.
		{#if BIG}
			<strong>{ROSTER.length} roster rows</strong> -- the oversized fixture, big enough to push
			the class mail draft past the <code>mailto:</code> ceiling and force the split.
		{:else}
			41 roster rows, one of them the teacher's own enrollment and one an inactive student. A
			class this size fits in ONE mail draft; append <code>?class=big</code> for the fixture that
			forces the split.
		{/if}
	</p>

	{#each MOUNTS as mount (mount.key)}
		<section class="mount" data-testid={`pass-${mount.key}`}>
			<h2>{mount.title}</h2>
			<p class="lede">{mount.blurb}</p>
			<HallPass
				sectionId={SECTION_ID}
				state={mount.state}
				transports={passTransports(mount.key)}
				now={NOW}
			/>
		</section>
	{/each}

	<section class="mount" data-testid="people">
		<h2>People tab, with the Class tools card</h2>
		<p class="lede">
			Export the roster, email the class, and the picker. Every write transport refuses here:
			this harness is for the four read-only tools.
		</p>
		<PeoplePanel
			section={SECTION}
			roster={ROSTER}
			transports={peopleTransports}
			teams={teamTransports}
		/>
	</section>

	{#if log.length}
		<section class="mount">
			<h2>Transport log</h2>
			<ul class="log">
				{#each log as line, i (i)}
					<li>{line}</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.harness {
		max-width: 76rem;
		margin: 0 auto;
		padding: 1.5rem var(--cr-gutter, 1.2rem) 4rem;
	}
	h1 {
		margin: 0 0 0.4rem;
		color: var(--text-1);
	}
	h2 {
		margin: 0 0 0.3rem;
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.lede {
		margin: 0 0 0.8rem;
		max-width: var(--measure-reading, 60ch);
		color: var(--text-2);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.mount {
		margin-top: 1.6rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--boundary);
	}
	.log {
		margin: 0;
		padding-left: 1.2rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.6;
	}
</style>
