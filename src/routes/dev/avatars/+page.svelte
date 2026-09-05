<script lang="ts">
	/**
	 * /dev/avatars -- the four cases `Avatar.svelte` has to survive, mounted
	 * against the REAL component with no auth, no network and no Supabase.
	 *
	 * IT CARRIES NO REAL PERSON, and that is the point rather than an
	 * omission. Every other surface this bundle touches is staff-gated
	 * precisely because it shows a student's face; a harness reachable by
	 * anyone must therefore be fabricated end to end. The "uploaded" avatar
	 * below is a data: URI and the "broken" one is a path that resolves to
	 * nothing, so this page makes no request of any kind.
	 *
	 * WHAT IT EXISTS TO MEASURE: that a row does not MOVE between the four
	 * cases. A missing picture, a broken picture and a picture that loads must
	 * produce the same row height, or a roster of thirty ripples every time an
	 * image 404s. The row heights are read off this page by
	 * `tools/browser-verify/routes/avatars.mjs` at 375 and 1440.
	 *
	 * PROMPT 0038 ADDED THE REAL SURFACES BELOW THE COMPONENT CASES, and the
	 * reason is that the component measuring correctly says nothing about what
	 * the grid does with it. `SectionGrid` carries a LOCKED DENSITY CONTRACT --
	 * a 1.9rem cell box and 0.35/0.4rem padding -- and the only claim that
	 * settles whether a face fits inside it is the rendered row height of the
	 * real component, at both widths, with avatars and without. So the REAL
	 * `SectionGrid` and the REAL `EntryReview` are mounted here against
	 * fabricated payloads in exactly the shape `notebook_get_section_grid`
	 * returns.
	 *
	 * THREE PAYLOADS, AND THE THIRD IS THE ONE THAT MATTERS. `with` gives every
	 * student a picture, `without` is the PRE-0180 shape (the two keys simply
	 * absent from the RPC's jsonb, which is a real deployment state because the
	 * migration is applied by hand), and `mixed` is what a real class looks
	 * like: some faces, some tiles, one image that 404s and one name far too
	 * long for its row. A grid whose rows change height between those is a grid
	 * that ripples every time somebody uploads a picture.
	 */
	import Avatar from '$lib/Avatar.svelte';
	import { AVATAR_TINTS, avatarTint, rosterSubject } from '$lib/avatars';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import SectionGrid from '$lib/notebook/SectionGrid.svelte';
	import EntryReview from '$lib/notebook/EntryReview.svelte';
	import type { GridCell, ReviewEntry, SectionGrid as SectionGridData } from '$lib/notebook-review';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';

	/** An 8x5 PNG, inline: a real decodable image with no network behind it. */
	const PNG =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAYAAAB4ka1VAAAAHElEQVQI12P4z8DwHwwZgAQGGxQCEhAABgYGAAxRBB7dQyzoAAAAAElFTkSuQmCC';

	type Row = {
		student_email: string;
		display_name: string | null;
		avatar: string | null;
		avatar_url: string | null;
	};

	/** The four cases, in the order the spec reads them. */
	const ROWS: { key: string; label: string; row: Row }[] = [
		{
			key: 'loads',
			label: 'an avatar that loads',
			row: {
				student_email: 'alice@boscotech.net',
				display_name: 'Alice Alvarez',
				avatar: null,
				avatar_url: PNG
			}
		},
		{
			key: 'none',
			label: 'no avatar at all (the common case)',
			row: {
				student_email: 'bruno@boscotech.net',
				display_name: 'Bruno Barros',
				avatar: null,
				avatar_url: null
			}
		},
		{
			key: 'broken',
			label: 'an avatar that fails to load',
			row: {
				student_email: 'carla@boscotech.net',
				display_name: 'Carla Cruz',
				avatar: null,
				avatar_url: '/dev/avatars/this-object-does-not-exist.png'
			}
		},
		{
			key: 'longname',
			label: 'a name far too long for its row',
			row: {
				student_email: 'dana.dolorosa.villanueva-echeverria@boscotech.net',
				display_name: 'Dana Dolorosa Villanueva-Echeverria de la Concepcion',
				avatar: null,
				avatar_url: null
			}
		},
		{
			key: 'noaccount',
			label: 'on the roster, never signed in (0179 answers null)',
			row: {
				student_email: 'evan@boscotech.net',
				display_name: 'Evan Ostrowski',
				avatar: null,
				avatar_url: null
			}
		},
		{
			key: 'preset',
			label: 'a chosen preset mark',
			row: {
				student_email: 'fern@boscotech.net',
				display_name: 'Fern Okafor',
				avatar: 'preset:hex',
				avatar_url: null
			}
		}
	];

	/**
	 * THE PARITY GROUP, and it is separate from the illustrative rows above
	 * for a measured reason. The first draft compared those six directly and
	 * the probe reported `loads=40 none=68 broken=68 noaccount=68 preset=40`
	 * at 375 -- a real height difference that had NOTHING to do with the
	 * avatar: each row carried a different case label and a different name, so
	 * at a narrow width they wrapped to different numbers of lines. A fixture
	 * that varies two things at once cannot answer about either. These five
	 * rows carry BYTE-IDENTICAL text and differ only in what the picture is
	 * doing, which is the only shape in which "the row did not move" is a
	 * claim about the avatar.
	 */
	const PARITY_TEXT = { display_name: 'Sam Sample', student_email: 'sam@boscotech.net' };
	const PARITY: { key: string; row: Row }[] = [
		{ key: 'p-loads', row: { ...PARITY_TEXT, avatar: null, avatar_url: PNG } },
		{ key: 'p-none', row: { ...PARITY_TEXT, avatar: null, avatar_url: null } },
		{ key: 'p-broken', row: { ...PARITY_TEXT, avatar: null, avatar_url: '/dev/avatars/gone.png' } },
		{ key: 'p-preset', row: { ...PARITY_TEXT, avatar: 'preset:cube', avatar_url: null } },
		{ key: 'p-upload-broken', row: { ...PARITY_TEXT, avatar: 'upload:nobody/none.png', avatar_url: null } }
	];

	/**
	 * ONE SAMPLE PER TINT, and the keys are SEARCHED rather than written down.
	 * Eight hand-picked addresses hashed into six buckets, and the probe said
	 * so (`distinct:6`) -- which is the correct answer to the question it was
	 * asked and the wrong question to have asked. What is worth measuring is
	 * that every colour in the set clears its ground and is distinguishable
	 * from the others; that needs a key per BUCKET, so the page finds one by
	 * walking candidates through the real `avatarTint` until each is covered.
	 * If a future change collapsed the hash, this loop would not find eight
	 * and the presence row above would report the shortfall.
	 */
	const TINT_KEYS: { key: string; row: Row }[] = (() => {
		const seen = new Map<string, string>();
		for (let i = 0; i < 500 && seen.size < AVATAR_TINTS.length; i++) {
			const key = `tint-sample-${i}@boscotech.net`;
			const tint = avatarTint(key);
			if (!seen.has(tint)) seen.set(tint, key);
		}
		return [...seen.values()].map((key, i) => ({
			key,
			row: {
				student_email: key,
				display_name: `T${i} Sample`,
				avatar: null,
				avatar_url: null
			} satisfies Row
		}));
	})();

	// -----------------------------------------------------------------------
	// THE REAL SURFACES (prompt 0038).
	// -----------------------------------------------------------------------

	/**
	 * The roster the three grid payloads share, so `with` / `without` / `mixed`
	 * differ ONLY in the two avatar columns and never in the text -- which is
	 * the same lesson the parity group above records: a fixture that varies two
	 * things at once cannot answer about either.
	 */
	const GRID_PEOPLE = [
		{ key: 'alice@boscotech.net', name: 'Alice Alvarez', avatar: 'preset:hex', url: null },
		{ key: 'bruno@boscotech.net', name: 'Bruno Barros', avatar: null, url: PNG },
		{ key: 'carla@boscotech.net', name: 'Carla Cruz', avatar: null, url: null },
		{
			// ON THE ROSTER, NEVER SIGNED IN: no uuid, so both of 0180's LEFT
			// joins found nothing and the row keeps its name and answers null.
			key: 'dana@boscotech.net',
			name: 'Dana Diaz',
			avatar: null,
			url: null
		},
		{
			key: 'evan@boscotech.net',
			name: 'Evan Ostrowski',
			avatar: null,
			// A STORED PATH THAT RESOLVES TO NOTHING, which is a live case: an
			// uploaded avatar is an unsigned public-bucket URL built from a
			// path, so a deleted object is an ordinary 404.
			url: '/dev/avatars/gone.png'
		},
		{
			key: 'fern.okonkwo-villanueva@boscotech.net',
			name: 'Fernanda Okonkwo-Villanueva de la Concepcion',
			avatar: 'preset:cube',
			url: null
		}
	] as const;

	const SESSIONS = [
		{ id: 'k1', unit_number: 3, session_date: '2026-09-01', session_label: 'Bearing teardown' },
		{ id: 'k2', unit_number: 3, session_date: '2026-09-02', session_label: 'Tolerance stack' },
		{ id: 'k3', unit_number: 3, session_date: '2026-09-03', session_label: 'Fit check' }
	];

	const CELL_STATUSES = ['compliant', 'flagged', 'excused', 'missing'] as const;

	type GridMode = 'with' | 'without' | 'mixed';

	function gridFor(mode: GridMode): SectionGridData {
		return {
			section: {
				id: 's1',
				course_code: 'IDEA209H',
				course_title: 'Engineering I Honors',
				label: 'Period 1',
				block: 'C',
				teacher_email: 'teacher@boscotech.edu',
				manages: true
			},
			unit_number: 3,
			generated_at: '2026-09-05T12:00:00Z',
			sessions: SESSIONS,
			students: GRID_PEOPLE.map((p, i) => ({
				student_key: p.key,
				id: p.key === 'dana@boscotech.net' ? null : `u-${i}`,
				name: p.name,
				email: p.key,
				enrolled: p.key !== 'dana@boscotech.net',
				free_entries: 0,
				free_entries_unreviewed: 0,
				// `without` is the PRE-0180 shape: the keys are ABSENT, not null.
				// `mixed` gives a picture to the first half only, which is what a
				// real class looks like.
				// `with` gives everyone a picture that WORKS -- the broken one is
				// mixed's job, and a `with` grid carrying a 404 would make its
				// image count a claim about the 404 rather than about the
				// columns. Measured: the first draft did exactly that and the
				// harness reported 3 images where 4 were expected.
				...(mode === 'without'
					? {}
					: mode === 'with'
						? { avatar: p.avatar ?? null, avatar_url: p.avatar ? null : PNG }
						: { avatar: p.avatar ?? null, avatar_url: p.url ?? null })
			})),
			cells: GRID_PEOPLE.flatMap((p, i) =>
				SESSIONS.map((se, j) => ({
					student_key: p.key,
					student_id: p.key === 'dana@boscotech.net' ? null : `u-${i}`,
					session_id: se.id,
					status: CELL_STATUSES[(i + j) % CELL_STATUSES.length],
					entry_id: (i + j) % 4 === 0 ? `e-${i}-${j}` : null,
					entry_count: (i + j) % 4 === 0 ? 1 : 0,
					upload_timestamp: (i + j) % 4 === 0 ? `${se.session_date}T15:00:00Z` : null,
					on_time: (i + j) % 4 === 0 ? true : null,
					excused: CELL_STATUSES[(i + j) % CELL_STATUSES.length] === 'excused',
					flag_reason: null,
					reviewed: (i + j) % 4 === 0 ? false : null,
					unreviewed_count: (i + j) % 4 === 0 ? 1 : 0
				}))
			)
		} as unknown as SectionGridData;
	}

	const GRIDS: { mode: GridMode; label: string }[] = [
		{ mode: 'with', label: 'every student has a picture' },
		{ mode: 'without', label: 'pre-0180: the columns are absent' },
		{ mode: 'mixed', label: 'mixed, one broken image, one very long name' }
	];

	/**
	 * `EntryReview`'s header, mounted REAL. Everything it needs beyond the
	 * student is inert: an entry with no photos and no notes, and handlers that
	 * resolve without touching anything. The panel is here for its EYEBROW ROW
	 * -- the picture beside the name -- and for nothing else.
	 */
	const ENTRY: ReviewEntry = {
		id: 'e-1',
		student_id: 'u-0',
		session_id: 'k1',
		custom_label: 'Bearing teardown notes',
		upload_timestamp: '2026-09-01T15:00:00Z',
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		folder_name: null,
		photos: [],
		notes: []
	};
	const ENTRY_CELL: GridCell = {
		student_key: 'alice@boscotech.net',
		student_id: 'u-0',
		session_id: 'k1',
		status: 'compliant',
		entry_id: 'e-1',
		entry_count: 1,
		upload_timestamp: '2026-09-01T15:00:00Z',
		on_time: true,
		excused: false,
		flag_reason: null,
		reviewed: false,
		unreviewed_count: 1
	};
	const noop = async () => ({ ok: true as const, value: undefined as never });

	/** The three states the panel header has to survive, in the same order. */
	const PANEL_CASES = [
		{
			key: 'panel-with',
			label: 'a picture',
			student: gridStudent('alice@boscotech.net', 'Alice Alvarez', 'preset:hex', null)
		},
		{
			key: 'panel-without',
			label: 'no picture',
			student: gridStudent('carla@boscotech.net', 'Carla Cruz', null, null)
		},
		{
			key: 'panel-broken',
			label: 'a broken picture',
			student: gridStudent('evan@boscotech.net', 'Evan Ostrowski', null, '/dev/avatars/gone.png')
		},
		{
			key: 'panel-long',
			label: 'a very long name',
			student: gridStudent(
				'fern.okonkwo-villanueva@boscotech.net',
				'Fernanda Okonkwo-Villanueva de la Concepcion',
				null,
				null
			)
		}
	];

	function gridStudent(key: string, name: string, avatar: string | null, url: string | null) {
		return {
			student_key: key,
			id: 'u-0',
			name,
			email: key,
			enrolled: true,
			free_entries: 0,
			avatar,
			avatar_url: url
		} as SectionGridData['students'][number];
	}

	// -----------------------------------------------------------------------
	// GradingConsole's ROSTER LIST, real component.
	//
	// The console's own dev route (`/dev/grading-bulk`) mounts it against a
	// fixture whose roster carries no avatar columns, which is the `without`
	// case and nothing else. This mount exists for the other two: the ROW
	// HEIGHT is decided by `min-height: 44px`, and the whole justification for
	// a 24px face rather than a 28px one is that it stays under that -- a claim
	// only a with/without/mixed comparison on the real component can settle.
	// -----------------------------------------------------------------------
	const GC_TEACHER = 'tvargas@boscotech.edu';
	const GC_SECTION: ClassroomSection = {
		id: 's-p1',
		course_id: 'c-1',
		label: 'Period 1',
		block: '1',
		teacher_email: GC_TEACHER,
		active: true,
		course: { id: 'c-1', code: 'IDEA100', title: 'Engineering I Honors', active: true }
	};
	const GC_ITEM: ClassroomItem = {
		id: 'i-1',
		kind: 'assignment',
		title: 'Bridge Sketch Worksheet',
		body: 'Sketch the truss bridge and say where it fails.',
		body_doc: null,
		points: 20,
		due_at: '2026-09-01T17:00:00Z',
		category: 'Unit Labs',
		author_email: GC_TEACHER,
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: '2026-08-20T17:00:00Z',
		edited_at: null,
		created_at: '2026-08-20T17:00:00Z',
		updated_at: '2026-08-20T17:00:00Z',
		links: [],
		attachments: [],
		postings: []
	} as unknown as ClassroomItem;

	/** The same six people, spelled the way a CLASSROOM roster row spells them. */
	function gcRoster(mode: GridMode) {
		return GRID_PEOPLE.map((p) => ({
			section_id: GC_SECTION.id,
			student_email: p.key,
			display_name: p.name,
			active: true,
			manages: false,
			...(mode === 'without'
				? {}
				: mode === 'with'
					? { avatar: p.avatar ?? null, avatar_url: p.avatar ? null : PNG }
					: { avatar: p.avatar ?? null, avatar_url: p.url ?? null })
		}));
	}

	function gcTransports(mode: GridMode): AssignmentTeacherTransports {
		return {
			async setSpec() {
				return { ok: true, data: undefined };
			},
			async setRubric() {
				return { ok: true, data: undefined };
			},
			async gradeSubmission() {
				return { ok: true, data: { ok: true, state: 'draft' } };
			},
			async approveModule() {
				return { ok: true, data: undefined };
			},
			async loadGrading() {
				return {
					ok: true,
					data: {
						roster: gcRoster(mode),
						submissions: [],
						responses: [],
						files: [],
						filesStorageReady: true,
						extraCreditReady: true,
						approvals: []
					}
				};
			}
		} as unknown as AssignmentTeacherTransports;
	}
