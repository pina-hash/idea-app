import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { version as buildId } from '$app/environment';
import { deploy } from 'virtual:site-versions';
import { vanguardHtml } from '$lib/legacy';
import {
	ANONYMOUS_FEEDBACK_ENDPOINT,
	FEEDBACK_CONTACT_MAX,
	FEEDBACK_KINDS,
	FEEDBACK_MAX_LEN,
	FEEDBACK_REFUSALS
} from '$lib/feedback/feedback';
import { describeBuild } from '$lib/feedback/context';
import { normalizeStored, type StoredSave } from '$lib/vanguard-save';
import { injectVersionBadge } from '$lib/version-badge';
import { isAdmin } from '$lib/server/admin';
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

/** The signed-in player's identity shown in-game (empty when signed out). */
interface PlayerProfile {
	name: string;
	avatarUrl: string;
}

/** Build the <head> bootstrap. `cloud` is the normalized v2 save (empty if signed out). */
function injectionScript(
	signedIn: boolean,
	cloud: StoredSave,
	profile: PlayerProfile,
	runStates: unknown,
	role: string | null
): string {
	const cloudJson = escapeForScript(JSON.stringify(cloud));
	const profileJson = escapeForScript(JSON.stringify(profile));
	const runStatesJson = escapeForScript(JSON.stringify(Array.isArray(runStates) ? runStates : []));

	// --- REPORT A PROBLEM: everything the injected box needs, resolved here ----
	// Every value below already exists in exactly one place in the app, so the
	// bootstrap is handed them rather than growing its own copy: the kind list
	// and the refusal wording come from $lib/feedback/feedback.ts (the same
	// strings the Svelte box shows), and the build stamp from the same
	// `describeBuild` the root layout uses, so a VANGUARD report and a notebook
	// report name the build the same way and mean the same thing by it.
	const build = describeBuild(deploy, buildId);
	const feedbackJson = escapeForScript(
		JSON.stringify({
			kinds: FEEDBACK_KINDS,
			refusals: FEEDBACK_REFUSALS,
			maxLen: FEEDBACK_MAX_LEN,
			contactMax: FEEDBACK_CONTACT_MAX,
			// Signed in goes to the authenticated route, which performs the
			// RLS-scoped insert as the caller. Signed out goes to the anonymous
			// route, unchanged. The two never swap.
			endpoint: signedIn ? '/api/vanguard-feedback' : ANONYMOUS_FEEDBACK_ENDPOINT,
			role: role ?? null,
			build: {
				value: build.value,
				source: build.source,
				means: build.means,
				historyComplete: build.complete
			}
		})
	);

	const coopUrlJson = escapeForScript(JSON.stringify(PUBLIC_SUPABASE_URL ?? ''));
	const coopKeyJson = escapeForScript(JSON.stringify(PUBLIC_SUPABASE_ANON_KEY ?? ''));

	// SEO: injected first in <head> so this <title> wins over the game's own
	// (browsers and crawlers use the first title in document order) and the
	// meta/open-graph tags give crawlers a description of the public page.
	const seoHead = `<title>IDEA // VANGUARD | Bosco Tech</title>
<meta name="description" content="Browser-based arcade shoot-em-up built by the IDEA pathway at Don Bosco Technical Institute. Pilot the IDEA ship against five rival factions." />
<meta property="og:title" content="IDEA // VANGUARD | Bosco Tech" />
<meta property="og:description" content="Browser-based arcade shoot-em-up built by the IDEA pathway at Don Bosco Technical Institute. Pilot the IDEA ship against five rival factions." />
<meta property="og:url" content="https://ideabosco.com/vanguard/" />
<meta property="og:type" content="website" />
`;

	return `${seoHead}<script>
(function () {
	var SIGNED_IN = ${signedIn ? 'true' : 'false'};
	var CLOUD = ${cloudJson};
	var PROFILE = ${profileJson};
	// --- CO-OP (Phase 1): Supabase Realtime access for the game -----------------
	// The game is served as raw HTML outside the SvelteKit component tree, so it
	// cannot reach the app's browser client. We hand it the PUBLIC url/anon key
	// (both already shipped in the app bundle; broadcast channels need no auth,
	// so co-op never requires sign-in) plus a lazy loader that pulls the
	// supabase-js UMD build from CDN only when the player actually opens CO-OP.
	// The game consumes this as window.__ideaCoop.load() -> Promise<SupabaseClient>.
	window.__ideaCoopName = (PROFILE && PROFILE.name) || '';
	window.__ideaCoop = (function () {
		var URL_ = ${coopUrlJson}, KEY_ = ${coopKeyJson};
		var clientP = null;
		function load() {
			if (clientP) return clientP;
			clientP = new Promise(function (resolve, reject) {
				if (!URL_ || !KEY_) { reject(new Error('co-op is not configured')); return; }
				function make() {
					try { resolve(window.supabase.createClient(URL_, KEY_)); }
					catch (e) { reject(e); }
				}
				if (window.supabase && window.supabase.createClient) { make(); return; }
				var s = document.createElement('script');
				s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
				s.async = true;
				s.onload = make;
				s.onerror = function () { clientP = null; reject(new Error('could not load the realtime client')); };
				document.head.appendChild(s);
			});
			return clientP;
		}
		return { load: load };
	})();
	// Cross-device run resume (0032/0037): the saved in-progress runs, one per
	// game mode. Exposed to the game so its title screen renders a per-mode RESUME
	// card and calls __ideaRestoreRun with the chosen mode's snapshot. Always set
	// (empty when signed out) so the game can read it unconditionally.
	var RUNSTATES = ${runStatesJson};
	window.__ideaRunStates = Array.isArray(RUNSTATES) ? RUNSTATES : [];
	var PREFIX = 'vanguard_';
	var native = localStorage.setItem.bind(localStorage);

	// --- merge logic (keep aligned with src/lib/vanguard-save.ts) ---
	var PROGRESSION_KEYS = ['vanguard_build', 'vanguard_scores', 'vanguard_games', 'vanguard_tutdone', 'vanguard_lastInitials', 'vanguard_ach', 'vanguard_ach_best', 'vanguard_ach_title'];
	var DEVICE_LOCAL_KEYS = ['vanguard_did'];
	function num(v) { var n = v === true ? 1 : v === false ? 0 : Number(v); return isFinite(n) ? n : 0; }
	function parseObj(s) { if (typeof s !== 'string') return null; try { var v = JSON.parse(s); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; } catch (e) { return null; } }
	// Latest-wins on the WHOLE build (no max-union, which ratcheted over-budget
	// builds up across devices): greater _bts recency marker (missing = oldest),
	// then greater spent, then keep a. Byte-identical to mergeBuild in vanguard-save.ts.
	function mergeBuild(as, bs) {
		var a = parseObj(as), b = parseObj(bs);
		if (!a) return bs; if (!b) return as;
		var aTs = num(a._bts), bTs = num(b._bts), pick;
		if (aTs !== bTs) pick = aTs > bTs ? a : b;
		else if (num(a.spent) !== num(b.spent)) pick = num(a.spent) > num(b.spent) ? a : b;
		else pick = a;
		return JSON.stringify({
			up: pick.up, unlocked: pick.unlocked, heavyUnlocked: pick.heavyUnlocked,
			bombs: pick.bombs, shieldHits: pick.shieldHits, spent: pick.spent,
			drone: !!pick.drone, heavy: pick.heavy, wtype: pick.wtype, _bts: pick._bts
		});
	}
	function parseScores(s) { if (typeof s !== 'string') return []; try { var v = JSON.parse(s); if (!Array.isArray(v)) return []; return v.filter(function (e) { return e && typeof e === 'object' && typeof e.score === 'number'; }).map(function (e) { return { name: String(e.name == null ? '' : e.name), score: Number(e.score) }; }); } catch (e) { return []; } }
	function mergeScores(as, bs) { if (as == null && bs == null) return undefined; var all = parseScores(as).concat(parseScores(bs)).sort(function (x, y) { return y.score - x.score; }); var seen = {}, out = []; for (var i = 0; i < all.length; i++) { var e = all[i], key = e.name + '|' + e.score; if (seen[key]) continue; seen[key] = 1; out.push(e); if (out.length >= 10) break; } return JSON.stringify(out); }
	// Achievements. Union of unlocked ids (never an overwrite), per-field max on
	// the flat bests object. Behaviourally identical to mergeAch / mergeAchBest /
	// earlierStamp in vanguard-save.ts; see those for why each walk is what it is.
	function earlierStamp(av, bv) { var an = num(av), bn = num(bv); if (an > 0 && bn > 0) return an <= bn ? av : bv; if (an > 0) return av; if (bn > 0) return bv; return av; }
	function mergeAch(as, bs) {
		if (as == null && bs == null) return undefined;
		var a = parseObj(as) || {}, b = parseObj(bs) || {}, out = {}, k;
		for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k]; }
		for (k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = Object.prototype.hasOwnProperty.call(out, k) ? earlierStamp(out[k], b[k]) : b[k]; }
		return JSON.stringify(out);
	}
	function mergeAchBest(as, bs) {
		if (as == null && bs == null) return undefined;
		var a = parseObj(as) || {}, b = parseObj(bs) || {}, out = {}, keys = Object.keys(a).concat(Object.keys(b));
		for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (Object.prototype.hasOwnProperty.call(out, k)) continue; out[k] = Math.max(num(a[k]), num(b[k])); }
		return JSON.stringify(out);
	}
	function mergeProgression(a, b) {
		a = a || {}; b = b || {}; var out = {};
		var build = mergeBuild(a.vanguard_build, b.vanguard_build); if (build != null) out.vanguard_build = build;
		var sc = mergeScores(a.vanguard_scores, b.vanguard_scores); if (sc != null) out.vanguard_scores = sc;
		if (a.vanguard_games != null || b.vanguard_games != null) out.vanguard_games = String(Math.max(num(a.vanguard_games), num(b.vanguard_games)));
		if (a.vanguard_tutdone === '1' || b.vanguard_tutdone === '1') out.vanguard_tutdone = '1';
		else if (a.vanguard_tutdone != null || b.vanguard_tutdone != null) out.vanguard_tutdone = (a.vanguard_tutdone != null ? a.vanguard_tutdone : b.vanguard_tutdone);
		if (b.vanguard_lastInitials != null || a.vanguard_lastInitials != null) out.vanguard_lastInitials = (b.vanguard_lastInitials != null ? b.vanguard_lastInitials : a.vanguard_lastInitials);
		var ach = mergeAch(a.vanguard_ach, b.vanguard_ach); if (ach != null) out.vanguard_ach = ach;
		var achBest = mergeAchBest(a.vanguard_ach_best, b.vanguard_ach_best); if (achBest != null) out.vanguard_ach_best = achBest;
		if (b.vanguard_ach_title != null || a.vanguard_ach_title != null) out.vanguard_ach_title = (b.vanguard_ach_title != null ? b.vanguard_ach_title : a.vanguard_ach_title);
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
		// The worn title follows the same rule for the same reason: without this,
		// mergeProgression's last-writer wins would hand the seed back to whatever
		// this device happens to hold and a title chosen on another device would
		// never arrive. The badge itself is unioned above, so a title seeded here
		// is one this account has really earned.
		var _ct = cloud && cloud.progression && cloud.progression.vanguard_ach_title;
		if (_ct != null) merged.vanguard_ach_title = _ct;
		for (var mk in merged) { if (Object.prototype.hasOwnProperty.call(merged, mk)) { try { native(mk, merged[mk]); } catch (e) {} } }
		var pb = cloud && cloud.prefs && cloud.prefs[DEVICE];
		// A pref bucket may still hold keys that have since become PROGRESSION (the
		// three achievement keys, lastInitials): applied here they would overwrite
		// the merged value that was just seeded, since this loop runs second. Skip
		// every progression key rather than naming them one at a time -- the server
		// folds those stale copies into progression on the next push.
		if (pb) { for (var pk in pb) { if (pk !== '_ts' && PROGRESSION_KEYS.indexOf(pk) === -1 && Object.prototype.hasOwnProperty.call(pb, pk) && typeof pb[pk] === 'string') { try { native(pk, pb[pk]); } catch (e) {} } } }
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

	// Run history: signed-in players append one row per finished run. The game
	// calls window.__ideaRecordRun(summary); we keep the injection the sole owner
	// of cloud I/O. Fire-and-forget, swallow errors. Left undefined when signed
	// out so the game's optional call no-ops.
	if (SIGNED_IN) {
		window.__ideaRecordRun = function (summary) {
			try {
				fetch('/api/vanguard-run', {
					method: 'POST', headers: { 'content-type': 'application/json' },
					body: JSON.stringify(summary || {}), keepalive: true
				}).catch(function () {});
			} catch (e) {}
		};
		// Read history for the in-game overlay. Resolves to { runs, summary };
		// never throws into game code (errors normalize to an empty result).
		window.__ideaGetHistory = function () {
			return fetch('/api/vanguard-run', { headers: { 'accept': 'application/json' } })
				.then(function (r) { if (!r.ok) throw new Error('history ' + r.status); return r.json(); })
				.then(function (j) { return { runs: (j && j.runs) || [], summary: (j && j.summary) || null }; })
				.catch(function () { return { runs: [], summary: null }; });
		};
		// Cross-device run checkpoint (0032/0037). The game calls these at a sector
		// boundary (save) and at run end (clear); we persist / clear the minimal
		// snapshot the game captures, PER MODE. Fire-and-forget, errors swallowed.
		var RANKABLE = { normal: 1, hardcore: 1 };
		function upsertRunState(snap) {
			var list = window.__ideaRunStates || (window.__ideaRunStates = []);
			for (var i = 0; i < list.length; i++) {
				if (list[i] && list[i].gameMode === snap.gameMode) { list[i] = snap; return; }
			}
			list.push(snap);
		}
		function dropRunState(mode) {
			var list = window.__ideaRunStates || [];
			var out = [];
			for (var i = 0; i < list.length; i++) { if (!(list[i] && list[i].gameMode === mode)) out.push(list[i]); }
			window.__ideaRunStates = out;
		}
		// opts.beacon: called from the page-leave flush. A keepalive fetch can be
		// dropped mid-navigation, so send via navigator.sendBeacon (which survives
		// unload) as an application/json Blob. Same snapshot JSON either way, so the
		// API still derives the mode from snapshot.gameMode. Falls back to fetch if
		// the beacon is unavailable or refused.
		window.__ideaVanguardSaveCheckpoint = function (opts) {
			try {
				var snap = window.__ideaCaptureRun && window.__ideaCaptureRun();
				if (!snap || !RANKABLE[snap.gameMode]) return;
				upsertRunState(snap);
				var body = JSON.stringify(snap);
				if (opts && opts.beacon && navigator.sendBeacon) {
					try {
						var blob = new Blob([body], { type: 'application/json' });
						if (navigator.sendBeacon('/api/vanguard-run-state', blob)) return;
					} catch (e) {}
				}
				fetch('/api/vanguard-run-state', {
					method: 'POST', headers: { 'content-type': 'application/json' },
					body: body, keepalive: true
				}).catch(function () {});
			} catch (e) {}
		};
		// Clears only the given mode's checkpoint, so a HARDCORE death never wipes
		// a saved NORMAL run and vice versa. The game threads its gameMode through.
		window.__ideaVanguardClearCheckpoint = function (mode) {
			try {
				if (!RANKABLE[mode]) return;
				dropRunState(mode);
				if (typeof window.__ideaRenderResumeCards === 'function') {
					try { window.__ideaRenderResumeCards(); } catch (e) {}
				}
				fetch('/api/vanguard-run-state?mode=' + encodeURIComponent(mode), { method: 'DELETE', keepalive: true }).catch(function () {});
			} catch (e) {}
		};
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

	// --- REPORT A PROBLEM -------------------------------------------------------
	// The shell mounts the portal's report control on Svelte layouts. VANGUARD
	// renders none, so until now the one surface a class spends a whole period
	// inside was the one surface with no way to say anything about it. Injected
	// here, at serve time, for the same reason the cloud save is: the game file
	// on disk is never modified.
	//
	// IT DOES NOT COMPETE FOR INPUT, AND IT ADDS NO GLOBAL LISTENER. The game
	// already knows what a modal is: stage's pointerdown, mousedown and wheel
	// handlers all bail on '.fbovl', and 'typingInField()' bails the global
	// keydown handler on '.fbinline'. The panel wears the first class and the
	// text fields wear the second, so the game's OWN handlers stand down -- the
	// same way its in-game composer is left alone -- instead of a second listener
	// racing them for the same events.
	var FB = ${feedbackJson};
	var fbPanel = null, fbText = null, fbContact = null, fbSendBtn = null, fbStatusEl = null;
	var fbKind = 'bug', fbMetaCaptured = {}, fbSending = false;

	function fbWords(reason) {
		return FB.refusals[reason] || ('The server refused that report (' + reason + ').');
	}
	// What the game is doing right now. __ideaGameInfo is injected beside the
	// game's own VERSION constant (see the GET handler): the game body is one
	// IIFE, so VERSION, gameMode and sector are closure-scoped and unreachable
	// from out here without it. Absent for any reason, the report still files --
	// with those three fields null rather than with nothing.
	function fbGame() {
		try { return (typeof window.__ideaGameInfo === 'function' && window.__ideaGameInfo()) || {}; }
		catch (e) { return {}; }
	}
	// The captureMeta fields, assembled the same way and read off the page at the
	// moment the box OPENS. A field a person has to fill in is a field that
	// arrives empty, so nothing here is asked for.
	//
	// surface NAMES WHICH CONTROL PRODUCED THE ROW, and both callers pass one:
	// this page carries TWO ways to report (the injected panel, and the game's own
	// composer on the title/pause/game-over screens), they file into the same
	// table, and a row that does not say which it came from cannot be traced back
	// to the control that needs fixing. Neither is the unlabelled default.
	function fbMeta(surface) {
		var g = fbGame(), vp = null, ua = null;
		try { vp = window.innerWidth + 'x' + window.innerHeight; } catch (e) {}
		try { ua = (navigator.userAgent || '').trim() || null; } catch (e) {}
		return {
			route: '/vanguard',
			surface: surface,
			path: (location && location.pathname) || '/vanguard/',
			role: FB.role,
			section: null,
			viewport: vp,
			userAgent: ua,
			at: new Date().toISOString(),
			build: FB.build,
			// The three the game knows and the portal cannot: which build of the
			// GAME (not of the site), which mode is being played, and how far in.
			gameVersion: g.version == null ? null : String(g.version),
			mode: g.mode == null ? null : String(g.mode),
			sector: typeof g.sector === 'number' ? g.sector : null,
			screen: g.state == null ? null : String(g.state)
		};
	}

	function fbSetStatus(text, bad) {
		if (!fbStatusEl) return;
		fbStatusEl.textContent = text || '';
		fbStatusEl.style.color = bad ? '#FF8C00' : '#4A7A52';
	}

	function fbField(placeholder, maxLen, rows) {
		var t = document.createElement('textarea');
		// 'fbinline' is the game's own marker for "somebody is typing in this":
		// typingInField() reads it and the global keydown handler stands down, so
		// a W in a sentence never steers the ship.
		t.className = 'fbinline';
		t.rows = rows;
		t.maxLength = maxLen;
		t.placeholder = placeholder;
		t.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;font:inherit;font-size:12px;line-height:1.4;color:#E8FFE8;background:rgba(0,20,6,0.9);border:1px solid rgba(0,255,65,0.3);border-radius:3px;padding:7px 9px;';
		t.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		t.addEventListener('keydown', function (e) { e.stopPropagation(); });
		t.addEventListener('keyup', function (e) { e.stopPropagation(); });
		return t;
	}

	function fbClose() {
		if (fbPanel) fbPanel.style.display = 'none';
	}

	function fbSend() {
		if (fbSending) return;
		var msg = ((fbText && fbText.value) || '').trim();
		if (!msg) { fbSetStatus('Write a little about what you noticed.', true); return; }
		if (msg.length > FB.maxLen) { fbSetStatus(fbWords('message_too_long'), true); return; }
		var contact = ((fbContact && fbContact.value) || '').trim();
		if (contact.length > FB.contactMax) { fbSetStatus(fbWords('contact_too_long'), true); return; }

		var payload = {
			app: 'vanguard',
			context: '/vanguard',
			kind: fbKind,
			message: msg,
			meta: fbMetaCaptured
		};
		// Only the anonymous path has anywhere to put this, and only it asks.
		if (!SIGNED_IN) payload.contact = contact || null;

		fbSending = true;
		if (fbSendBtn) fbSendBtn.disabled = true;
		fbSetStatus('Sending...', false);
		fetch(FB.endpoint, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		}).then(function (r) {
			return r.json().then(function (j) { return { ok: r.ok, body: j }; },
				function () { return { ok: r.ok, body: null }; });
		}).then(function (res) {
			fbSending = false;
			if (fbSendBtn) fbSendBtn.disabled = false;
			var b = res.body || {};
			if (res.ok && b.ok === true) {
				if (fbText) fbText.value = '';
				if (fbContact) fbContact.value = '';
				fbSetStatus('Sent. Thank you.', false);
				setTimeout(fbClose, 1200);
				return;
			}
			// A 'reason' means the far side CONSIDERED this and said no, so it is
			// reported once in the words that reason has, rather than re-sent. No
			// reason at all is the only outcome sending again can fix.
			var reason = typeof b.reason === 'string' ? b.reason.trim() : '';
			if (reason) fbSetStatus(fbWords(reason), true);
			else fbSetStatus('That did not send. It can be re-sent.', true);
		}).catch(function () {
			fbSending = false;
			if (fbSendBtn) fbSendBtn.disabled = false;
			fbSetStatus('That did not send. Check your connection.', true);
		});
	}

	function fbBuildPanel() {
		if (fbPanel) return fbPanel;
		var host = document.body || document.documentElement;
		if (!host) return null;

		var panel = document.createElement('div');
		// '.fbovl' is what the game's pointer, mouse and wheel handlers already
		// look for before they touch gameplay. The inline styles below win over
		// the class's own rules, so borrowing the marker costs no layout.
		panel.className = 'fbovl';
		panel.id = 'idea-vanguard-feedback';
		panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,10,4,0.82);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font-family:"Share Tech Mono",ui-monospace,monospace;';

		var card = document.createElement('div');
		card.style.cssText = 'width:100%;max-width:420px;max-height:86vh;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:14px 16px;background:rgba(2,10,4,0.97);border:1px solid rgba(0,255,65,0.35);border-radius:6px;color:#E8FFE8;box-shadow:0 10px 40px rgba(0,0,0,0.6);';

		var head = document.createElement('div');
		head.textContent = 'REPORT A PROBLEM';
		head.style.cssText = 'font-size:12px;font-weight:700;letter-spacing:0.12em;color:#00FF41;text-shadow:0 0 8px rgba(0,255,65,0.4);';
		card.appendChild(head);

		var note = document.createElement('div');
		note.textContent = SIGNED_IN
			? 'Something confusing, broken, or missing? Where you are in the game, your browser and the build are attached automatically.'
			: 'Something confusing, broken, or missing? You are not signed in, so this report carries no name. Where you are in the game, your browser and the build are attached automatically.';
		note.style.cssText = 'font-size:11px;line-height:1.45;color:#9FB8A6;';
		card.appendChild(note);

		var kinds = document.createElement('div');
		kinds.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
		var kindBtns = [];
		function paintKinds() {
			for (var i = 0; i < kindBtns.length; i++) {
				var on = kindBtns[i].getAttribute('data-kind') === fbKind;
				kindBtns[i].style.background = on ? 'rgba(0,240,255,0.18)' : 'none';
				kindBtns[i].style.color = on ? '#00F0FF' : '#9FB8A6';
				kindBtns[i].style.borderColor = on ? 'rgba(0,240,255,0.7)' : 'rgba(0,240,255,0.25)';
			}
		}
		for (var ki = 0; ki < FB.kinds.length; ki++) {
			(function (k) {
				var b = document.createElement('button');
				b.type = 'button';
				b.textContent = k.label;
				b.title = k.hint;
				b.setAttribute('data-kind', k.id);
				b.style.cssText = 'font:inherit;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(0,240,255,0.25);border-radius:2px;padding:4px 9px;cursor:pointer;';
				b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
				b.addEventListener('click', function (e) { e.stopPropagation(); fbKind = k.id; paintKinds(); });
				kindBtns.push(b);
				kinds.appendChild(b);
			})(FB.kinds[ki]);
		}
		paintKinds();
		card.appendChild(kinds);

		fbText = fbField('What happened?', FB.maxLen, 4);
		card.appendChild(fbText);

		if (!SIGNED_IN) {
			var cLabel = document.createElement('div');
			cLabel.textContent = 'A way to reach you (optional)';
			cLabel.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#4A7A52;';
			card.appendChild(cLabel);
			fbContact = fbField('An email, a first name, or when to ask you', FB.contactMax, 1);
			card.appendChild(fbContact);
		}

		fbStatusEl = document.createElement('div');
		fbStatusEl.style.cssText = 'font-size:11px;line-height:1.4;color:#4A7A52;min-height:15px;';
		card.appendChild(fbStatusEl);

		var row = document.createElement('div');
		row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
		var cancel = mkBtn('Close', function (e) { e.stopPropagation(); fbClose(); });
		cancel.style.color = '#9FB8A6';
		cancel.style.borderColor = 'rgba(159,184,166,0.35)';
		cancel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		fbSendBtn = mkBtn('Send', function (e) { e.stopPropagation(); fbSend(); });
		fbSendBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		row.appendChild(cancel);
		row.appendChild(fbSendBtn);
		card.appendChild(row);

		// Clicks inside the card are the card's; a click on the backdrop closes,
		// and neither ever reaches the game (the panel is a '.fbovl').
		card.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); fbClose(); });

		panel.appendChild(card);
		host.appendChild(panel);
		fbPanel = panel;
		return panel;
	}

	function fbOpen() {
		var panel = fbBuildPanel();
		if (!panel) return;
		fbMetaCaptured = fbMeta('report-panel');
		fbSetStatus('', false);
		panel.style.display = 'flex';
		// Focus lands in the field immediately: the game's typingInField() gate
		// keys off the FOCUSED element, so this is what keeps a sentence from
		// being read as movement while the box is open.
		try { if (fbText) fbText.focus(); } catch (e) {}
	}

	// --- THE GAME'S OWN COMPOSER, POINTED AT THE SAME PLACE --------------------
	// The game carries an older "Bug or idea?" composer of its own on the title,
	// pause and game-over screens (buildFeedbackComposer). It fired an <img> GET
	// at VANGUARD's Apps Script backend, which nobody reads, and an <img> GET
	// cannot report a failure -- so it painted "THANKS!" unconditionally and a
	// student got the same answer whether the message arrived or vanished.
	//
	// The composer STAYS. What is redirected is the one call: it reaches this
	// hook now, and this hook posts to FB.endpoint -- the SAME endpoint the
	// injected panel resolved server-side, signed-in or anonymous by the session,
	// decided once in the GET handler and not re-decided here. Whether two
	// controls offering the same thing is one too many is a question for later;
	// one of them writing where nobody reads is the defect.
	//
	// THE APPS SCRIPT ENDPOINT IS NOT REMOVED. API_URL still carries the
	// leaderboard and the run telemetry; only the composer's send moves.
	//
	// IT REPORTS INTO THE GAME'S OWN TWO ELEMENTS -- the SEND button and the
	// character counter beside it -- so it adds no DOM, no listener and no second
	// idea of what the composer looks like. The counter is 9px and dim by its
	// class, which is right for a count and unreadable as a refusal, so a message
	// overrides both inline and the override is undone when the count comes back.
	function vgcSay(cnt, text, bad) {
		if (!cnt) return;
		cnt.textContent = text;
		cnt.style.color = bad ? '#FF8C00' : '#4A7A52';
		cnt.style.fontSize = '10px';
		cnt.style.textAlign = 'left';
	}
	function vgcCount(cnt, n) {
		if (!cnt) return;
		cnt.textContent = n + ' / 500';
		cnt.style.color = '';
		cnt.style.fontSize = '';
		cnt.style.textAlign = '';
	}
	window.__ideaVanguardReport = function (text, initials, ta, cnt, btn, grow) {
		var msg = String(text == null ? '' : text).trim();
		if (!msg) return;
		if (btn) { btn.disabled = true; btn.textContent = 'SENDING'; }
		vgcSay(cnt, 'Sending...', false);

		// The same capture the panel files, from the same function, so a report
		// from here is not a second-class row missing the fields that make one
		// actionable. surface is what tells the two apart.
		var meta = fbMeta('in-game-composer');
		// THE ONE THING THIS COMPOSER KNOWS AND THE PANEL DOES NOT: the initials
		// on the leaderboard row. It goes in meta, which is the free-form
		// context blob every surface attaches to -- there is no column for it and
		// none is invented. IT IS NOT AN IDENTITY: three characters a player typed
		// into a scoreboard, unverified, self-chosen and re-typed every run, so
		// nothing may read it as who somebody is.
		meta.initials = initials ? String(initials).slice(0, 8) : null;

		function done(ok, words) {
			if (btn) { btn.disabled = false; btn.textContent = ok ? 'THANKS!' : 'RETRY'; }
			// A FAILED SEND KEEPS THE WRITING. Clearing the box on the way out is
			// what made the old path unrecoverable: the words were gone and the
			// button said thank you. Only a confirmed landing clears it.
			if (ok && ta) { ta.value = ''; if (typeof grow === 'function') { try { grow(); } catch (e) {} } }
			vgcSay(cnt, words, !ok);
			// A refusal stays up long enough to be read and acted on; an
			// acknowledgement does not need to.
			setTimeout(function () {
				if (btn) btn.textContent = 'SEND';
				vgcCount(cnt, (ta && ta.value) ? ta.value.length : 0);
			}, ok ? 1800 : 6000);
		}

		fetch(FB.endpoint, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				app: 'vanguard',
				context: '/vanguard',
				// The composer is deliberately ONE channel with no dropdown ("Bug or
				// idea? Tell us"), so nobody chose a kind and this must not guess
				// one. 'other' is the catch-all, and meta.surface says why it is
				// uninformative here rather than leaving a reader to wonder.
				kind: 'other',
				message: msg.slice(0, FB.maxLen),
				meta: meta
			})
		}).then(function (r) {
			return r.json().then(function (j) { return { ok: r.ok, body: j }; },
				function () { return { ok: r.ok, body: null }; });
		}).then(function (res) {
			var b = res.body || {};
			if (res.ok && b.ok === true) { done(true, 'Sent. Thank you.'); return; }
			// Same contract the panel reads, in the same words: a 'reason' means the
			// far side CONSIDERED this and said no, so it is reported once rather
			// than re-sent, and fbWords is the one refusal vocabulary.
			var reason = typeof b.reason === 'string' ? b.reason.trim() : '';
			done(false, reason ? fbWords(reason) : 'That did not send. Your message is still here, press SEND to try again.');
		}).catch(function () {
			done(false, 'That did not send. Check your connection, then press SEND again.');
		});
	};

	// --- top nav: return to the IDEA home page + signed-in identity, so a player
	//     can leave the game and confirm their account. Matches the IDEA green /
	//     cyan Share Tech Mono chrome; fixed top-right, above the game canvas.
	function buildNav() {
		if (document.getElementById('idea-vanguard-nav')) return;
		var host = document.body || document.documentElement;
		if (!host) return;

		var nav = document.createElement('div');
		nav.id = 'idea-vanguard-nav';
		nav.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(2,10,4,0.82);border:1px solid rgba(0,255,65,0.3);border-radius:4px;font-family:"Share Tech Mono",ui-monospace,monospace;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';

		// (The old top-right "Resume S{n}" button is retired: the resume entry point
		// now lives on the game's own title screen as a per-mode RESUME card, 0037.)

		var home = document.createElement('a');
		home.href = '/';
		home.textContent = '\\u2039 IDEA';
		home.title = 'Back to the IDEA home page';
		home.style.cssText = 'font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#00FF41;text-decoration:none;text-shadow:0 0 8px rgba(0,255,65,0.5);white-space:nowrap;';
		nav.appendChild(home);

		if (SIGNED_IN && PROFILE && PROFILE.name) {
			var sep = document.createElement('span');
			sep.style.cssText = 'width:1px;height:14px;background:rgba(0,255,65,0.25);';
			nav.appendChild(sep);

			var chip = document.createElement('span');
			chip.style.cssText = 'display:flex;align-items:center;gap:6px;';

			if (PROFILE.avatarUrl) {
				var img = document.createElement('img');
				img.src = PROFILE.avatarUrl;
				img.alt = '';
				img.referrerPolicy = 'no-referrer';
				img.style.cssText = 'width:20px;height:20px;border-radius:50%;object-fit:cover;border:1px solid rgba(0,240,255,0.4);';
				chip.appendChild(img);
			} else {
				var dot = document.createElement('span');
				dot.textContent = (PROFILE.name.charAt(0) || '?').toUpperCase();
				dot.style.cssText = 'width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:rgba(0,240,255,0.12);border:1px solid rgba(0,240,255,0.4);color:#00F0FF;font-size:10px;font-weight:700;';
				chip.appendChild(dot);
			}
			var nm = document.createElement('span');
			nm.textContent = PROFILE.name;
			nm.style.cssText = 'font-size:11px;color:#E8FFE8;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
			chip.appendChild(nm);
			nav.appendChild(chip);
		} else {
			var link = document.createElement('a');
			link.href = '/';
			link.textContent = 'Sign in';
			link.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#00F0FF;text-decoration:none;border:1px solid rgba(0,240,255,0.35);border-radius:2px;padding:2px 6px;';
			nav.appendChild(link);
		}

		// The report affordance, in the chrome this endpoint already owns rather
		// than floating a second control of its own. It sits beside the way out of
		// the game for the same reason the home link does: it is the portal's
		// furniture, not the game's, and a player looking for either looks here.
		var fbSep = document.createElement('span');
		fbSep.style.cssText = 'width:1px;height:14px;background:rgba(0,255,65,0.25);';
		nav.appendChild(fbSep);
		var report = mkBtn('Report', function (e) { e.stopPropagation(); fbOpen(); });
		report.title = 'Report a problem with VANGUARD';
		// The nav is a sibling of the game's stage, so this never reaches its
		// handlers -- stopped here anyway, the way every button in the game does.
		report.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
		nav.appendChild(report);

		host.appendChild(nav);
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

	function init() { buildNav(); build(); }
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
</script>`;
}

