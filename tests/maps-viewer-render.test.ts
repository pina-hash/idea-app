// tests/maps-viewer-render.test.ts
//
// WHAT THE PUBLIC VIEWER ACTUALLY PUTS ON SCREEN, from `svelte/server`
// render() of the REAL MapsViewer over the REAL harness fixture -- rendered
// output, never source text.
//
// THE ONE CLAIM THIS FILE EXISTS FOR IS THAT THE SURFACE IS ANONYMOUS. Every
// other property here fails visibly the first time anybody opens the page; a
// sign-in control that crept onto a map a signed-out student is standing in
// front of would look completely ordinary to whoever added it, and would be
// found by the student who cannot get past it. So the sweep is both
// directions with counts, and the absence half carries a positive control on
// the same instrument.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MapsViewer from '../src/lib/maps/viewer/MapsViewer.svelte';
import {
	mapsViewerFixture,
	memoryMapsViewerTransports,
	VFIX
} from '../src/routes/dev/maps-viewer/fixture';

function view(query = '', extra: Record<string, unknown> = {}): string {
	const data = mapsViewerFixture();
	return render(MapsViewer, {
		props: {
			data,
			search: new URLSearchParams(query),
			transports: memoryMapsViewerTransports(data),
			...extra
		}
	}).body;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/**
 * The rendered TEXT, with markup and Svelte's hydration comments stripped and
 * whitespace collapsed. Sentences in a template wrap across source lines, so
 * asserting a sentence against raw markup is asserting the indentation of the
 * file it was typed in -- which passes today and reddens the next time
 * somebody reflows the component.
 */
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

describe('the viewer is anonymous, and stays that way', () => {
	it('offers no sign-in, no account and no write on any level', () => {
		const levels = [
			['directory', ''],
			['room', `at=${VFIX.machineShop}`],
			['unit', `at=${VFIX.toolChest}`],
			['compartment', `at=${VFIX.drawer1}`],
			['item card', `at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`],
			['staged route', `at=${VFIX.building}&to=item:${VFIX.shopCaliper}&q=caliper`]
		] as const;
		for (const [name, query] of levels) {
			const html = view(query);
			// A write surface: a POST form, a file input, or an editor control.
			expect(count(html, '<form method="post"'), name).toBe(0);
			expect(count(html, 'type="file"'), name).toBe(0);
			expect(count(html, '/maps/edit'), name).toBe(0);
			expect(count(html, '/auth/'), name).toBe(0);
			expect(html.toLowerCase(), name).not.toContain('sign in');
			// The ONE form on this surface is the search, and it is a GET.
			expect(count(html, 'method="get"'), name).toBe(1);
		}
	});

	it('positive control: the same sweep SEES forms, inputs and links on every level', () => {
		// Without this, "0 post forms, 0 file inputs, 0 editor links" passes for
		// a page that rendered nothing at all. Measured on the same six levels
		// the sweep above covers, so it cannot be true of a different render.
		const levels = [
			'',
			`at=${VFIX.machineShop}`,
			`at=${VFIX.toolChest}`,
			`at=${VFIX.drawer1}`,
			`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`,
			`at=${VFIX.building}&to=item:${VFIX.shopCaliper}&q=caliper`
		];
		for (const query of levels) {
			const html = view(query);
			expect(count(html, '<form'), query).toBe(1);
			expect(count(html, '<input'), query).toBe(1);
			expect(count(html, '<a '), query).toBeGreaterThan(0);
		}
		// And a level with real depth carries a real number of them: crumbs plus
		// rows plus the plan's own shapes.
		expect(count(view(`at=${VFIX.machineShop}`), '<a ')).toBeGreaterThan(3);
	});
});

describe('the descent', () => {
	it('names every level it is on', () => {
		expect(view()).toContain('IDEA Maps');
		expect(view(`at=${VFIX.machineShop}`)).toContain('Machine Shop');
		expect(view(`at=${VFIX.toolChest}`)).toContain('Tool Chest A');
		expect(view(`at=${VFIX.drawer1}`)).toContain('Drawer 1');
	});

	it('draws a plan for a room and an elevation for a unit, never both', () => {
		const room = view(`at=${VFIX.machineShop}`);
		expect(count(room, '<svg')).toBe(1);
		expect(count(room, 'data-testid="maps-viewer-stack"')).toBe(0);

		const unit = view(`at=${VFIX.toolChest}`);
		expect(count(unit, 'data-testid="maps-viewer-stack"')).toBe(1);
		expect(count(unit, '<svg')).toBe(0);
	});

	it('draws a compartment on its unit\'s front, marked "you are here"', () => {
		// THE MAP PANE IS NEVER EMPTY WHILE THERE IS SOMETHING TO DRAW. A drawer
		// has no drawing of its own, so the pane shows the chest's elevation
		// with that drawer picked out -- the way a map shows a selected place
		// on the drawing around it rather than blanking. Before this the
		// compartment level drew nothing (prompt 0112).
		const drawer = view(`at=${VFIX.drawer1}`);
		expect(count(drawer, 'data-testid="maps-viewer-stack"')).toBe(1);
		expect(count(drawer, 'data-here=""')).toBe(1);
		expect(text(drawer)).toContain('you are here');
		// And the card over the same drawer keeps the same drawing behind it.
		const card = view(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`);
		expect(count(card, 'data-testid="maps-viewer-stack"')).toBe(1);
		expect(count(card, 'data-here=""')).toBe(1);
		// POSITIVE CONTROL for the "here" mark: a level drawn as ITSELF marks
		// nothing as here, because there is no parent frame to mark it on.
		expect(count(view(`at=${VFIX.toolChest}`), 'data-here=""')).toBe(0);
		expect(count(view(`at=${VFIX.machineShop}`), 'data-here=""')).toBe(0);
	});

	it('draws the one building at the top of the map rather than an empty pane', () => {
		// The fixture's root carries an outline and no site position, so the
		// directory's own plan is empty; a map that opens on nothing is the
		// wrong first impression, so the single root is drawn as itself.
		const top = view('');
		expect(count(top, '<svg')).toBe(1);
		expect(top).toContain('Plan of IDEA Building');
		expect(count(top, 'data-testid="maps-viewer-map-empty"')).toBe(0);
	});

	it('gives every drawn shape a row in the list beside it', () => {
		// THE DRAWING IS THE SECOND WAY, NEVER THE ONLY ONE. A plan shape is a
		// scale drawing and cannot carry a 44px target without lying about its
		// dimension, so the floor is met by the list -- which means every shape
		// on the plan must also be a row, or the drawing IS the only way to
		// something.
		const room = view(`at=${VFIX.machineShop}`);
		for (const name of ['Tool Chest A', 'Bench Cabinet']) {
			expect(room, name).toContain(name);
		}
		expect(room).toContain('mv-row');
	});

	it('says when a container holds something the plan does not draw', () => {
		const room = view(`at=${VFIX.machineShop}`);
		expect(text(room)).toContain('1 container is in here but not drawn on the plan yet');
	});

	it('shows the whole containment chain as a breadcrumb at every depth below the top', () => {
		const deep = view(`at=${VFIX.drawer1}`);
		expect(count(deep, 'data-testid="maps-viewer-crumbs"')).toBe(1);
		for (const crumb of ['>Map<', 'IDEA Building', 'Machine Shop', 'Tool Chest A', 'Drawer 1']) {
			expect(deep, crumb).toContain(crumb);
		}
		// The level you are on is NOT a link: a control whose only outcome is
		// staying where you are should not be offered.
		expect(count(deep, 'aria-current="page"')).toBe(1);
		expect(count(deep, 'aria-label="Where you are"')).toBe(1);
	});

	it('renders NO breadcrumb at the top of the map, where there is no way back', () => {
		// Prompt 0112: a one-crumb trail is a heading on a bar, and the heading
		// is already there. Both directions, on the same instrument: the top
		// renders none, one level down renders one.
		const top = view('');
		expect(count(top, 'data-testid="maps-viewer-crumbs"')).toBe(0);
		expect(count(top, 'aria-current="page"')).toBe(0);
		expect(top).toContain('IDEA Maps');
		const down = view(`at=${VFIX.building}`);
		expect(count(down, 'data-testid="maps-viewer-crumbs"')).toBe(1);
		expect(count(down, 'aria-current="page"')).toBe(1);
	});

	it('puts the item card behind the breadcrumb, not instead of it', () => {
		const card = view(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`);
		expect(card).toContain('Drawer 1');
		expect(card).toContain('Dial Caliper');
		expect(card).toContain('MIT-505-0099');
		// The vocabulary is SHOWN: the next person who calls it a vernier
		// caliper learns the map knows that word.
		expect(card).toContain('vernier caliper');
		expect(card).toContain('Mitutoyo');
	});

	it('offers the way to a card reached by browsing, and not to one reached by the route', () => {
		// The card's own "Show me the way" is a place card's directions control:
		// offered when the card was opened by hand, withheld when the URL
		// already carries this item as the target (the trail above IS the way).
		const browsed = view(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`);
		expect(count(browsed, 'data-testid="maps-card-way"')).toBe(1);
		expect(browsed).toContain(`to=item%3A${VFIX.shopCaliper}`);
		const routed = view(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}&to=item:${VFIX.shopCaliper}`);
		expect(count(routed, 'data-testid="maps-card-way"')).toBe(0);
		// The copy control is on both: the address is the position.
		expect(count(browsed, 'data-testid="maps-card-copy"')).toBe(1);
		expect(count(routed, 'data-testid="maps-card-copy"')).toBe(1);
	});

	it('leads the card with its photos, before the facts', () => {
		const data = mapsViewerFixture();
		data.photos.push({
			id: 'f0000000-0000-4000-8000-000000000001',
			node_id: null,
			item_type_id: null,
			item_id: VFIX.shopCaliper,
			storage_key: 'items/caliper.jpg',
			caption: 'The caliper in its case',
			sort_order: 1,
			status: 'published',
			published_at: '2026-08-20T12:00:00Z',
			created_at: '2026-08-20T12:00:00Z',
			updated_at: '2026-08-20T12:00:00Z'
		} as (typeof data.photos)[number]);
		const html = render(MapsViewer, {
			props: {
				data,
				search: new URLSearchParams(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`),
				supabaseUrl: 'https://example-ref.supabase.co',
				transports: null
			}
		}).body;
		const photos = html.indexOf('data-testid="maps-card-photos"');
		const facts = html.indexOf('class="mv-facts');
		expect(photos).toBeGreaterThan(-1);
		expect(facts).toBeGreaterThan(-1);
		expect(photos).toBeLessThan(facts);
	});
});

describe('the staged route', () => {
	const q = `&to=item:${VFIX.shopCaliper}&q=caliper`;

	it('numbers the stage and says what is being shown', () => {
		expect(view(`at=${VFIX.building}${q}`)).toContain('Step 2 of 5');
		expect(view(`at=${VFIX.machineShop}${q}`)).toContain('Step 3 of 5');
		expect(view(`at=${VFIX.toolChest}${q}`)).toContain('Step 4 of 5');
	});

	it('offers a next stage and a skip until it arrives, and neither after', () => {
		const middle = view(`at=${VFIX.machineShop}${q}`);
		expect(count(middle, 'Next:')).toBe(1);
		expect(count(middle, 'Skip to the end')).toBe(1);
		expect(count(middle, 'You are there.')).toBe(0);

		const end = view(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}${q}`);
		expect(count(end, 'Next:')).toBe(0);
		expect(count(end, 'Skip to the end')).toBe(0);
		expect(count(end, 'You are there.')).toBe(1);
	});

	it('marks the next link in GOLD and says so in words too', () => {
		// Colour is never the only signal: the gold fill is one, the word
		// "found here" beside it is the one a colour-blind reader gets.
		const middle = view(`at=${VFIX.machineShop}${q}`);
		expect(count(middle, 'is-marked')).toBeGreaterThan(0);
		expect(count(middle, 'found here')).toBe(1);
	});

	it('marks NOTHING when the person has stepped off the route', () => {
		// The Mill Room is nowhere on the caliper's route. The trail stays in
		// the URL, so the walk is still offered -- but nothing on this level may
		// claim to be the thing that was found.
		const off = view(`at=${VFIX.millRoom}${q}`);
		expect(count(off, 'found here')).toBe(0);
		expect(count(off, 'Step ')).toBe(0);
		// POSITIVE CONTROL, same instrument, same fixture: on the route, both.
		const on = view(`at=${VFIX.machineShop}${q}`);
		expect(count(on, 'found here')).toBe(1);
		expect(count(on, 'Step ')).toBeGreaterThan(0);
	});

	it('drops the trail entirely for a target that does not resolve', () => {
		const bogus = view(`at=${VFIX.machineShop}&to=item:nope&q=caliper`);
		expect(count(bogus, 'Step ')).toBe(0);
		expect(count(bogus, 'Skip to the end')).toBe(0);
		// The map itself still renders: an unresolvable link is not a dead page.
		expect(bogus).toContain('Machine Shop');
	});
});

describe('search', () => {
	it('keeps the search bar on every level', () => {
		for (const query of ['', `at=${VFIX.machineShop}`, `at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`]) {
			expect(count(view(query), 'Search the map'), query).toBe(1);
		}
	});

	it('renders server-side results with no client transport at all', () => {
		// The no-JavaScript path, which matters more here than anywhere else in
		// the app: a phone on school wifi in a shop. The form is a real GET, the
		// route answers `?q=` server-side, and the rows arrive as `initialResults`.
		const data = mapsViewerFixture();
		const html = render(MapsViewer, {
			props: {
				data,
				search: new URLSearchParams('q=caliper'),
				transports: null,
				initialResults: [
					{
						result_kind: 'item',
						result_id: VFIX.shopCaliper,
						item_type_id: VFIX.caliperType,
						label: 'Dial Caliper',
						detail: { serial: 'MIT-505-0099' },
						node_id: VFIX.drawer1,
						chain: null,
						depth: 4,
						score: 1
					}
				]
			}
		}).body;
		expect(text(html)).toContain('1 match for caliper');
		expect(html).toContain('Dial Caliper');
		// The result row opens the staged route's FIRST stage, and the skip
		// control opens its last. That is the staging decision, as an href.
		expect(html).toContain('Show me the way');
		expect(html).toContain('Skip to it');
	});

	it('says what to try when nothing matches, rather than showing an empty box', () => {
		const data = mapsViewerFixture();
		const html = render(MapsViewer, {
			props: {
				data,
				search: new URLSearchParams('q=flux+capacitor'),
				transports: null,
				initialResults: []
			}
		}).body;
		expect(text(html)).toContain('Nothing on the map matches flux capacitor yet');
		expect(text(html)).toContain('called something else here');
	});
});

describe('an empty map', () => {
	it('says so, and does not render a blank page', () => {
		const html = render(MapsViewer, {
			props: {
				data: { nodes: [], itemTypes: [], items: [], stock: [], photos: [] },
				search: new URLSearchParams(''),
				transports: null
			}
		}).body;
		expect(text(html)).toContain('Nothing has been published to the map yet');
		expect(count(html, 'Search the map')).toBe(1);
	});
});

describe('the panel', () => {
	it('renders the route\'s chrome at the top of the panel, and none when none is handed in', () => {
		// The portal chrome is the route's, handed in as a snippet: the harness
		// mounts the viewer without it, and the absence must render as nothing
		// rather than as an empty bar.
		const bare = view('');
		expect(count(bare, 'data-testid="maps-viewer-chrome"')).toBe(0);
		expect(count(bare, 'data-testid="maps-viewer-panel"')).toBe(1);
		expect(count(bare, 'data-testid="maps-viewer-map"')).toBe(1);
	});

	it('keeps the search hint beside the box, outside the pinned form', () => {
		const html = view('');
		expect(text(html)).toContain('Half a name works');
		// The hint is what the input is described by, and it is not inside the
		// form -- the pinned block is one label and one row tall.
		expect(html).toContain('aria-describedby="mv-q-hint"');
		const form = html.indexOf('</form>');
		const hint = html.indexOf('id="mv-q-hint"');
		expect(hint).toBeGreaterThan(form);
	});

	it('says so in the panel when the load failed, and still draws the map', () => {
		const data = mapsViewerFixture();
		const html = render(MapsViewer, {
			props: {
				data,
				search: new URLSearchParams(''),
				transports: null,
				notice: 'The map could not be loaded. Try again in a moment.'
			}
		}).body;
		expect(count(html, 'data-testid="maps-viewer-notice"')).toBe(1);
		expect(count(html, '<svg')).toBe(1);
	});
});
