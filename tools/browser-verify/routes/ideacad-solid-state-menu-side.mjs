/**
 * THE REAL MODELER'S RIGHT-CLICK LIST OPENS BESIDE THE MENU (report R04, ledger
 * 0298). The same right-click on empty space as `ideacad-solid-state-menu-empty`,
 * in the real `SolidWorkspace` with its kernel, then a rest on Views.
 *
 * At 1440: nothing at 60 ms, and by 300 ms a second panel beside the menu with
 * the five views, its first row level with Views and every row hit-testable at
 * its centre -- so nothing in the workspace (the canvas, the rails, the top
 * bar) covers it or clips it. At 375 the modeler's phone layout: a rest opens
 * nothing and a press opens the views in place with the Back row.
 * `/dev/ideacad-context-menu` measures the grace, the keys and the flip; this
 * spec is the proof the same component behaves the same in the room it ships in.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=menu-side',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: in the modeler, a right-click list opens beside the menu on a mouse',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const p = await emptyPoint(); if (!p) return 'no empty point on the canvas';
				c.dispatchEvent(new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, button: 2 })); await wait(300);
				const m = document.querySelector('[data-testid="ideacad-context-menu"]'); if (!m) return 'no menu';
				const views = m.querySelector('[data-command="views"]'), layout = m.dataset.submenus;
				const sub = () => document.querySelector('[data-testid="ideacad-context-submenu"]');
				const hits = (root) => { const rows = [...root.querySelectorAll('[data-menu-row]')]; return { rows: rows.length, hit: rows.filter((b) => { const q = b.getBoundingClientRect(); const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return at && at.closest('[data-menu-row]') === b; }).length }; };
				views.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); await wait(60); const early = !!sub(); await wait(240);
				if (layout === 'side') {
					const sp = sub(); if (!sp) { window.__icMenuSide = { layout, opened: false }; return 'beside the menu, but no list after 300 ms'; }
					const mr = m.getBoundingClientRect(), sr = sp.getBoundingClientRect(), fr = sp.querySelector('[data-menu-row]').getBoundingClientRect(), rr = views.getBoundingClientRect(), h = hits(sp);
					window.__icMenuSide = { layout, opened: true, early, side: sp.dataset.side, gap: Math.round(sp.dataset.side === 'right' ? sr.left - mr.right : mr.left - sr.right), rowDelta: Math.round(fr.top - rr.top), rows: h.rows, hit: h.hit };
					return 'beside the menu: nothing at 60 ms (' + !early + '), list on the ' + sp.dataset.side + ', ' + window.__icMenuSide.gap + ' px from the menu, first row ' + window.__icMenuSide.rowDelta + ' px from Views, ' + h.hit + ' of ' + h.rows + ' rows hit-test';
				}
				const restOpened = !!sub(); views.click(); await wait(200);
				const back = document.querySelector('[data-testid="ideacad-context-menu"] .menu-back'), h = hits(document.querySelector('[data-testid="ideacad-context-menu"]'));
				window.__icMenuSide = { layout, early, restOpened, back: !!back, rows: h.rows, hit: h.hit };
				return 'in place: a rest opened ' + (restOpened ? 'a list' : 'nothing') + ', a press opened the views with ' + (back ? 'a' : 'no') + ' Back row, ' + h.hit + ' of ' + h.rows + ' rows hit-test';
			`),
			until: '() => { const o = window.__icMenuSide; if (!o) return false; if (innerWidth >= 1000) return o.layout === "side" && o.opened && !o.early && (o.side === "right" || o.side === "left") && o.gap >= 0 && o.gap <= 2 && Math.abs(o.rowDelta) <= 1 && o.rows === 5 && o.hit === 5; return o.layout === "inline" && !o.early && !o.restOpened && o.back && o.rows === 6 && o.hit === 6; }',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-menu-row][data-command="view-front"]', label: 'the views are open (beside at 1440, in place at 375)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row], [data-testid="ideacad-context-submenu"] [data-menu-row]', label: 'every menu row, in either panel', min: 44 }],
	ignoreConsole: []
};