/**
 * THE REWRITES EVERY VISITOR GETS, AS DATA -- the second table, and the reason
 * there are two.
 *
 * `_NON_ADMIN_STRIPS` below is applied inside `if (!isAdminUser)`. These are
 * applied to EVERYONE, admin included, because neither is a gate: one hands the
 * page a reader for three values the game keeps closure-scoped, and one points
 * the game's own feedback composer at the portal's feedback table. An entry that
 * belonged in the strip table would leave an admin's copy writing to the place
 * this bundle exists to stop writing to.
 *
 * IT IS A TABLE FOR THE REASON THE STRIP TABLE IS ONE: a replace whose anchor
 * has drifted is a SILENT NO-OP, and `String.prototype.replace` neither throws
 * nor reports a miss. `__ideaGameInfo` was an inline `.replace()` here until this
 * bundle -- a second implementation of "rewrite the served bytes for everyone",
 * sitting beside a table built for exactly that -- so it is an entry now.
 *
 * A REWRITE PROVES IT FIRED BY ITS `marker`, NOT BY ITS ANCHOR'S ABSENCE, WHICH
 * IS WHERE THE TWO TABLES DIVERGE. A strip removes, so a surviving anchor is the
 * failure. A rewrite may APPEND (`__ideaGameInfo` keeps the `const VERSION` line
 * it is bolted onto), so the anchor is still there afterwards and its presence
 * says nothing at all. Each entry therefore names a string its replacement
 * introduces and the raw build does not contain; `tests/vanguard-universal-rewrites.test.ts`
 * walks THIS list and asserts the anchor matches the build exactly once, the
 * marker is absent from the build (the positive control, so the next assertion
 * cannot pass vacuously) and the marker reaches the served page exactly once for
 * an admin, a student and a signed-out visitor alike.
 *
 * ORDER IS NOT SIGNIFICANT, and neither table's anchors lie inside the other's:
 * the composer is around line 5890 of the build and both stripped blocks start
 * past 8000.
 */
