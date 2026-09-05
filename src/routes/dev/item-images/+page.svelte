<script lang="ts">
	import ItemBody from '$lib/classroom/ItemBody.svelte';
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
	import { buildFeed, feedCover, type FeedSubmission } from '$lib/classroom/feed';
	import type {
		ClassroomAttachment,
		ClassroomItem,
		ClassroomSection
	} from '$lib/classroom/classroom';
	import type { ItemDoc, TiptapNode } from '$lib/classroom/classroom-doc';
	import { imageChoices } from '$lib/classroom/attachments';
	import { registerLocalAttachmentUrl } from '$lib/classroom/classroom';
	import { LANDSCAPE, SQUARE } from '../classroom-images/fixtures';

	/**
	 * Dev harness for 0176: a picture in an item body, and the feed card that
	 * shows it. 404 in production, no auth, no Supabase.
	 *
	 * IT MOUNTS THE REAL COMPONENTS -- `ItemBody`, `ClassroomFeed` and
	 * `RichTextEditor` -- rather than a copy of their markup, so what is measured
	 * here is what a class sees. The one thing it stands in for is the ATTACHMENT
	 * PROXY: `/api/classroom/attachment/<id>` needs a session and a row, so the
	 * resolvable fixtures below name STATIC paths under `/IDEA/`, which
	 * `resolveFigureSrc` allows through the identical branch it allows a static
	 * figure through in a spec. The alias cases are here too and resolve to the
	 * proxy path exactly as they do in production; they simply cannot LOAD here,
	 * which is why one of them is deliberately the unresolved-marker case.
	 *
	 * WHAT IT IS FOR, at 375px and 1440px:
	 *   - a body figure fits its column and does not widen the page;
	 *   - a refused or unresolvable reference shows a marker and its caption,
	 *     never a broken image and never silence;
	 *   - a feed card with a cover and a feed card with a glyph are the SAME
	 *     height, so a class that starts attaching photographs does not turn the
	 *     home page into a ragged list;
	 *   - the editor's Image control refuses to insert without a description.
	 */

	const NOW = new Date('2026-10-15T12:00:00Z');

	const ATTACHMENTS: ClassroomAttachment[] = [
		{ id: 'att-1', filename: 'teardown-03.jpg', mime_type: 'image/jpeg', sort_order: 0 },
		{ id: 'att-2', filename: 'diagram.svg', mime_type: 'image/svg+xml', sort_order: 1 }
	];

	const RESOLVABLE = '/IDEA/idea-gear.png';

	/* ------------------------------------------------------------------ 0041.
	   THE PICKER'S OWN FIXTURES.

	   `registerLocalAttachmentUrl` is `attachmentSrc`'s own dev-harness seam, so
	   the picker runs its REAL src builder and only the bytes are local -- the
	   same thing /dev/classroom-images does, and the reason the thumbnails here
	   are measurable at all (the proxy needs a session this route has not got).
	   Registered at module evaluation so the first server-rendered markup
	   already carries the data URI: a src registered later 404s through the
	   proxy path, fires `onerror`, and drops the thumbnail being measured. */
	registerLocalAttachmentUrl('pick-1', LANDSCAPE.src);
	registerLocalAttachmentUrl('pick-2', SQUARE.src);

	/* SIX CANDIDATES, of which exactly THREE may be offered. The three refusals
	   are each a different rule, and all three are silent failures if they get
	   through -- a picture chosen off a list that then does not draw is the
	   defect 0041 exists to remove, wearing a picker's clothes. */
	const PICKER_ATTACHMENTS: ClassroomAttachment[] = [
		/* offered: a picture, resolvable, unique. */
		{ id: 'pick-1', filename: 'bearing-race.png', mime_type: 'image/png', sort_order: 0 },
		{ id: 'pick-2', filename: 'truss-detail.png', mime_type: 'image/png', sort_order: 1 },
		/* REFUSED: an SVG is a document, not a picture, and `resolveFigureSrc`
		   refuses it by name AND by stored mime. */
		{ id: 'pick-3', filename: 'schematic.svg', mime_type: 'image/svg+xml', sort_order: 2 },
		/* REFUSED: `resolveFigureSrc` resolves this happily -- it decides ACCESS,
		   not whether bytes decode -- so the name check is what stops an `img`
		   being pointed at a PDF. */
		{ id: 'pick-4', filename: 'safety-sheet.pdf', mime_type: 'application/pdf', sort_order: 3 },
		/* REFUSED: the alias matches case-insensitively and FIRST MATCH WINS, so
		   a second row claiming a name already taken is a row that cannot be told
		   apart from the first by the document it produces. */
		{ id: 'pick-5', filename: 'BEARING-RACE.png', mime_type: 'image/png', sort_order: 4 }
	];

	/* Staged, not uploaded: on a CREATE this is the only kind there is. The
	   second one carries spaces, which the record route sanitizes out, so the
	   row shows what the item will actually call it. */
	const PICKER_STAGED = [{ name: 'jig-setup.jpg' }, { name: 'first cut.JPG' }];

	const pickerChoices = imageChoices({
		attached: PICKER_ATTACHMENTS,
		staged: PICKER_STAGED
	});
	const pickerRefused = PICKER_ATTACHMENTS.filter(
		(a) => !pickerChoices.some((c) => c.filename.toLowerCase() === a.filename.toLowerCase())
	);

	let pickerDoc = $state<TiptapNode | null>(null);
	let emptyDoc = $state<TiptapNode | null>(null);

	const withPicture: ItemDoc = [
		{
			type: 'p',
			runs: [
				{ text: 'Measure the race ' },
				{ text: 'before', bold: true },
				{ text: ' you press it out. Record both readings in your notebook.' }
			]
		},
		{ type: 'img', src: RESOLVABLE, alt: 'The bearing, exploded, with the race beside it' },
		{ type: 'h3', runs: [{ text: 'What to bring' }] },
		{
			type: 'ul',
			items: [
				[{ text: 'Digital calipers' }],
				[{ text: 'A bearing puller' }, { type: 'ul', items: [[{ text: 'two-jaw, not three' }]] }]
			]
		}
	];

	const unresolvable: ItemDoc = [
		{ type: 'p', runs: [{ text: 'This body names a file nobody attached.' }] },
		{ type: 'img', src: 'attachment:not-here.jpg', alt: 'A drawing that was never uploaded' }
	];

	const refused: ItemDoc = [
		{ type: 'p', runs: [{ text: 'Three references no img may ever be given.' }] },
		{ type: 'img', src: 'https://evil.example/beacon.png', alt: 'An off-site beacon' },
		{ type: 'img', src: 'attachment:diagram.svg', alt: 'An SVG, which is a document' },
		{ type: 'img', src: '/IDEA/../../etc/passwd', alt: 'A path climbing out of the prefix' }
	];

	const noPicture: ItemDoc = [
		{ type: 'p', runs: [{ text: 'An ordinary body, with nothing to show.' }] }
	];

	function makeItem(id: string, title: string, doc: ItemDoc, kind = 'assignment'): ClassroomItem {
		return {
			id,
			kind,
			title,
			body: 'plain text fallback',
			body_doc: doc,
			points: 10,
			due_at: '2026-10-17T12:00:00Z',
			category: null,
			author_email: 'tvargas@boscotech.edu',
			author_name: 'T. Vargas',
			published: true,
			pinned: true,
			sort_order: 0,
			first_published_at: '2026-10-01T12:00:00Z',
			edited_at: null,
			created_at: '2026-10-01T12:00:00Z',
			updated_at: '2026-10-01T12:00:00Z',
			links: [],
			attachments: ATTACHMENTS,
			postings: [{ id: `p-${id}`, section_id: 'sec-p1' }],
			viewed_at: null
		} as unknown as ClassroomItem;
	}

	const bodyCases: { key: string; label: string; item: ClassroomItem }[] = [
		{
			key: 'resolved',
			label: 'A picture that resolves',
			item: makeItem('i-resolved', 'Bearing teardown', withPicture)
		},
		{
			key: 'unresolved',
			label: 'A reference nothing could resolve',
			item: makeItem('i-unresolved', 'Truss drawing', unresolvable)
		},
		{
			key: 'refused',
			label: 'Three refused references',
			item: makeItem('i-refused', 'Hostile references', refused)
		}
	];

	const section: ClassroomSection = {
		id: 'sec-p1',
		course_id: 'c1',
		label: 'Period 1',
		block: 'Block A',
		teacher_email: 'tvargas@boscotech.edu',
		active: true,
		course: { id: 'c1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	} as unknown as ClassroomSection;

	const feedItems = [
		makeItem('f-cover', 'Bearing teardown', withPicture),
		makeItem('f-glyph', 'Read the safety sheet', noPicture, 'material'),
		makeItem('f-unresolved', 'Truss drawing', unresolvable, 'post')
	];

	const feeds = buildFeed({
		sections: [section],
		items: feedItems,
		submissions: [] as FeedSubmission[],
		myEmail: 'alice@boscotech.net',
		now: NOW
	});

	/** What each card resolved to, printed so a reader can check the picture
	 *  against the rule rather than against the screenshot. */
	const covers = feedItems.map((i) => ({ id: i.id, cover: feedCover(i) }));

	let editorDoc = $state<TiptapNode | null>(null);
</script>

<svelte:head><title>dev / item images</title></svelte:head>

<div class="harness">
	<h1>Pictures in an item body (0176)</h1>
	<p class="note">
		Dev harness. The resolvable fixtures name a static path under <code>/IDEA/</code>, because the
		attachment proxy needs a session this route does not have; an <code>attachment:</code> alias
		takes the identical branch and is shown here as the unresolved case.
	</p>

	<h2>ItemBody</h2>
	{#each bodyCases as c (c.key)}
		<section class="case" data-item-case={c.key}>
			<h3>{c.label}</h3>
			<div class="card">
				<ItemBody item={c.item} />
			</div>
		</section>
	{/each}

	<h2>ItemBody, compact (the class stream's scale)</h2>
	<section class="case" data-item-case="compact">
		<div class="card">
			<ItemBody item={bodyCases[0].item} compact />
		</div>
	</section>

	<h2>The feed card</h2>
	<p class="note">
		One card with a cover, one with a glyph, one whose reference cannot resolve and therefore keeps
		its glyph. All three rows must be the same height.
	</p>
	<div class="legacy-index feed-holder">
		<ClassroomFeed {feeds} now={NOW} />
	</div>
	<ul class="cover-report">
		{#each covers as c (c.id)}
			<li><code>{c.id}</code>: {c.cover ? c.cover.src : 'no cover, glyph'}</li>
		{/each}
	</ul>

	<h2>The editor's Image control: the picker (0041)</h2>
	<p class="note">
		Press <strong>Image</strong>. The control offers this item's own pictures instead of asking for
		a filename; Add stays refused until a picture is chosen AND a description is typed.
	</p>
	<section class="case" data-editor-case="picker">
		<div class="card">
			<RichTextEditor
				value={noPicture}
				label="Body with a picker"
				images={pickerChoices}
				imagesEmptyHint="No pictures on this item yet. Add one under Files below, then press Image again."
				onchange={(d) => (pickerDoc = d)}
				onready={(d) => (pickerDoc = d)}
			/>
		</div>
		<ul class="cover-report" data-picker-report>
			{#each pickerChoices as c (c.ref)}
				<li>offered: <code>{c.ref}</code> ({c.state})</li>
			{/each}
			{#each pickerRefused as a (a.id)}
				<li>refused: <code>{a.filename}</code></li>
			{/each}
		</ul>
		<pre class="dump" data-picker-dump>{JSON.stringify(pickerDoc, null, 2)}</pre>
	</section>

	<h2>The picker with nothing to offer</h2>
	<p class="note">
		An item with no pictures on it yet. The popover must say so and say how to leave the state,
		never show an empty list with no explanation.
	</p>
	<section class="case" data-editor-case="empty">
		<div class="card">
			<RichTextEditor
				value={noPicture}
				label="Body with no pictures"
				images={[]}
				imagesEmptyHint="No pictures on this item yet. Add one under Files below, then press Image again."
				onchange={(d) => (emptyDoc = d)}
				onready={(d) => (emptyDoc = d)}
			/>
		</div>
	</section>

	<h2>The editor's Image control: no picker (the unchanged callers)</h2>
	<p class="note">
		A caller that cannot say which pictures exist -- a spec's prose field, a check-in's guidance --
		passes no list, and the control stays the free-text field it has always been. Add stays refused
		until both a file and a description are typed.
	</p>
	<section class="case" data-editor-case="text">
		<div class="card">
			<RichTextEditor
				value={noPicture}
				label="Body"
				onchange={(d) => (editorDoc = d)}
				onready={(d) => (editorDoc = d)}
			/>
		</div>
		<pre class="dump" data-editor-dump>{JSON.stringify(editorDoc, null, 2)}</pre>
	</section>
</div>

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 4rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}
	h1 {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 2rem;
		color: var(--text-2);
	}
	h3 {
		font-size: 0.9rem;
		margin: 0 0 0.4rem;
		color: var(--text-2);
	}
	.note {
		font-size: 0.86rem;
		color: var(--text-2);
		line-height: 1.5;
	}
	.case {
		margin-bottom: 1.25rem;
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.9rem 1rem;
	}
	.feed-holder {
		max-width: 34rem;
	}
	.cover-report {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--text-2);
		padding-left: 1.2rem;
	}
	.dump {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.6rem;
		max-height: 16rem;
		overflow: auto;
	}
</style>
