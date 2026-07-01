import { vanguardHtml } from '$lib/legacy';
import { normalizeStored, type StoredSave } from '$lib/vanguard-save';
import type { RequestHandler } from './$types';

/**
 * Public VANGUARD endpoint, served at `/vanguard/`.
 *
 * The game file is never modified. We inject a small bootstrap into <head> (so
 * it runs before the game's own script reads localStorage):
 *   - Signed in: synchronously MERGE the user's cloud save into the local
 *     `vanguard_*` keys (progression is unioned/maxed so nothing is clobbered;
 *     preferences are adopted from this device's class bucket), wrap
 *     `localStorage.setItem` to push changes to `/api/vanguard-save`, and render
 *     a floating cloud-save widget (status pill + device tag + Back up / Restore).
 *   - Signed out: render a minimal "sign in to sync" pill; saves stay local.
 *
 * The merge logic mirrored below in JS MUST stay aligned with the canonical TS
 * in `$lib/vanguard-save.ts` (the seed runs synchronously in the browser before
 * the game reads localStorage, so it cannot import that module).
 *
 * `trailingSlash = 'always'` keeps the page URL at `/vanguard/`, so the game's
 * relative `audio/...` references resolve against `static/vanguard/audio/...`.
 */
export const trailingSlash = 'always';

/** Escape a JSON string so it can be safely embedded inside an inline <script>. */
function escapeForScript(jsonStr: string): string {
	return jsonStr
		.replace(/</g, '\\u003c')
		.split(String.fromCharCode(0x2028))
		.join('\\u2028')
		.split(String.fromCharCode(0x2029))
		.join('\\u2029');
}