interface VanguardRewrite {
	/** Stable identifier. A failing assertion names this, never a line number. */
	name: string;
	/** Anchor in the raw build. Never global: each must match exactly once. */
	find: string | RegExp;
	replace: string;
	/**
	 * A string the replacement introduces that the raw build does not contain.
	 * This is the whole proof the rewrite fired, so it must not be a substring of
	 * anything already in the file.
	 */
	marker: string;
}

export const _UNIVERSAL_REWRITES: readonly VanguardRewrite[] = [
	// WHAT THE GAME KNOWS AND THE PAGE CANNOT ASK IT.
	//
	// The whole game body is one IIFE, so VERSION, gameMode and sector are
	// closure-scoped: nothing outside can read them, and a report that had to
	// leave them out would be a report that cannot say which build of the game
	// broke or where in a run it happened. This adds a reader for exactly those
	// three (plus which screen is up) beside the declaration of the first.
	//
	// It reads, and it is the only thing it does. No setter, no game function is
	// exposed, so nothing here can change what a run does.
	{
		name: 'gameInfoReader',
		find: /const VERSION='(\d+)';/,
		replace:
			"$& window.__ideaGameInfo=function(){ try{ return { version:VERSION, mode:gameMode, sector:sector, state:state }; }catch(e){ return { version:VERSION, mode:null, sector:null, state:null }; } };",
		marker: 'window.__ideaGameInfo=function()'
	},
	// THE IN-GAME COMPOSER'S SEND, REDIRECTED OFF APPS SCRIPT.
	//
	// THE ANCHOR SPANS FOUR LINES ON PURPOSE, AND TAKING ONLY THE `new Image()`
	// LINE WOULD HAVE MISSED THE POINT OF THE CHANGE. The three lines after it
	// clear the box and paint "THANKS!" UNCONDITIONALLY -- outside the
	// `if(API_URL)`, so they ran even when there was no endpoint to send to at
	// all. Redirecting the request and leaving those behind would produce a
	// composer that still thanks a student for a message it just failed to send,
	// which is the exact defect, one layer in.
	//
	// So the whole optimistic block is replaced by one call, and the hook the
	// injection defines owns the outcome: the box is cleared only on a confirmed
	// landing, a refusal is spoken in the shared vocabulary, and a failure leaves
	// the writing where the student can press SEND again.
	{
		name: 'composerSend',
		find: /if\(API_URL\)\{ try\{ new Image\(\)\.src=API_URL\+'\?action=feedback[\s\S]*?setTimeout\(\(\)=>\{ btn\.textContent='SEND'; btn\.disabled=false; \},1400\);/,
		// The guard is a can't-happen: the bootstrap is injected into <head>
		// unconditionally and defines the hook synchronously, well before any
		// click. It is here so that if it ever DID happen the composer says the
		// message did not send and keeps it, rather than throwing inside a click
		// handler and looking like a dead button.
		replace:
			"if(window.__ideaVanguardReport){ window.__ideaVanguardReport(txt,curInitials,ta,cnt,btn,grow); } else { cnt.textContent='Reporting is unavailable here. Your message was not sent.'; }",
		marker: 'window.__ideaVanguardReport(txt,curInitials,ta,cnt,btn,grow)'
	}
];

/** Apply every rewrite in `_UNIVERSAL_REWRITES`, in order. */
export function _rewriteForEveryone(html: string): string {
	for (const rw of _UNIVERSAL_REWRITES) html = html.replace(rw.find, rw.replace);
	return html;
}

/**
 * THE NON-ADMIN GATE, AS DATA. Each entry is one edit made to the served bytes
 * of the legacy build before a non-admin receives them.
 *
 * IT IS A TABLE RATHER THAN A CHAIN OF `.replace()` CALLS FOR ONE REASON: a
 * replace whose anchor has drifted is a SILENT NO-OP. `String.prototype.replace`
 * neither throws nor reports a miss, so a rename or a formatting pass inside
 * `index.html` turns a gate off while the handler still answers 200 with a page
 * that looks exactly right, and nobody looks again. Written inline, each anchor
 * was visible only to a person reading this file; written as a table with a
 * `name`, `tests/vanguard-admin-gate.test.ts` walks the REAL list -- not a copy
 * of it -- and asserts of every entry that its anchor matches the current build
 * EXACTLY ONCE and is gone from the output. A strip added here later is covered
 * the moment it is added, and cannot ship untested.
 *
 * THE STRIPS REMOVE, THEY DO NOT DISABLE, and the two are not the same gate.
 * The game's own dev affordances are held shut at runtime by `gameMode==='dev'`
 * -- a client-side test, of a client-side variable, in a page the client owns.
 * That is a guard against a mistake, not against a person, and VANGUARD posts to
 * a ranked leaderboard. So the bytes are not there.
 *
 * ORDER IS NOT SIGNIFICANT: no entry's anchor lies inside another's match. The
 * dev-console slice ends on the last line before the TUNE panel's own header,
 * and the two mode-select anchors sit ~2,200 lines above both.
 */
interface VanguardStrip {
	/** Stable identifier. A failing assertion names this, never a line number. */
	name: string;
	/** Anchor in the raw build. Never global: each must match exactly once. */
	find: string | RegExp;
	replace: string;
}

export const _NON_ADMIN_STRIPS: readonly VanguardStrip[] = [
	// DEV and TUNE both leave the mode allowlist. DEV is a title-screen button
	// and not only a query param, so dropping it from the allowlist alone (and
	// leaving the button clickable) would not gate it -- and a stale 'dev'/'tune'
	// already sitting in this device's localStorage is caught here too, since
	// that value is restored through this same allowlist on load.
	{
		name: 'modeAllowlist',
		find: "if(m!=='normal'&&m!=='hardcore'&&m!=='dev'&&m!=='tune') m='normal';",
		replace: "if(m!=='normal'&&m!=='hardcore') m='normal';"
	},
	{
		name: 'tuneQueryHook',
		find: "try{ if(/[?&]tune=1\\b/.test(location.search)) m='tune'; }catch(e){}",
		replace: '/* tune mode disabled */'
	},
	{
		name: 'devModeButton',
		find: '<button class="modebtn" data-m="dev">DEV</button>',
		replace: ''
	},
	// The TUNE balancing panel, whole (keeps the closing IIFE brace/paren).
	{
		name: 'tunePanel',
		find: /\/\* ============================= TUNE balancing panel ============================= \*\/[\s\S]*?requestAnimationFrame\(loop\);\s*\}\)\(\);\s*\}\)\(\);/,
		replace: '/* TUNE balancing panel removed */'
	},
	// The DEV console, whole: god mode and its damage bypass, spawn suppression,
	// arbitrary boss and wave spawns, a hitbox overlay and a text command
	// console. It used to ship to EVERY visitor, held shut only by the
	// `gameMode==='dev'` tests inside its own render loop. It is removed now on
	// the same terms as TUNE, because those two gates are not equivalent.
	//
	// REMOVING IT STRANDS NOTHING. It is a self-contained IIFE, and every
	// reference to what it defines lives outside it behind a guard or is a
	// write: `__devSetGod` and `__devDrawHitboxes` are called only inside
	// `if (window.__devX)`, `__devInput` only inside `window.__devInput && ...`,
	// `__devTime` is read as `(window.__devTime==null?1:...)`, and `__devTime`,
	// `__devStep` and `__devNoSpawn` are each assigned at run start by code that
	// is not part of this block. The game runs identically without it.
	{
		name: 'devConsole',
		find: /\/\* ============================= dev mode ============================= \*\/[\s\S]*?requestAnimationFrame\(vis\);\s*\}\)\(\);\s*\}\)\(\);/,
		replace: '/* dev console removed */'
	}
];

