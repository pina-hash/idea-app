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
	 */
	import Avatar from '$lib/Avatar.svelte';
	import { AVATAR_TINTS, avatarTint, rosterSubject } from '$lib/avatars';

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
	.tints,
	.sizes {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		padding: 0.5rem 0;
	}
</style>
