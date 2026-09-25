/**
 * DRIVING THE RIGHT-CLICK MENU'S LISTS FROM A PREPARE STEP (report R04, ledger
 * 0298). Shared by the `ideacad-context-menu*` specs; a leading underscore
 * keeps the loader from reading this file as a route.
 *
 * A prepare step can only click, wait or evaluate, and there is no hover step,
 * so these are EVALUATE SOURCES that dispatch real `PointerEvent` and
 * `KeyboardEvent` objects at the menu's own elements. `pointerenter` and
 * `pointerleave` do not bubble and Svelte attaches them to the element itself,
 * so a dispatched one reaches exactly the handler a mouse would; what it does
 * NOT exercise is the browser deciding which element is under a moving
 * pointer, which is why every placement below is also HIT-TESTED with
 * `elementFromPoint` at each row's own centre.
 *
 * Every source REOPENS the menu first (`__icMenuHarness.open`), so a step the
 * runner retries starts from the same state rather than from the last try's.
 * Each writes what it measured to a `window.__icMenu*` object and returns it as
 * a sentence; the spec's `until` reads the object, and branches on the window's
 * width because one spec runs at 375 (in place) and 1440 (beside the menu).
 */
const HELPERS = `
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const h = window.__icMenuHarness;
	const menu = () => document.querySelector('[data-testid="ideacad-context-menu"]');
	const sub = () => document.querySelector('[data-testid="ideacad-context-submenu"]');
	const row = (root, id) => root && root.querySelector('[data-command="' + id + '"]');
	const pe = (el, type, relatedTarget = null, pointerType = 'mouse') => el && el.dispatchEvent(new PointerEvent(type, { bubbles: false, cancelable: false, pointerType, relatedTarget }));
	const kd = (el, key) => el && el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
	const hits = (root) => { const rows = [...root.querySelectorAll('[data-menu-row]')]; return { rows: rows.length, hit: rows.filter((b) => { const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at && at.closest('[data-menu-row]') === b; }).length }; };
	const reopen = async (kind) => { const where = new URLSearchParams(location.search).get('at'); h.open(where === 'right' ? innerWidth - 40 : 40, where === 'bottom' ? innerHeight - 60 : 120, kind); await wait(150); };
`;
const source = (body) => `async () => {${HELPERS}${body}}`;

/** A spec's page is ready once the harness has mounted and the menu has been placed (it is hidden until it has a place). */
export const MENU_READY = '() => document.querySelector(\'[data-testid="ideacad-menu-harness"]\')?.dataset.ready === "true" && getComputedStyle(document.querySelector(\'[data-testid="ideacad-context-menu"]\') || document.body).visibility === "visible" && !!window.__icMenuHarness';

/**
 * REST ON A ROW WITH A LIST. On a mouse with room, nothing at 60 ms and a
 * second panel beside the menu by 300 ms, its first row level with the row,
 * every row of it hit-testable at its centre, on the side there is room. In
 * place (a phone), nothing opens on a rest at all, and a press opens the list
 * inside the menu with its Back row.
 */
export const restOn = (rowId, kind = 'empty') => source(`
	await reopen('${kind}');
	const m = menu(), r = row(m, '${rowId}'), layout = m.dataset.submenus;
	pe(r, 'pointerenter'); await wait(60); const early = !!sub(); await wait(240);
	const s = sub();
	if (layout === 'side') {
		if (!s) { window.__icMenuRest = { layout, early, opened: false }; return 'beside the menu, but no list 300 ms after resting on the row'; }
		const mr = box(m), sr = box(s), rr = box(r), fr = box(s.querySelector('[data-menu-row]')), h2 = hits(s);
		window.__icMenuRest = { layout, early, opened: true, side: s.dataset.side, gapRight: Math.round(sr.left - mr.right), gapLeft: Math.round(mr.left - sr.right), rowDelta: Math.round(fr.top - rr.top), rows: h2.rows, hit: h2.hit, expanded: r.getAttribute('aria-expanded'), onScreen: sr.left >= 0 && sr.right <= innerWidth && sr.top >= 0 && sr.bottom <= innerHeight, list: [mr.left, mr.right, sr.left, sr.right].map(Math.round).join(',') };
		const o = window.__icMenuRest;
		return 'beside the menu: nothing at 60 ms (' + !early + '), list on the ' + o.side + ' by 300 ms, menu x ' + Math.round(mr.left) + '-' + Math.round(mr.right) + ', list x ' + Math.round(sr.left) + '-' + Math.round(sr.right) + ', first row ' + o.rowDelta + ' px from the row, ' + o.hit + ' of ' + o.rows + ' rows hit-test at their centre, aria-expanded ' + o.expanded;
	}
	const restOpened = !!s;
	r.click(); await wait(200);
	const m2 = menu(), back = m2.querySelector('.menu-back'), h2 = hits(m2);
	window.__icMenuRest = { layout, early, restOpened, back: !!back, backLabel: back ? back.textContent.trim() : '', rows: h2.rows, hit: h2.hit, sub: !!sub() };
	return 'in place: a rest opened ' + (restOpened ? 'a list' : 'nothing') + ', a press opened the list inside the menu with its Back row (' + (back ? back.textContent.trim() : 'none') + '), ' + h2.hit + ' of ' + h2.rows + ' rows hit-test';
`);

