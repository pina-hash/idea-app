/**
 * A FACE LYING IN A REFERENCE PLANE IS ONE COLOUR, NOT A FAN OF WEDGES. Report
 * R06, ledger 0298.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a 4 x 3 x 1 plate
 * sketched at the origin, so its front face lies exactly in the Front plane,
 * with the planes preference set to Always. The plane's faint fill and the
 * face were drawn at the same depth, and the depth test chose between them
 * triangle by triangle, so the face showed as light and dark WEDGES following
 * its own triangulation. A face bounded by a round is triangulated as a fan
 * from the round's arc (29 triangles on the top of a plate with one vertical
 * round, measured in node), so the same fight there would draw thin wedges
 * running from the round across the face, which is how report R06's
 * screenshot was described. That fan was REASONED from the triangulation and
 * not rendered: one render of a plate pulled down from the Top plane with a
 * round on it happened to fall uniform, before and after.
 * Measured on this state before the repair: 2 tones over 65 samples at 1440
 * (rgb 102,120,129, the fill's tint, and 84,105,119, the bare face), and 1 at
 * 375, where that run's triangles happened to fall one way; after it, 1 tone,
 * the bare face, at both widths. A screenshot of the same plate moved 0.5 in
 * off the plane showed the fill still tinting the face in front of it.
 *
 * What is claimed, as counts. The prepare step reads the renderer's own
 * pixels (`ideaCadSolid.pixels()`) at 65 points on the front face, inside the
 * plane's rectangle and clear of its outline and of the Origin marker, and
 * counts the distinct colours (each channel to within 3). Its `until` holds
 * that count at exactly 1 over at least 55 samples that landed on the canvas,
 * so a wedge of either tone fails the step, and holds the datum layer drawn
 * (9 objects: three planes of fill, outline and label) as the positive
 * control that there was a fill to fight with.
 */
export default {
	path: '/dev/ideacad-solid?state=coplanar-plane',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: a face lying in the Front plane reads as one colour, not a fan of wedges',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{
			evaluate: `async () => {
				const s = window.ideaCadSolid, c = document.querySelector('.solid-workspace canvas');
				const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
				const idle = async () => { for (let i = 0; i < 400 && s.busy; i++) await sleep(25); };
				await idle();
				if (!s.model.features.some((f) => f.id === 'ex1')) {
					const entities = [
						{ id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 0 }, { id: 'p3', type: 'point', x: 4, y: 3 }, { id: 'p4', type: 'point', x: 0, y: 3 },
						{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' }
					];
					await s.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities, constraints: [] } }, 'Draw sketch'); await idle();
					await s.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 1, operation: 'new' } }, 'Extrude'); await idle();
				}
				s.preferences.set('view', { ...s.prefs.view, planes: 'always' }); await idle(); await sleep(200);
				s.select(null); s.view('iso'); s.fit(); await sleep(500);
				const drawn = s.drawn().datums;
				const buffer = s.pixels(), size = s.painted(), r = c.getBoundingClientRect();
				const tones = [], at = (p) => { const x = Math.round((p.x - r.left) * size.width / r.width), y = size.height - 1 - Math.round((p.y - r.top) * size.height / r.height); if (x < 0 || y < 0 || x >= size.width || y >= size.height) return null; const i = (y * size.width + x) * 4; return [buffer[i], buffer[i + 1], buffer[i + 2]]; };
				let samples = 0;
				for (let x = 0.8; x <= 2.01; x += 0.1) for (const z of [0.2, 0.35, 0.5, 0.65, 0.8]) {
					const p = s.project([x, 0, z]), hit = document.elementFromPoint(p.x, p.y);
					if (hit !== c) continue;
					const px = at(p); if (!px) continue;
					samples++;
					if (!tones.some((t) => t.every((v, k) => Math.abs(v - px[k]) <= 3))) tones.push(px);
				}
				window.__icCoplanar = { samples, tones: tones.length, drawn };
				return samples + ' samples on the front face, ' + tones.length + ' tone(s): ' + tones.map((t) => 'rgb(' + t.join(',') + ')').join(' ') + '; ' + drawn + ' datum objects drawn';
			}`,
			until: '() => !!window.__icCoplanar && window.__icCoplanar.samples >= 55 && window.__icCoplanar.tones === 1 && window.__icCoplanar.drawn > 0',
			attempts: 2,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '.solid-workspace canvas', label: 'the model canvas', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	ignoreConsole: []
};
