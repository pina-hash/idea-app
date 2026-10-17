/**
 * Fixture for /dev/post-thumbnails (ledger 0396, report a6a037f3).
 *
 * ONE CLASS, THREE UNITS, AND A POST FOR EVERY THING A SLOT CAN SHOW:
 *   - a hand-set picture, landscape, framed off-centre (its focal point is on
 *     the subject, so every shape keeps the subject in view);
 *   - a hand-set picture, portrait, and a wide panorama, so `cover` is seen
 *     cropping both ways;
 *   - the picture an HTML document's manifest names (not hand-set);
 *   - a live HTML thumbnail (CSS animation), a canvas one (requestAnimationFrame)
 *     and an INTERACTIVE one, each served by the real `/hx/<id>/thumbnail`
 *     route from the dev fixtures in `src/routes/hx/_documents.ts`;
 *   - the generated look chosen by hand, over a document's own;
 *   - a document whose manifest names a template it does not carry (the
 *     generated look at once, with no request for a live thumbnail);
 *   - a hand-set picture whose file was deleted (the generated look);
 *   - plain posts with nothing set, in each unit and in none, so every tint
 *     and the neutral are on the page;
 *   - a draft (its live thumbnail refused, as the route refuses an unpublished
 *     post's), and a notebook check-in row.
 *
 * `?count=30` replaces the class with thirty live thumbnails (CSS and canvas,
 * alternating) for the frame-timing measurement.
 *
 * The pictures are SVG data URIs drawn here, so the harness asks no network for
 * anything. That is a harness convenience only: a STORED thumbnail is never an
 * SVG (0268 refuses one, and the image route serves rasters alone). In an
 * `<img>` an SVG is inert by specification, which is the only way it is used.
 */
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { ItemThumbnail } from '$lib/classroom/thumbnail';
import { extractManifestScript } from '$lib/classroom/html-assignment/manifest';
import { manifestThumbnail, servedThumbnailTemplate } from '$lib/classroom/html-assignment/thumbnail';
import { hxDocument } from '../../hx/_documents';

export const CLOCK = { now: '2026-10-16T17:00:00.000Z', today: '2026-10-16' };
export const BASE = '/dev/post-thumbnails';
export const TEACHER = 'pina@boscotech.edu';

export const SECTION: ClassroomSection = {
	id: 's-thumbs',
	course_id: 'c-idea',
	label: 'Period 4',
	block: 'D',
	teacher_email: TEACHER,
	active: true,
	course: { id: 'c-idea', code: 'IDEA100', title: 'Introduction to Engineering Design', active: true }
};

export const UNITS: ClassroomUnit[] = [
	{ id: 'u-measure', course_id: 'c-idea', name: 'Measurement', sort_order: 1 },
	{ id: 'u-gears', course_id: 'c-idea', name: 'Gears', sort_order: 2 },
	{ id: 'u-build', course_id: 'c-idea', name: 'Build', sort_order: 3 }
];