</script>

<svelte:head><title>Avatars harness</title></svelte:head>

<main class="harness cr-root">
	<h1>Avatar cases</h1>
	<p class="note">
		The real <code>Avatar.svelte</code>, six roster-shaped rows, no network. Row heights must be
		identical across all of them.
	</p>

	<div class="roster" data-testid="avatar-roster">
		{#each ROWS as r (r.key)}
			<div class="roster-row" data-testid="avatar-row" data-case={r.key}>
				<Avatar subject={rosterSubject(r.row)} tintKey={r.row.student_email} size={28} />
				<span class="roster-name">{r.row.display_name}</span>
				<span class="roster-email">{r.row.student_email}</span>
				<span class="roster-case">{r.label}</span>
			</div>
		{/each}
	</div>

	<h2>Parity: identical text, only the picture differs</h2>
	<div class="roster" data-testid="avatar-parity">
		{#each PARITY as r (r.key)}
			<div class="roster-row" data-testid="avatar-parity-row" data-case={r.key}>
				<Avatar subject={rosterSubject(r.row)} tintKey={r.row.student_email} size={28} />
				<span class="roster-name">{r.row.display_name}</span>
				<span class="roster-email">{r.row.student_email}</span>
			</div>
		{/each}
	</div>

	<h2>Every tint on the real ground</h2>
	<div class="tints" data-testid="avatar-tints">
		{#each TINT_KEYS as t (t.key)}
			<span class="tint-cell" data-testid="avatar-tint">
				<Avatar subject={rosterSubject(t.row)} tintKey={t.row.student_email} size={40} />
			</span>
		{/each}
	</div>

	<h2>Sizes</h2>
	<div class="sizes" data-testid="avatar-sizes">
		{#each [24, 28, 30, 40, 44] as s (s)}
			<Avatar subject={rosterSubject(ROWS[1].row)} tintKey="bruno@boscotech.net" size={s} />
		{/each}
	</div>
</main>

<!--
	THE REAL SURFACES, in their own room. `SectionGrid` and `EntryReview` are
	notebook components and read `--nb-*` tokens off `.nb-root`; mounting them
	inside `.cr-root` above would measure them against a plate they never land
	on, which is precisely the mistake CLAUDE.md's "measure when a shared
	component enters a new room" rule exists to name.
-->
<div class="nb-root">
	<main class="harness surfaces">
		<h2>SectionGrid: the check-in grid, real component</h2>
		<p class="note">
			The row header gains a 24px face. The grid's 1.9rem cell box and 0.35/0.4rem padding are a
			locked density contract, so what is measured is that the ROW HEIGHT does not move between
			these three.
		</p>
		{#each GRIDS as g (g.mode)}
			<section class="surface" data-testid="grid-case" data-case={g.mode}>
				<h3>{g.label}</h3>
				<SectionGrid grid={gridFor(g.mode)} onOpen={() => {}} />
			</section>
		{/each}

		<h2>EntryReview: the panel header, real component</h2>
		<p class="note">
			The eyebrow row gains a 28px face beside the name it already printed. The four cases carry
			different text on purpose: this is one person read at a time, not a list, so what matters is
			that the header survives each of them rather than that they measure alike.
		</p>
		{#each PANEL_CASES as c (c.key)}
			<section class="surface" data-testid="panel-case" data-case={c.key}>
				<h3>{c.label}</h3>
				<EntryReview
					entry={ENTRY}
					cell={ENTRY_CELL}
					student={c.student}
					session={SESSIONS[0]}
					onFlag={noop}
					onResolve={noop}
					onClose={() => {}}
				/>
			</section>
		{/each}
	</main>
</div>

<!--
	GradingConsole is a CLASSROOM component and reads `.cr-root`'s tokens, so it
	gets its own room rather than being hung under `.nb-root` above.
-->
<div class="cr-root">
	<main class="harness surfaces">
		<h2>GradingConsole roster list, real component</h2>
		<p class="note">
			The row is `min-height: 44px` and the face is 24px, so the row height is still decided by the
			floor rather than by the picture. Measured with, without and mixed.
		</p>
		{#each GRIDS as g (g.mode)}
			<section class="surface" data-testid="gc-case" data-case={'gc-' + g.mode}>
				<h3>{g.label}</h3>
				{#key g.mode}
					<GradingConsole
						section={GC_SECTION}
						item={GC_ITEM}
						spec={null}
						rubric={null}
						transports={gcTransports(g.mode)}
					/>
				{/key}
			</section>
		{/each}
	</main>
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 60rem;
	}
	.note {
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.roster {
		display: flex;
		flex-direction: column;
	}
	/* The SAME shape PeoplePanel's roster row uses, so what is measured here
	   is what that panel does rather than a simplification of it. */
	.roster-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--boundary);
	}
	.roster-name {
		font-weight: 700;
		font-size: 0.9rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.roster-email {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.roster-case {
		margin-left: auto;
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.surfaces {
		max-width: none;
	}
	/* THE PLATE IS THE ROOM'S, NOT THE WRAPPER'S. Written as a bare
	   `.surfaces` rule this painted `--nb-bg` under the CLASSROOM console too,
	   where that token is undefined and resolved to paper white -- and the
	   contrast check answered 1.19:1 for a heading it had no business being
	   the ground of. Caught by the harness rather than by eye. */
	:global(.nb-root) .surfaces {
		background: var(--nb-bg);
	}
	:global(.cr-root) .surfaces {
		background: var(--bg0);
	}
	.surface {
		margin: 0 0 1.5rem;
	}
	.surface h3 {
		font-size: 0.8rem;
		margin: 0 0 0.4rem;
	}
	.tints,
	.sizes {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		padding: 0.5rem 0;
	}
</style>