/** Apply every strip in `_NON_ADMIN_STRIPS`, in order. */
export function _stripForNonAdmin(html: string): string {
	for (const strip of _NON_ADMIN_STRIPS) html = html.replace(strip.find, strip.replace);
	return html;
}

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	let signedIn = false;
	let isAdminUser = false;
	let cloud: StoredSave = { v: 2, progression: {}, prefs: {} };
	let profile: PlayerProfile = { name: '', avatarUrl: '' };
	// One saved in-progress run per mode (0037). We inject the snapshots so the
	// game's title screen can render a RESUME card for each.
	let runStates: unknown[] = [];
	// The one captureMeta field that is not readable from the page: it is on the
	// profile row, and the profile row is already being read.
	let role: string | null = null;

	if (claims) {
		signedIn = true;
		const [saveRes, profileRes, runRes] = await Promise.all([
			supabase.from('vanguard_saves').select('data').eq('user_id', claims.sub).maybeSingle(),
			supabase
				.from('profiles')
				.select('full_name, display_name, avatar_url, role')
				.eq('id', claims.sub)
				.maybeSingle(),
			supabase.from('vanguard_run_state').select('data').eq('user_id', claims.sub)
		]);
		cloud = normalizeStored(saveRes.data?.data);
		const p = profileRes.data;
		// Admin-only since 0067: this flag unlocks the game's TUNE mode, its
		// DEV mode and its DEV console (all dev tools), which belong to the
		// same privileged tier as everything else. See `_NON_ADMIN_STRIPS`.
		isAdminUser = await isAdmin(supabase, claims.sub);
		role = (p?.role as string | null) ?? null;
		profile = {
			name: p?.display_name || p?.full_name || claims.email || 'Signed in',
			avatarUrl: p?.avatar_url || ''
		};
		runStates = (runRes.data ?? []).map((r) => r.data).filter((d) => d != null);
	}

	// Every visitor first, then the non-admin gate on top. Both are serve-time
	// edits to the served bytes and neither touches the file on disk.
	let htmlContent = _rewriteForEveryone(vanguardHtml);

	if (!isAdminUser) {
		htmlContent = _stripForNonAdmin(htmlContent);
	}

	const html = injectVersionBadge(
		htmlContent.replace('<head>', `<head>\n${injectionScript(signedIn, cloud, profile, runStates, role)}`),
		'vanguard'
	);

	return new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