/** The shared `until` for `restOn`: beside the menu on the named side at 1440, in place at 375. */
export const restHeld = (side, rows) => `() => { const o = window.__icMenuRest; if (!o) return false;
	if (innerWidth >= 1000) return o.layout === 'side' && o.opened && !o.early && o.side === '${side}' && (o.side === 'right' ? o.gapRight : o.gapLeft) >= 0 && (o.side === 'right' ? o.gapRight : o.gapLeft) <= 2 && Math.abs(o.rowDelta) <= 1 && o.rows === ${rows} && o.hit === o.rows && o.expanded === 'true' && o.onScreen;
	return o.layout === 'inline' && !o.early && !o.restOpened && o.back && !o.sub && o.rows === ${rows} + 1 && o.hit === o.rows; }`;

/**
 * THE WAIT THAT MAKES A DIAGONAL MOVE WORK, AND ITS CONTROLS. Beside the menu
 * only (in place there is nothing to wait for). The list stays when the pointer
 * crosses a row with no list and enters the list inside the grace; it closes
 * when the pointer RESTS on that row past the grace (the control that proves
 * the first reading is the grace and not a list that never closes); it closes
 * when the pointer leaves both panels, but not before the grace is up. Then the
 * keys: the right arrow opens the list and moves into it, the left arrow closes
 * it and goes back to its row, and Escape does the same. It ends with the list
 * open again by a rest, so the static checks measure it.
 */
export const graceAndKeys = (rowId, otherId) => source(`
	await reopen('empty');
	const m = menu(), r = row(m, '${rowId}'), o = row(m, '${otherId}');
	if (m.dataset.submenus !== 'side') { window.__icMenuGrace = { layout: m.dataset.submenus }; r.click(); await wait(200); return 'in place at this width: no wait to measure, list opened in place again'; }
	pe(r, 'pointerenter'); await wait(300);
	pe(r, 'pointerleave', o); pe(o, 'pointerenter'); await wait(120); pe(sub(), 'pointerenter'); await wait(400); const kept = !!sub();
	pe(o, 'pointerenter'); await wait(120); const beforeGrace = !!sub(); await wait(300); const closedOnRest = !sub();
	pe(r, 'pointerenter'); await wait(300); const reopened = !!sub();
	pe(m, 'pointerleave', document.querySelector('.surface')); await wait(120); const leftDuringGrace = !!sub(); await wait(300); const closedOnLeave = !sub();
	r.focus(); kd(r, 'ArrowRight'); await wait(150);
	const s = sub(), first = s && s.querySelector('[data-menu-row]'), keyOpened = !!s && document.activeElement === first;
	kd(document.activeElement, 'ArrowLeft'); await wait(150); const keyBack = !sub() && document.activeElement === r;
	kd(r, 'ArrowRight'); await wait(150); kd(document.activeElement, 'Escape'); await wait(150); const escapeBack = !sub() && document.activeElement === r && !!menu();
	r.blur(); pe(r, 'pointerenter'); await wait(300); const finalOpen = !!sub();
	window.__icMenuGrace = { layout: 'side', kept, beforeGrace, closedOnRest, reopened, leftDuringGrace, closedOnLeave, keyOpened, keyBack, escapeBack, finalOpen };
	return Object.entries(window.__icMenuGrace).map(([k, v]) => k + ' ' + v).join(', ');
`);
export const GRACE_HELD = '() => { const g = window.__icMenuGrace; if (!g) return false; if (innerWidth < 1000) return g.layout === "inline"; return g.layout === "side" && g.kept && g.beforeGrace && g.closedOnRest && g.reopened && g.leftDuringGrace && g.closedOnLeave && g.keyOpened && g.keyBack && g.escapeBack && g.finalOpen; }';

/**
 * A FINGER ON A SCREEN WHOSE MAIN POINTER IS A MOUSE (a touch-screen laptop),
 * so the menu is in its beside-the-menu layout. A tap sends `pointerenter` and
 * then, once the finger lifts, `pointerleave` with nothing under it -- in
 * Chrome the leave arrives BEFORE the click. The tap order is played here as
 * it arrives: a tap on Pick filter opens its list, and a tap on one of its
 * boxes (which stay open) ticks it and leaves the list OPEN 500 ms later. A
 * leave that closed the lists for any pointer, not only a mouse, closed that
 * list 300 ms after every tap. At 375 the same taps work in place.
 */