/** Build the <head> bootstrap. `cloud` is the normalized v2 save (empty if signed out). */
function injectionScript(signedIn: boolean, cloud: StoredSave): string {
	const cloudJson = escapeForScript(JSON.stringify(cloud));

	return `<script>
(function () {
	var SIGNED_IN = ${signedIn ? 'true' : 'false'};
	var CLOUD = ${cloudJson};
	var PREFIX = 'vanguard_';
	var native = localStorage.setItem.bind(localStorage);

	// --- merge logic (keep aligned with src/lib/vanguard-save.ts) ---
	var PROGRESSION_KEYS = ['vanguard_build', 'vanguard_scores', 'vanguard_games', 'vanguard_tutdone', 'vanguard_lastInitials'];
	var DEVICE_LOCAL_KEYS = ['vanguard_did'];
	function num(v) { var n = v === true ? 1 : v === false ? 0 : Number(v); return isFinite(n) ? n : 0; }
	function parseObj(s) { if (typeof s !== 'string') return null; try { var v = JSON.parse(s); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; } catch (e) { return null; } }
	function mergeMaxMap(a, b) { var out = {}; a = (a && typeof a === 'object') ? a : {}; b = (b && typeof b === 'object') ? b : {}; var ks = {}; Object.keys(a).forEach(function (k) { ks[k] = 1; }); Object.keys(b).forEach(function (k) { ks[k] = 1; }); Object.keys(ks).forEach(function (k) { out[k] = Math.max(num(a[k]), num(b[k])); }); return out; }
	function mergeBuild(as, bs) {
		var a = parseObj(as), b = parseObj(bs);
		if (!a) return bs; if (!b) return as;
		var aS = num(a.spent), bS = num(b.spent), dom = bS > aS ? b : a;
		return JSON.stringify({
			up: mergeMaxMap(a.up, b.up), unlocked: mergeMaxMap(a.unlocked, b.unlocked), heavyUnlocked: mergeMaxMap(a.heavyUnlocked, b.heavyUnlocked),
			bombs: Math.max(num(a.bombs), num(b.bombs)), shieldHits: Math.max(num(a.shieldHits), num(b.shieldHits)), spent: Math.max(aS, bS),
			drone: !!(a.drone || b.drone),
			heavy: (dom.heavy != null ? dom.heavy : (a.heavy != null ? a.heavy : b.heavy)),
			wtype: (dom.wtype != null ? dom.wtype : (a.wtype != null ? a.wtype : b.wtype))
		});
	}
	function parseScores(s) { if (typeof s !== 'string') return []; try { var v = JSON.parse(s); if (!Array.isArray(v)) return []; return v.filter(function (e) { return e && typeof e === 'object' && typeof e.score === 'number'; }).map(function (e) { return { name: String(e.name == null ? '' : e.name), score: Number(e.score) }; }); } catch (e) { return []; } }
	function mergeScores(as, bs) { if (as == null && bs == null) return undefined; var all = parseScores(as).concat(parseScores(bs)).sort(function (x, y) { return y.score - x.score; }); var seen = {}, out = []; for (var i = 0; i < all.length; i++) { var e = all[i], key = e.name + '|' + e.score; if (seen[key]) continue; seen[key] = 1; out.push(e); if (out.length >= 10) break; } return JSON.stringify(out); }
	function mergeProgression(a, b) {
		a = a || {}; b = b || {}; var out = {};
		var build = mergeBuild(a.vanguard_build, b.vanguard_build); if (build != null) out.vanguard_build = build;
		var sc = mergeScores(a.vanguard_scores, b.vanguard_scores); if (sc != null) out.vanguard_scores = sc;
		if (a.vanguard_games != null || b.vanguard_games != null) out.vanguard_games = String(Math.max(num(a.vanguard_games), num(b.vanguard_games)));
		if (a.vanguard_tutdone === '1' || b.vanguard_tutdone === '1') out.vanguard_tutdone = '1';
		else if (a.vanguard_tutdone != null || b.vanguard_tutdone != null) out.vanguard_tutdone = (a.vanguard_tutdone != null ? a.vanguard_tutdone : b.vanguard_tutdone);
		if (b.vanguard_lastInitials != null || a.vanguard_lastInitials != null) out.vanguard_lastInitials = (b.vanguard_lastInitials != null ? b.vanguard_lastInitials : a.vanguard_lastInitials);
		return out;
	}
	function deviceClass() {
		try {
			var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
			var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
			var ua = /Mobi|Android|iPhone|iPad|iPod|Tablet/i.test(navigator.userAgent || '');
			return ((coarse && touch) || ua) ? 'mobile' : 'desktop';
		} catch (e) { return 'desktop'; }
	}
	var DEVICE = deviceClass();

	function localProgression() { var out = {}; for (var i = 0; i < PROGRESSION_KEYS.length; i++) { var k = PROGRESSION_KEYS[i]; var v = localStorage.getItem(k); if (v != null) out[k] = v; } return out; }
	function snapshot() { var out = {}; for (var i = 0; i < localStorage.length; i++) { var key = localStorage.key(i); if (key && key.indexOf(PREFIX) === 0 && DEVICE_LOCAL_KEYS.indexOf(key) === -1) out[key] = localStorage.getItem(key); } return out; }
	function applyCloud(cloud) {
		var merged = mergeProgression((cloud && cloud.progression) || {}, localProgression());
		// lastInitials follows the account across devices: the cloud value wins on
		// seed so any device shows the most recently used initials.
		var _ci = cloud && cloud.progression && cloud.progression.vanguard_lastInitials;
		if (_ci != null) merged.vanguard_lastInitials = _ci;
		for (var mk in merged) { if (Object.prototype.hasOwnProperty.call(merged, mk)) { try { native(mk, merged[mk]); } catch (e) {} } }
		var pb = cloud && cloud.prefs && cloud.prefs[DEVICE];
		if (pb) { for (var pk in pb) { if (pk !== '_ts' && pk !== 'vanguard_lastInitials' && Object.prototype.hasOwnProperty.call(pb, pk) && typeof pb[pk] === 'string') { try { native(pk, pb[pk]); } catch (e) {} } } }
	}

	// 1. Seed: merge the cloud save into localStorage BEFORE the game reads it.
	if (SIGNED_IN) { try { applyCloud(CLOUD); } catch (e) {} }

	// 2. Default graphics to LOW. The game falls back to 'full' for non-touch
	//    devices; we make LOW the portal-wide default so it runs smoothly on
	//    school hardware. Only seeded when the player (or their cloud prefs)
	//    has not already chosen a graphics level, so an explicit pick wins.
	try { if (localStorage.getItem('vanguard_gfx') == null) native('vanguard_gfx', 'low'); } catch (e) {}

	// --- status widget ---
	var statusEl = null, detailEl = null;
	function fmtTime() { try { return new Date().toLocaleTimeString(); } catch (e) { return ''; } }
	function setStatus(state, detail) {
		if (!statusEl) return;
		var text = { idle: 'CLOUD', saving: 'SAVING', saved: 'SAVED', error: 'SAVE ERR', off: 'CLOUD OFF' };
		var color = { idle: '#4A7A52', saving: '#C8FF00', saved: '#00FF41', error: '#FF8C00', off: '#4A7A52' };
		statusEl.textContent = text[state] || 'CLOUD';
		statusEl.style.color = color[state] || '#4A7A52';
		if (detailEl && typeof detail === 'string') detailEl.textContent = detail;
	}

	var _retried = false;
	function doPush() {
		if (!SIGNED_IN) return;
		setStatus('saving', 'saving...');
		fetch('/api/vanguard-save', {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ deviceClass: DEVICE, snapshot: snapshot() }), keepalive: true
		}).then(function (r) {
			if (r.ok) { _retried = false; setStatus('saved', fmtTime()); return; }
			if (!_retried) { _retried = true; setStatus('saving', 'retrying...'); setTimeout(doPush, 4000); }
			else { _retried = false; setStatus('error', 'try again'); }
		})
		.catch(function () {
			if (!_retried) { _retried = true; setStatus('saving', 'retrying...'); setTimeout(doPush, 4000); }
			else { _retried = false; setStatus('error', 'offline?'); }
		});
	}

	var timer = null;
	function schedulePush() {
		if (!SIGNED_IN) return;
		if (timer) clearTimeout(timer);
		setStatus('saving', 'saving...');
		timer = setTimeout(function () { timer = null; doPush(); }, 1500);
	}

	function doRestore() {
		if (!SIGNED_IN) return;
		if (!window.confirm('Restore your cloud save? This merges your account progress into this device, then reloads.')) return;
		setStatus('saving', 'restoring...');
		fetch('/api/vanguard-save').then(function (r) { return r.json(); }).then(function (j) {
			applyCloud((j && j.data) || { progression: {}, prefs: {} });
			setStatus('saved', 'restored');
			location.reload();
		}).catch(function () { setStatus('error', 'restore failed'); });
	}

	if (SIGNED_IN) {
		try {
			localStorage.setItem = function (key, value) {
				native(key, value);
				if (typeof key === 'string' && key.indexOf(PREFIX) === 0 && DEVICE_LOCAL_KEYS.indexOf(key) === -1) schedulePush();
			};
			window.addEventListener('pagehide', function () {
				try {
					if (navigator.sendBeacon) {
						var body = new Blob([JSON.stringify({ deviceClass: DEVICE, snapshot: snapshot() })], { type: 'application/json' });
						navigator.sendBeacon('/api/vanguard-save', body);
					}
				} catch (e) {}
			});
		} catch (e) {}
	}

	function mkBtn(label, onClick) {
		var b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		b.style.cssText = 'font:inherit;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#00F0FF;background:none;border:1px solid rgba(0,240,255,0.35);border-radius:2px;padding:3px 7px;cursor:pointer;';
		b.addEventListener('click', onClick);
		return b;
	}

	function build() {
		if (document.getElementById('idea-cloud-save')) return;
		var host = document.body || document.documentElement;
		if (!host) return;

		var wrap = document.createElement('div');
		wrap.id = 'idea-cloud-save';
		wrap.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(2,10,4,0.85);border:1px solid rgba(0,255,65,0.35);border-radius:4px;font-family:"Share Tech Mono",ui-monospace,monospace;font-size:11px;letter-spacing:0.08em;color:#E8FFE8;opacity:0.9;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';

		statusEl = document.createElement('span');
		statusEl.style.cssText = 'font-weight:700;white-space:nowrap;';
		wrap.appendChild(statusEl);

		if (SIGNED_IN) {
			var tag = document.createElement('span');
			tag.textContent = DEVICE;
			tag.style.cssText = 'color:#00F0FF;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;border:1px solid rgba(0,240,255,0.3);border-radius:2px;padding:1px 4px;';
			wrap.appendChild(tag);
			detailEl = document.createElement('span');
			detailEl.style.cssText = 'color:#4A7A52;font-size:10px;white-space:nowrap;';
			wrap.appendChild(detailEl);
			wrap.appendChild(mkBtn('Back up', doPush));
			wrap.appendChild(mkBtn('Restore', doRestore));
			var hasCloud = CLOUD && CLOUD.progression && Object.keys(CLOUD.progression).length > 0;
			setStatus(hasCloud ? 'saved' : 'idle', hasCloud ? 'synced from cloud' : 'ready');
		} else {
			var link = document.createElement('a');
			link.href = '/';
			link.textContent = 'Sign in to sync';
			link.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#00FF41;text-decoration:none;border:1px solid rgba(0,255,65,0.4);border-radius:2px;padding:3px 7px;';
			wrap.appendChild(link);
			setStatus('off', '');
		}

		host.appendChild(wrap);

		// Propagate the merged progression + this device's prefs to the cloud.
		if (SIGNED_IN) schedulePush();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
	else build();
})();
</script>`;
}

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	let signedIn = false;
	let cloud: StoredSave = { v: 2, progression: {}, prefs: {} };

	if (claims) {
		signedIn = true;
		const { data } = await supabase
			.from('vanguard_saves')
			.select('data')
			.eq('user_id', claims.sub)
			.maybeSingle();
		cloud = normalizeStored(data?.data);
	}

	const html = vanguardHtml.replace('<head>', `<head>\n${injectionScript(signedIn, cloud)}`);

	return new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
