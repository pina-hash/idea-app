// tests/maps-select-ladder.test.ts
//
// THE SELECT LADDER 0224 ADDED, AND THE CAPABILITY FLAG BESIDE IT.
//
// WHY THIS IS AUTOMATED AT ALL, when most of this bundle is verified by
// driving the surface: every failure here is SILENT. A deployment sitting
// between this bundle shipping and Mr. Pina pasting 0224 by hand is a real
// state -- every migration in this repo is applied separately and by hand --
// and in it the wide rung's select names two columns PostgREST does not know
// about. PostgREST rejects the WHOLE select on an unknown column, so the
// failure is not a missing wall, it is `/maps` rendering an empty map to a
// phone standing at a toolbox. Nothing on screen says which happened.
//
// AND THE FLAG'S FAILURE IS QUIETER STILL. `thicknessReady` false means "this
// deployment cannot answer"; a null thickness on a ready deployment means
// "nobody typed one". Conflating them offers a thickness field whose value
// goes nowhere, which type-checks, renders, and reports nothing. A mutation
// setting the flag unconditionally true survived every other test in this
// bundle, which is why this file exists.
//
// THE SHIM IS THE REAL CONTRACT. `MapsReadClient` is asserted by handing in a
// client that REFUSES the wide select the way PostgREST refuses it -- an
// error object on the result, not a throw -- so a ladder written to catch
// exceptions rather than read `result.error` cannot pass.

import { describe, expect, it } from 'vitest';
import {
	MAPS_NODE_COLUMNS,
	MAPS_NODE_COLUMNS_0224,
	MAPS_NODE_RUNGS,
	loadMapsNodes,
	type MapsReadClient
} from '../src/lib/maps/selects';
import { mapsThicknessReady } from '../src/lib/maps/maps';

/** PostgREST's own shape for an unknown column: a result carrying an error, never a throw. */
const PGRST204 = (column: string) => ({
	data: null,
	error: { message: `column maps_nodes.${column} does not exist` }
});

/**
 * A client that answers only the selects it was told about. Every call is
 * RECORDED, so a test can assert which rungs were actually attempted rather
 * than only what came back -- a ladder that answered correctly by skipping
 * straight to the narrow rung would be a ladder that never offers the feature.
 */
function client(answers: (columns: string) => unknown, seen: string[]): MapsReadClient {
	return {
		from(table: string) {
			const run = (columns: string) => {
				if (table === 'maps_nodes') seen.push(columns);
				return Promise.resolve(answers(columns) as { data: unknown; error: null });
			};
			return Object.assign(
				{
					then: (res: (v: unknown) => unknown) => run('').then(res)
				},
				{
					select: (columns: string) =>
						Object.assign(run(columns), {
							eq: () => run(columns)
						})
				}
			) as ReturnType<MapsReadClient['from']>;
		}
	};
}

const ROW = { id: 'n1', name: 'Machine Shop' };

describe('the rungs', () => {
	it('are two, widest first, and strictly narrow', () => {
		expect(MAPS_NODE_RUNGS.length).toBe(2);
		expect(MAPS_NODE_RUNGS[0]).toBe(MAPS_NODE_COLUMNS_0224);
		expect(MAPS_NODE_RUNGS[1]).toBe(MAPS_NODE_COLUMNS);
		// STRICTLY narrowing: every column the narrow rung names is on the wide
		// one, and the wide one names at least one more. Asserted as sets so a
		// reordering is not a failure and a DROPPED column is.
		const cols = (s: string) => new Set(s.split(',').map((c) => c.trim()));
		const wide = cols(MAPS_NODE_RUNGS[0]);
		const narrow = cols(MAPS_NODE_RUNGS[1]);
		for (const c of narrow) expect(wide.has(c), `wide rung dropped ${c}`).toBe(true);
		expect(wide.size).toBeGreaterThan(narrow.size);
	});

	it('differ by exactly the two columns 0224 adds, and no others', () => {
		const cols = (s: string) => new Set(s.split(',').map((c) => c.trim()));
		const extra = [...cols(MAPS_NODE_RUNGS[0])].filter((c) => !cols(MAPS_NODE_RUNGS[1]).has(c));
		expect(extra.sort()).toEqual(['default_wall_thickness_in', 'wall_thickness_in']);
	});

	it('is derived from the base set rather than typed twice', () => {
		// The wide rung is written as a derivation, so a column added to the
		// base set cannot be left out of it -- which is how two hand-maintained
		// select strings stop agreeing. Asserted by construction.
		expect(MAPS_NODE_COLUMNS_0224.startsWith(MAPS_NODE_COLUMNS)).toBe(true);
	});
});

describe('loadMapsNodes descends the ladder', () => {
	it('takes the wide rung where 0224 is applied, and reports the capability', async () => {
		const seen: string[] = [];
		const out = await loadMapsNodes(client(() => ({ data: [ROW], error: null }), seen));
		expect(seen).toEqual([MAPS_NODE_COLUMNS_0224]);
		expect(out.nodes).toEqual([ROW]);
		expect(out.thicknessReady).toBe(true);
	});

	it('degrades to the narrow rung where it is not, and says it CANNOT TELL', async () => {
		const seen: string[] = [];
		const out = await loadMapsNodes(
			client(
				(columns) =>
					columns.includes('wall_thickness_in')
						? PGRST204('wall_thickness_in')
						: { data: [ROW], error: null },
				seen
			)
		);
		// Both rungs were attempted, in order, widest first.
		expect(seen).toEqual([MAPS_NODE_COLUMNS_0224, MAPS_NODE_COLUMNS]);
		// The map still loads. This is the half that matters: PostgREST rejects
		// the whole select on an unknown column, so without the fallback rung
		// `/maps` would render empty rather than render without walls.
		expect(out.nodes).toEqual([ROW]);
		// And "cannot tell" must never read as "no wall".
		expect(out.thicknessReady).toBe(false);
		expect(mapsThicknessReady({ thicknessReady: out.thicknessReady })).toBe(false);
	});

	it('re-throws when the LAST rung fails, rather than answering an empty map', async () => {
		// A read that genuinely cannot run is a page that says so. A ladder that
		// bottomed out into `[]` would render the map as empty, which is the
		// one failure a map cannot have -- it lies by omission.
		const seen: string[] = [];
		await expect(
			loadMapsNodes(client(() => ({ data: null, error: { message: 'permission denied' } }), seen))
		).rejects.toThrow('permission denied');
		expect(seen.length).toBe(2);
	});

	it('answers an EMPTY table as an empty list on the wide rung, not as a failure', async () => {
		// The positive control for the rung-count assertions above: a genuinely
		// empty answer must not be mistaken for a refusal and drop a rung.
		const seen: string[] = [];
		const out = await loadMapsNodes(client(() => ({ data: [], error: null }), seen));
		expect(seen).toEqual([MAPS_NODE_COLUMNS_0224]);
		expect(out.nodes).toEqual([]);
		expect(out.thicknessReady).toBe(true);
	});
});

describe('the capability flag', () => {
	it('defaults to FALSE, so a payload built before it existed degrades rather than claims', () => {
		expect(mapsThicknessReady({})).toBe(false);
		expect(mapsThicknessReady({ thicknessReady: undefined })).toBe(false);
		expect(mapsThicknessReady({ thicknessReady: false })).toBe(false);
		// The positive control in the same read.
		expect(mapsThicknessReady({ thicknessReady: true })).toBe(true);
	});
});
