/**
 * SHARED BY THE `ideacad-live*` SPECS (feedback R34). A leading underscore keeps
 * the loader from reading this file as a route.
 *
 * `/dev/ideacad-live` captures each workspace's dev hook as it mounts:
 * `window.__icA` is Ana's window, `window.__icB` is Ben's, and
 * `window.__icLive` is the in-memory server (its log, and `setHold` to make
 * Ben's saves fail on the wire so window B stays unsaved on purpose).
 */

/** Both windows mounted, idle, and past their first status word. `liveCount` is how many should read "Live". */
export const liveReady = (liveCount = 2) => `() => !!window.__icA && !!window.__icB && !window.__icA.busy && !window.__icB.busy
	&& document.querySelectorAll('[data-testid="ideacad-live-state"][data-status="live"]').length === ${liveCount}
	&& document.querySelectorAll('[data-testid="ideacad-live-state"][data-status="connecting"]').length === 0`;

/** The helpers every evaluate below opens with, and a two-line sketch A draws. */
export const HELPERS = `
	const A = window.__icA, B = window.__icB, server = window.__icLive;
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const idle = async (s) => { for (let i = 0; i < 400 && s.busy; i++) await wait(25); };
	const paneB = document.querySelector('[data-testid="live-pane-b"]');
	const entities = [
		{ id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 3, y: 0 }, { id: 'p3', type: 'point', x: 3, y: 2 }, { id: 'p4', type: 'point', x: 0, y: 2 },
		{ id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p4' }, { id: 'l4', type: 'line', a: 'p4', b: 'p1' }
	];
	const sketchInA = () => A.apply({ type: 'add-feature', feature: { id: 'sk1', name: 'Base sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities, constraints: [] } }, 'Draw sketch');
	const extrudeInA = () => A.apply({ type: 'add-feature', feature: { id: 'ex1', name: 'Plate', type: 'extrude', sketch: 'sk1', distance: 0.5, operation: 'new' } }, 'Extrude');
	const showB = async () => { if (innerWidth < 1024) paneB.scrollIntoView({ block: 'start', behavior: 'instant' }); await wait(200); };
	const note = () => (paneB.querySelector('[data-testid="ideacad-live-note"]')?.textContent ?? '').trim();
`;
export const liveSource = (body) => `async () => {${HELPERS}${body}}`;

/** A press at a control's own centre lands on that control: the only read that tells a covered or clipped control from a usable one. */
export const hitsItself = (selector) => `() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return ['absent']; const r = b.getBoundingClientRect(); return [document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b]; }`;

const PANEL_B = '[data-testid="live-pane-b"] [data-testid="ideacad-recovery"]';

/** Reach the offer: Ben's saves held (failing on the wire, so his rename stays unsaved), Ben renames, Ana sketches and saves, then Ben's save goes out and is refused as stale -- the ordinary path, since an autosave fires 800 ms after an edit. Shared by the offer and loaded specs. */
export const REACH_OFFER = liveSource(`
	if (!paneB.querySelector('[data-testid="ideacad-live-offer"]')) {
		server.setHold(true);
		await idle(B); await B.apply({ type: 'title', title: 'Ben version' }, 'Rename document'); await idle(B);
		await wait(1200);
		await idle(A); await sketchInA(); await idle(A); await A.save();
		/* While Ben's save is retrying it is a save on the wire, and the live layer waits (it may be his own). Release it: the server refuses it as stale, and the offer follows. */
		await wait(1500);
		server.setHold(false);
		try { await B.save(); } catch {}
		for (let i = 0; i < 400 && !paneB.querySelector('[data-testid="ideacad-live-offer"]'); i++) await wait(25);
	}
	await showB();
	return 'B title "' + B.snapshot.manifest.title + '", B features ' + B.model.features.length + ', A features ' + A.model.features.length + '; B panel: ' + (paneB.querySelector('[data-testid="ideacad-recovery"]')?.textContent ?? '(none)').trim();
`);
export const OFFER_SHOWN = `() => !!window.__icB && /Ana Reyes saved a newer version/.test(document.querySelector('${PANEL_B}')?.textContent ?? '') && window.__icB.snapshot.manifest.title === 'Ben version'`;

/**
 * How many of window B's own controls (the tool palette and the top bar) the LIVE LAYER covers: a press at the control's
 * centre that lands inside the live note or the recovery panel. Asked that way rather than "is every control reachable",
 * because at a 718px pane some of these controls already overlap each other with no live layer on screen at all
 * (measured: the view control's hidden measuring copies, the empty-part cue over two tools, and the view buttons over
 * the panel toggles), and a probe that counted those would blame this layer for them. The second value is how many
 * controls a press DOES reach, the positive control that the probe was looking at real buttons.
 */
export const COVERED_CONTROLS_B = `() => { const pane = document.querySelector('[data-testid="live-pane-b"]'); const list = [...pane.querySelectorAll('.top-bar button, .tools button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const hitOf = (b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); }; const byLive = list.filter((b) => { const h = hitOf(b); return !!h && !!h.closest('[data-testid="ideacad-live-note"], [data-testid="ideacad-recovery"]'); }); const reached = list.filter((b) => { const h = hitOf(b); return !!h && b.contains(h); }); return [byLive.length, reached.length >= 5]; }`;

/** Is a box a line IN FLOW between window B's model and its footer: below the work area, above the footer, inside the window's width? */
export const IN_FLOW_B = (selector) => `() => { const pane = document.querySelector('[data-testid="live-pane-b"]'); const el = pane.querySelector(${JSON.stringify(selector)}); if (!el) return ['absent']; const n = el.getBoundingClientRect(), w = pane.querySelector('.workarea').getBoundingClientRect(), f = pane.querySelector('.solid-workspace footer').getBoundingClientRect(), s = pane.querySelector('.solid-workspace').getBoundingClientRect(); return [n.top >= w.bottom - 0.5, n.bottom <= f.top + 0.5, n.left >= s.left - 0.5 && n.right <= s.right + 0.5]; }`;