export const fingerTaps = () => source(`
	await reopen('empty');
	const m = menu(), layout = m.dataset.submenus;
	const tap = async (panel, el) => { pe(panel, 'pointerenter', null, 'touch'); pe(el, 'pointerenter', null, 'touch'); pe(el, 'pointerleave', null, 'touch'); pe(panel, 'pointerleave', null, 'touch'); el.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, detail: 1, pointerType: 'touch' })); await wait(60); };
	await tap(m, row(m, 'pick-filter'));
	const list = layout === 'side' ? sub() : menu();
	const opened = !!list && !!row(list, 'pick-face');
	if (!opened) { window.__icMenuFinger = { layout, opened }; return 'a tap on Pick filter opened no list (' + layout + ')'; }
	await tap(list, row(list, 'pick-face')); await wait(440);
	const after = layout === 'side' ? sub() : menu(), box1 = after && row(after, 'pick-face');
	window.__icMenuFinger = { layout, opened, held: !!box1, ticked: !!box1 && box1.getAttribute('aria-checked') === 'true' };
	return 'a finger (' + layout + '): a tap opened the pick filter, a tap on Faces ' + (window.__icMenuFinger.ticked ? 'ticked it' : 'did not tick it') + ', and 500 ms later the list is ' + (box1 ? 'still open' : 'CLOSED');
`);
export const FINGER_HELD = '() => { const f = window.__icMenuFinger; return !!f && f.layout === (innerWidth >= 1000 ? "side" : "inline") && f.opened && f.held && f.ticked; }';

/**
 * PREVIEW ON EVERY PATH, on Select other's candidates, read off the harness's
 * `lit` line: lit while hovered, un-lit on leave, lit on focus, and un-lit when
 * the list it is in closes under it (Escape beside the menu, Back in place).
 */
export const previewPaths = () => source(`
	await reopen('face');
	const m = menu(), r = row(m, 'select-other'), side = m.dataset.submenus === 'side';
	const lit = () => h.lit;
	if (side) { pe(r, 'pointerenter'); await wait(300); } else { r.click(); await wait(200); }
	const list = side ? sub() : menu();
	const c0 = row(list, 'candidate-0'), c1 = row(list, 'candidate-1');
	pe(c0, 'pointerenter'); await wait(50); const onHover = lit();
	pe(c0, 'pointerleave'); await wait(50); const offLeave = lit();
	c1.focus(); await wait(50); const onFocus = lit();
	if (side) kd(c1, 'Escape'); else menu().querySelector('.menu-back').click();
	await wait(200); const offClose = lit();
	window.__icMenuPreview = { side, onHover, offLeave, onFocus, offClose, menuOpen: !!menu() };
	return (side ? 'beside' : 'in place') + ': hover lit "' + onHover + '", leave lit "' + offLeave + '", focus lit "' + onFocus + '", closing the list lit "' + offClose + '"';
`);
export const PREVIEW_HELD = '() => { const p = window.__icMenuPreview; return !!p && p.side === (innerWidth >= 1000) && p.onHover === "End face of Extrude 1" && p.offLeave === "nothing" && p.onFocus === "Edge of Extrude 1" && p.offClose === "nothing" && p.menuOpen; }';

/**
 * A FINGER ON A WIDE SCREEN: `(pointer: fine)` answered false, the menu
 * reopened, and a rest opens nothing while a press opens the list in place.
 * The instrument patches `matchMedia` for that one query; the component's own
 * read of it is what is under test.
 */
export const coarse = (rowId) => source(`
	const real = window.matchMedia.bind(window);
	window.matchMedia = (q) => (q === '(pointer: fine)' ? { matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : real(q));
	await reopen('empty');
	const m = menu(), r = row(m, '${rowId}');
	pe(r, 'pointerenter'); await wait(300); const restOpened = !!sub();
	r.click(); await wait(200);
	const back = menu().querySelector('.menu-back');
	window.__icMenuCoarse = { layout: m.dataset.submenus, restOpened, back: !!back, sub: !!sub(), width: innerWidth };
	return 'a finger at ' + innerWidth + ' px: layout ' + m.dataset.submenus + ', a rest opened ' + (restOpened ? 'a list' : 'nothing') + ', a press opened it ' + (back ? 'in place with its Back row' : 'somewhere else');
`);
export const COARSE_HELD = '() => { const c = window.__icMenuCoarse; return !!c && c.layout === "inline" && !c.restOpened && c.back && !c.sub; }';