const svg = (w: number, h: number, body: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
	)}`;

/** A bench with a red gear on it, off-centre at (0.72, 0.6): the focal point's subject. */
const BENCH = svg(
	800,
	600,
	'<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6d8c"/><stop offset="1" stop-color="#a9c2d6"/></linearGradient></defs>' +
		'<rect width="800" height="600" fill="url(#s)"/><rect y="400" width="800" height="200" fill="#6b4a2f"/><rect y="392" width="800" height="16" fill="#8a6440"/>' +
		'<rect x="60" y="250" width="120" height="150" fill="#39424d"/><rect x="200" y="300" width="90" height="100" fill="#55606b"/>' +
		'<circle cx="576" cy="360" r="70" fill="none" stroke="#c8332b" stroke-width="30" stroke-dasharray="22 14"/><circle cx="576" cy="360" r="22" fill="#c8332b"/>' +
		'<text x="24" y="580" font-family="sans-serif" font-size="28" fill="#f3e6d2">bench</text>'
);

/** A tall picture: a robot arm, the claw near the top (focal 0.5, 0.25). */
const ARM = svg(
	600,
	900,
	'<rect width="600" height="900" fill="#20262e"/><rect x="0" y="780" width="600" height="120" fill="#38424d"/>' +
		'<rect x="250" y="560" width="100" height="230" fill="#f0b429"/><rect x="290" y="300" width="40" height="280" fill="#f0b429" transform="rotate(-12 310 560)"/>' +
		'<circle cx="300" cy="225" r="60" fill="#e5e9ee"/><path d="M260 180 L230 120 M340 180 L370 120" stroke="#e5e9ee" stroke-width="22" stroke-linecap="round"/>'
);

/** A panorama, 21:9: a line of three machines. */
const SHOP = svg(
	1260,
	540,
	'<rect width="1260" height="540" fill="#2c3e33"/><rect y="400" width="1260" height="140" fill="#1b2620"/>' +
		'<rect x="80" y="180" width="260" height="220" rx="12" fill="#3f8f5b"/><rect x="500" y="140" width="260" height="260" rx="12" fill="#5aa9c7"/><rect x="920" y="200" width="260" height="200" rx="12" fill="#d98b3a"/>' +
		'<circle cx="630" cy="270" r="50" fill="#e8f3f8"/>'
);

/** The picture a document's manifest names: a square badge. */
const BADGE = svg(
	512,
	512,
	'<rect width="512" height="512" fill="#5b3fa8"/><circle cx="256" cy="256" r="170" fill="none" stroke="#f1e6ff" stroke-width="36" stroke-dasharray="40 26"/>' +
		'<text x="256" y="292" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="104" fill="#f1e6ff">CAD</text>'
);

/** A harness picture for every hand-set or manifest picture, by item id. */
export const PICTURES: Record<string, string> = {
	'as-bench': BENCH,
	'mat-arm': ARM,
	'post-shop': SHOP,
	'as-badge': BADGE
};

/** The four pictures, by name, for the editor view's own files. */
export const PICTURE_FILES: Record<string, { url: string; width: number; height: number }> = {
	'bench.png': { url: BENCH, width: 800, height: 600 },
	'arm.png': { url: ARM, width: 600, height: 900 },
	'shop.png': { url: SHOP, width: 1260, height: 540 },
	'badge.png': { url: BADGE, width: 512, height: 512 }
};

const thumb = (over: Partial<ItemThumbnail>): ItemThumbnail => ({
	source: 'image',
	manual: true,
	image_key: null,
	attachment_id: null,
	image_width: null,
	image_height: null,
	focal_x: 0.5,
	focal_y: 0.5,
	html_document_id: null,
	interactive: false,
	updated_at: '2026-10-16T09:00:00.000Z',
	...over
});

/**
 * WHAT 0268'S SYNC RECORDS FOR ONE OF THE DEV DOCUMENTS, read off the
 * document's own bytes: the manifest's live thumbnail when the document
 * carries the template it names, else no row (the generated look). The
 * harness's stand-in for `_classroom_thumbnail_sync`, through the serving
 * route's own test (`servedThumbnailTemplate`), which the database's
 * `_classroom_html_may_carry_template` never refuses where this serves.
 */
export function automaticThumbnail(docId: string): ItemThumbnail | null {
	const html = hxDocument(docId, true)?.html ?? '';
	const found = extractManifestScript(html);
	if (found.count !== 1 || found.json === null) return null;
	const declared = manifestThumbnail(JSON.parse(found.json));
	if (declared?.source !== 'html' || servedThumbnailTemplate(html, declared.template) === null) return null;
	return thumb({ source: 'html', manual: false, html_document_id: docId, interactive: declared.interactive });
}

function item(id: string, title: string, over: Partial<ClassroomItem> = {}): ClassroomItem {
	return {
		id,
		kind: 'material',
		title,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: TEACHER,
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-10-10T15:00:00.000Z',
		edited_at: null,
		created_at: '2026-10-10T15:00:00.000Z',
		updated_at: '2026-10-10T15:00:00.000Z',
		links: [],
		attachments: [],
		postings: [{ section_id: SECTION.id }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	} as ClassroomItem;
}

export const ITEMS: ClassroomItem[] = [
	// Measurement
	item('as-bench', 'Lab 2: measure the bench parts', {
		kind: 'assignment',
		points: 20,
		due_at: '2026-10-21T06:59:00.000Z',
		unit_id: 'u-measure',
		sort_order: 1,
		thumbnail: thumb({ image_key: 's/bench.png', image_width: 800, image_height: 600, focal_x: 0.72, focal_y: 0.6 })
	}),
	item('mat-arm', 'Reading: how a robot arm reaches', {
		unit_id: 'u-measure',
		sort_order: 2,
		thumbnail: thumb({ attachment_id: 'att-arm', image_width: 600, image_height: 900, focal_x: 0.5, focal_y: 0.25 })
	}),
	item('mat-calipers', 'Day 3: calipers', { unit_id: 'u-measure', sort_order: 3 }),
	// Gears
	item('as-gears', 'Gear ratios (live thumbnail)', {
		kind: 'assignment',
		points: 10,
		due_at: '2026-10-23T06:59:00.000Z',
		unit_id: 'u-gears',
		sort_order: 1,
		thumbnail: automaticThumbnail('thumb-gear')
	}),
	item('as-spokes', 'Spokes (canvas thumbnail)', {
		kind: 'assignment',
		points: 10,
		due_at: '2026-10-24T06:59:00.000Z',
		unit_id: 'u-gears',
		sort_order: 2,
		thumbnail: automaticThumbnail('thumb-canvas')
	}),
	item('as-teeth', 'Tooth counter (interactive thumbnail)', {
		kind: 'assignment',
		points: 5,
		due_at: '2026-10-25T06:59:00.000Z',
		unit_id: 'u-gears',
		sort_order: 3,
		thumbnail: automaticThumbnail('thumb-interactive')
	}),
	item('as-badge', 'CAD badge (the document names its picture)', {
		kind: 'assignment',
		points: 5,
		unit_id: 'u-gears',
		sort_order: 4,
		thumbnail: thumb({ manual: false, image_width: 512, image_height: 512 })
	}),
	item('as-plain-gen', 'Gear train worksheet (generated, chosen by hand)', {
		kind: 'assignment',
		points: 10,
		unit_id: 'u-gears',
		sort_order: 5,
		thumbnail: thumb({ source: 'none' })
	}),
	// A manifest naming `cam-thumbnail` over a document carrying only
	// `idea-thumbnail`: no row, so the generated look, and no request.
	item('as-cams', 'Cam profiles (its manifest names a template it lacks)', {
		kind: 'assignment',
		points: 10,
		unit_id: 'u-gears',
		sort_order: 6,
		thumbnail: automaticThumbnail('thumb-notemplate')
	}),
	// Build
	item('post-shop', 'Shop tour photos', {
		kind: 'post',
		unit_id: 'u-build',
		sort_order: 1,
		thumbnail: thumb({ image_key: 's/shop.png', image_width: 1260, image_height: 540, focal_x: 0.5, focal_y: 0.5 })
	}),
	item('mat-gone', 'Old drawing (its picture was deleted)', {
		unit_id: 'u-build',
		sort_order: 2,
		thumbnail: thumb({ image_key: null, attachment_id: null })
	}),
	item('mat-build', 'Build day checklist', { unit_id: 'u-build', sort_order: 3 }),
	// No unit
	item('post-safety', 'Shop safety rules', { kind: 'post' }),
	// A draft's live thumbnail is refused by the route until the post is
	// published (the worksheet route's own rule); a document id the dev route
	// does not know answers the same bodyless 404, so the draft shows the
	// generated look here exactly as it does on the real page.
	item('draft-next', 'Next week: bearings (draft)', {
		kind: 'assignment',
		points: 10,
		published: false,
		unit_id: 'u-build',
		sort_order: 4,
		thumbnail: thumb({ source: 'html', manual: false, html_document_id: 'thumb-unpublished' })
	})
];

export const CHECK_INS: ClassCheckIn[] = [
	{
		session_id: 'ns-12',
		section_id: SECTION.id,
		unit_number: 2,
		session_date: '2026-10-15',
		session_label: 'Day 12 gear sketches',
		status: 'missing',
		flag_reason: null,
		item_id: null
	}
];

/**
 * Thirty live thumbnails, CSS and canvas alternating, for the frame-timing
 * pass. `quiet`: the fixtures that send no `harness:` reports, so a timing run
 * does not measure its own instrumentation.
 */
export function liveItems(n: number, live = true, quiet = false): ClassroomItem[] {
	const doc = (i: number) => (i % 2 ? 'thumb-canvas' : 'thumb-gear') + (quiet ? '-quiet' : '');
	return Array.from({ length: n }, (_, i) =>
		item(`live-${i + 1}`, live ? `Live thumbnail ${i + 1} (${i % 2 ? 'canvas' : 'CSS'})` : `Post ${i + 1}`, {
			kind: 'assignment',
			points: 5,
			sort_order: i + 1,
			unit_id: UNITS[i % UNITS.length].id,
			// `live = false` is the same class with nothing set (the generated
			// look on every row): the frame-timing baseline with no frames.
			thumbnail: live ? thumb({ source: 'html', manual: false, html_document_id: doc(i) }) : null
		})
	);
}

/** The harness picture for an item whose thumbnail is a picture, else null (the generated look). */
export function pictureFor(item: { id: string }): string | null {
	return PICTURES[item.id] ?? null;
}
