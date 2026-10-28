/* IDEA HTML assignment kit: pages, not one long scroll.
   Runs after bridge.js (it uses HX, send, hxRoot, hxQueueLayout, hxStart).
   One step on screen at a time, sized to fit the classroom pane; a bar that
   says where you are and the one next thing; a plan of the classes colored by
   phase; arrival derived from saved answers; List view for a grader. */
var KIT = { steps: [], phases: [], cur: -1, view: 'step', visited: {}, plan: null, today: null, landed: false };

function kitQ(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function kitEsc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* The portal's sentence counter, ported exactly (AUTHORING: one counter, the portal's). */
function countSentences(text) {
  var s = text || '';
  s = s.replace(/\.{2,}/g, '\x01');
  s = s.replace(/(\d)\.(?=\d)/g, '$1\x01');
  s = s.replace(/\be\.g\./gi, 'eg\x01');
  s = s.replace(/\bi\.e\./gi, 'ie\x01');
  s = s.replace(/\b(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|approx|fig|vol|ed|eds|al)\./gi, '$1\x01');
  return s.split(/[.!?]+/).filter(function (piece) { return /[A-Za-z0-9]/.test(piece); }).length;
}

/* ---- What counts as done ------------------------------------------------ */
function kitFieldDone(root) {
  var field = root.dataset.field;
  var kind = hxKind(root);
  if (kind === 'image') return !!HX.images[field];
  var v = hxRead(root);
  if (kind === 'checkbox') return v === true;
  if (kind === 'table') {
    try { return JSON.parse(v).some(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); }); }
    catch (e) { return false; }
  }
  var t = String(v == null ? '' : v).trim();
  if (!t) return false;
  var min = Number(root.dataset.minSentences || 0);
  if (min && countSentences(t) < min) return false;
  if (root.dataset.number !== undefined) { var n = Number(t); if (!isFinite(n) || n <= 0) return false; }
  return true;
}
function kitRequired(step) {
  /* A box retired from the page sits in a hidden wrapper inside the step (AUTHORING:
     keep the block, hide its field). The step itself is hidden in Step view and a
     file input is hidden by design, so neither of those excuses a field. */
  return kitQ('[data-field]', step).filter(function (el) {
    var wrap = el.parentElement && el.parentElement.closest('[hidden]');
    var retired = wrap && wrap !== step && step.contains(wrap);
    /* A team post (2026-10-28, Launcher: Design): a box another member owns, or a role
       nobody has taken, is not this student's to fill, so it never holds their step open. */
    var t = (typeof TEAM !== 'undefined' && TEAM.on) ? TEAM.fields[el.getAttribute('data-field')] : null;
    var notMine = !!(t && (t.state === 'owned' || t.state === 'unowned'));
    return !el.hasAttribute('data-optional') && !el.closest('[data-optional]') && !el.closest('[data-any-one]') && !retired && !notMine;
  });
}
/* "Any one of these boxes" (2026-10-27): a step's [data-any-one] groups, each
   done when at least one box in it is. A group counts as a requirement. */
function kitAnyGroups(step) {
  return kitQ('[data-any-one]', step).filter(function (g) { return !(g.parentElement && g.parentElement.closest('[hidden]') && g.parentElement.closest('[hidden]') !== step); });
}
function kitGroupDone(g) { return kitQ('[data-field]', g).some(kitFieldDone); }
function kitStepDone(i) {
  var s = KIT.steps[i];
  var req = kitRequired(s.el);
  var groups = kitAnyGroups(s.el);
  if (req.length || groups.length) return req.every(kitFieldDone) && groups.every(kitGroupDone);
  /* A step with nothing to hand in is done once visited, or once a later step is. */
  if (KIT.visited[i]) return true;
  for (var j = i + 1; j < KIT.steps.length; j++) if (kitStepDoneShallow(j)) return true;
  return false;
}
function kitStepDoneShallow(j) { var el = KIT.steps[j].el, req = kitRequired(el), groups = kitAnyGroups(el); return (req.length + groups.length) > 0 && req.every(kitFieldDone) && groups.every(kitGroupDone); }
/* A step marked data-optional (depth after a clear "you're done" line, 2026-10-28) is
   never the next thing to do and is not counted in "x of n done". */
function kitStepOptional(i) { return KIT.steps[i].el.hasAttribute('data-optional'); }
function kitFirstOpen(from) {
  for (var i = from || 0; i < KIT.steps.length; i++) if (!kitStepOptional(i) && !kitStepDone(i)) return i;
  return -1;
}

/* ---- The plan: classes grouped into phases ------------------------------ */
function kitIsoToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function kitReadPlan() {
  var el = document.getElementById('hx-plan-data');
  if (!el) return null;
  try { return JSON.parse(el.textContent); } catch (e) { return null; }
}
function kitTodayPhase() {
  if (!KIT.plan) return null;
  var today = KIT.today, best = null;
  KIT.plan.phases.forEach(function (p) {
    (p.days || []).forEach(function (d) { if (d.date && d.date <= today && (!best || d.date >= best.date)) best = { phase: p.id, day: d.label, date: d.date }; });
  });
  return best;
}
/* A phase's color (AUTHORING D3): its own "color" from hx-plan-data, else the
   nearest of the eleven solved stops of the older data-hue arc. build.mjs
   writes both themes' values for every name used. */
function kitPhaseColor(p, t) {
  return (p && p.color) || ('t' + Math.round((t || 0) * 10));
}
/* Older sources set style="--t:x" on an .hx-hue element; give it the nearest
   solved stop so it is per-theme too. */
function kitArcColors() {
  kitQ('.hx-hue:not([data-color])').forEach(function (el) {
    var t = parseFloat(el.style.getPropertyValue('--t'));
    el.setAttribute('data-color', 't' + Math.round((isFinite(t) ? t : 0) * 10));
  });
}
function kitRenderPlan() {
  var nav = document.getElementById('hx-plan');
  if (!nav || !KIT.plan) return;
  var phases = KIT.plan.phases;
  nav.style.setProperty('--n-phases', phases.length);
  var now = kitTodayPhase();
  nav.innerHTML = phases.map(function (p, i) {
    var t = phases.length > 1 ? i / (phases.length - 1) : 0;
    return '<div class="hx-phase hx-hue" data-color="' + kitEsc(kitPhaseColor(p, t)) + '" style="--days:' + Math.max(1, (p.days || []).length) + '">' +
      '<span class="hx-phase-name">' + kitEsc(p.name) + '</span><div class="hx-phase-days">' +
      (p.days || []).map(function (d) {
        var today = now && now.date === d.date;
        var off = d.off === true;
        return '<button type="button" class="hx-day' + (today ? ' is-today' : '') + (off ? ' is-off' : '') + '"' +
          (off ? ' disabled' : '') + ' data-go-phase="' + kitEsc(p.id) + '" data-go-day="' + kitEsc(d.label) + '" aria-pressed="false">' +
          '<span class="d1">' + kitEsc(d.label) + '</span><span class="d2">' + kitEsc(d.short || p.name) + '</span></button>';
      }).join('') + '</div></div>';
  }).join('');
}

/* ---- Steps --------------------------------------------------------------- */
function kitCollectSteps() {
  var phaseIndex = {};
  if (KIT.plan) KIT.plan.phases.forEach(function (p, i) { phaseIndex[p.id] = i; });
  var nPhases = KIT.plan ? KIT.plan.phases.length : 1;
  KIT.steps = kitQ('.hx-step').map(function (el, i) {
    var pid = el.dataset.phase || '';
    var pi = phaseIndex[pid] || 0;
    var t = nPhases > 1 ? pi / (nPhases - 1) : 0;
    el.classList.add('hx-hue');
    if (!el.hasAttribute('data-color')) el.setAttribute('data-color', kitPhaseColor(KIT.plan && KIT.plan.phases[pi], t));
    var head = el.querySelector('.hx-step-head');
    if (head && !head.querySelector('.hx-num')) {
      var num = document.createElement('span');
      num.className = 'hx-num'; num.setAttribute('aria-hidden', 'true'); num.textContent = String(i + 1);
      head.insertBefore(num, head.firstChild);
    }
    var title = el.dataset.title || (el.querySelector('h2') || {}).textContent || ('Step ' + (i + 1));
    var phaseName = KIT.plan && KIT.plan.phases[pi] ? KIT.plan.phases[pi].name : '';
    if (!el.querySelector('.hx-step-foot')) {
      var foot = document.createElement('div');
      foot.className = 'hx-step-foot';
      foot.innerHTML = '<button type="button" class="idea-key" data-kit-back>Back</button>' +
        '<span class="hx-next-label"></span>' +
        '<button type="button" class="idea-key idea-key--primary" data-kit-next>Next</button>';
      el.appendChild(foot);
      /* The finish line sits on the last step that counts; optional depth comes after it. */
      var counted = kitQ('.hx-step').filter(function (x) { return !x.hasAttribute('data-optional'); });
      if (el === (counted.length ? counted[counted.length - 1] : kitQ('.hx-step').pop())) {
        var fin = document.createElement('p');
        fin.className = 'hx-finish';
        fin.setAttribute('role', 'status');
        fin.hidden = true;
        fin.innerHTML = '<strong>Everything is in.</strong> There is nothing to turn in: your work is handed in as it saves. You can still improve any answer.';
        el.insertBefore(fin, foot);
      }
    }
    return { el: el, id: el.id, title: title.trim(), phase: pid, phaseName: phaseName, day: el.dataset.day || '' };
  });
}

function kitShow(i, opts) {
  opts = opts || {};
  if (i < 0 || i >= KIT.steps.length) return;
  /* Hold only what one step showing alone measured: never the first paint (every
     step still showing) and never List view. */
  if (KIT.cur >= 0 && KIT.view === 'step') kitHoldHeight();
  KIT.cur = i;
  KIT.visited[i] = true;
  if (KIT.view === 'step') KIT.steps.forEach(function (s, j) { s.el.hidden = j !== i; });
  kitRefresh();
  hxQueueLayout();
  var focusEl = opts.focus ? KIT.steps[i].el.querySelector('h2') : null;
  if (focusEl) { focusEl.setAttribute('tabindex', '-1'); focusEl.focus({ preventScroll: true }); }
  if (opts.land) kitLand(KIT.view === 'step' ? document.getElementById('hx-bar') : KIT.steps[i].el);
}
function kitSetView(view) {
  KIT.view = view;
  document.documentElement.classList.toggle('hx-view-list', view === 'list');
  kitHoldHeight(true);
  KIT.steps.forEach(function (s, j) { s.el.hidden = view === 'step' && j !== KIT.cur; });
  kitRefresh();
  hxQueueLayout();
}

/* ---- Moving between steps without the page jumping (Mr. Pina, 2026-10-26) ----
   Two things made it jump. The frame shrank when a shorter step replaced a longer
   one, so the classroom page clamped its scroll and everything slid; and every
   click scrolled to the bar twice, 140 and 360 ms later, so the control he had
   just pressed moved out from under the mouse. Now the page never gets shorter
   while a student moves between steps (it only grows), and it scrolls only when
   the bar is off screen, once, after layout. A click in the bar or the plan
   moves nothing on screen. */
function kitHoldHeight(reset) {
  var pg = document.getElementById('hx-page');
  if (!pg) return;
  if (reset) { KIT.holdH = 0; pg.style.minHeight = ''; return; }
  var h = Math.ceil(pg.getBoundingClientRect().height);
  if (h > (KIT.holdH || 0)) { KIT.holdH = h; pg.style.minHeight = h + 'px'; }
}
KIT.barSeen = true;
(function () {
  var bar = document.getElementById('hx-bar');
  if (!bar || typeof IntersectionObserver !== 'function') return;
  new IntersectionObserver(function (es) { KIT.barSeen = es[es.length - 1].intersectionRatio > 0.98; }, { threshold: [0, 0.98, 1] }).observe(bar);
})();
function kitLand(target) {
  if (!target) return;
  if (target.id === 'hx-bar' && KIT.barSeen) return;
  var smooth = matchMedia('(prefers-reduced-motion: no-preference)').matches;
  requestAnimationFrame(function () { requestAnimationFrame(function () {
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }); });
}

/* ---- The bar ------------------------------------------------------------ */
function kitRenderBar() {
  var bar = document.getElementById('hx-bar');
  if (!bar) return;
  bar.innerHTML =
    '<div class="hx-where"><span class="lbl" id="hx-where-lbl">You are here</span><span class="val" id="hx-where"></span></div>' +
    '<div class="hx-bar-keys">' +
      '<button type="button" class="idea-key" id="hx-next-to-do"></button>' +
      '<button type="button" class="idea-key" id="hx-view" aria-pressed="false">List view</button>' +
      '<button type="button" class="idea-key" id="theme-key">Light mode</button>' +
      '<span class="hx-save" id="hx-save" role="status">Saves as you type</span>' +
    '</div>' +
    '<div class="hx-track" id="hx-track" role="group" aria-label="Steps"></div>';
}
/* ---- Where a pasted picture goes: always marked (Mr. Pina, 2026-10-26) ----
   The bridge picks the box (the one last clicked while empty and showing, else the
   first); this marks it, so with two boxes on screen a student sees which one a
   paste fills before pressing Ctrl+V. Clicking or tabbing to a box moves the mark. */
function kitMarkPaste() {
  var target = (!HX.readOnly && typeof hxPasteTarget === 'function') ? hxPasteTarget() : null;
  kitQ('[data-image-box]').forEach(function (b) {
    var on = b.getAttribute('data-image-box') === target;
    b.classList.toggle('hx-paste-target', on);
    if (!b.hasAttribute('tabindex') && !HX.readOnly) b.setAttribute('tabindex', '0');
  });
}
document.addEventListener('focusin', function (e) {
  var b = e.target.closest ? e.target.closest('[data-image-box]') : null;
  if (b) HX.lastBox = b.getAttribute('data-image-box');
  kitMarkPaste();
});
document.addEventListener('click', function () { setTimeout(kitMarkPaste, 0); });
function kitRefresh() {
  var n = KIT.steps.filter(function (s, i) { return !kitStepOptional(i); }).length;
  if (!n) return;
  var done = KIT.steps.map(function (s, i) { return kitStepDone(i); });
  var count = done.filter(function (d, i) { return d && !kitStepOptional(i); }).length;
  KIT.steps.forEach(function (s, i) { s.el.classList.toggle('is-done', done[i]); });
  var cur = KIT.steps[KIT.cur] || KIT.steps[0];
  var where = document.getElementById('hx-where');
  if (where) where.textContent = HX.readOnly
    ? count + ' of ' + n + ' steps done · every step shown'
    : (KIT.view === 'list' ? 'List view · ' : '') + (cur.phaseName ? cur.phaseName + ' · ' : '') +
      'Step ' + (KIT.cur + 1) + ' of ' + n + ' · ' + cur.title + ' · ' + count + ' of ' + n + ' done';
  var whereLbl = document.getElementById('hx-where-lbl');
  if (whereLbl) whereLbl.textContent = HX.readOnly ? 'Grading view, read only' : 'You are here';
  var pill = document.getElementById('hx-save');
  if (pill) pill.hidden = HX.readOnly;
  var track = document.getElementById('hx-track');
  if (track) {
    track.innerHTML = KIT.steps.map(function (s, i) {
      return '<button type="button" class="hx-seg hx-hue' + (done[i] ? ' is-done' : '') + (i === KIT.cur ? ' is-here' : '') +
        '" data-color="' + kitEsc(s.el.getAttribute('data-color') || '') + '" data-go="' + i + '" aria-label="Step ' + (i + 1) + ': ' +
        kitEsc(s.title) + (done[i] ? ', done' : '') + '"></button>';
    }).join('');
  }
  var next = kitFirstOpen(0);
  var key = document.getElementById('hx-next-to-do');
  if (key) {
    key.textContent = next < 0 ? 'All done · ' + count + ' of ' + n
      : (next < KIT.cur ? 'Still to do: Step ' : 'Next to do: Step ') + (next + 1) + ' · ' + KIT.steps[next].title;
    key.dataset.go = next < 0 ? '' : String(next);
    key.disabled = next < 0 || HX.readOnly;
    /* On the step that is next to do, the step's own Next is the one action. */
    key.hidden = HX.readOnly || (next === KIT.cur && KIT.view === 'step');
  }
  var view = document.getElementById('hx-view');
  if (view) { view.setAttribute('aria-pressed', KIT.view === 'list' ? 'true' : 'false'); view.textContent = KIT.view === 'list' ? 'Step view' : 'List view'; view.hidden = HX.readOnly; }
  KIT.steps.forEach(function (s, i) {
    var foot = s.el.querySelector('.hx-step-foot');
    if (!foot) return;
    var back = foot.querySelector('[data-kit-back]');
    var fwd = foot.querySelector('[data-kit-next]');
    var label = foot.querySelector('.hx-next-label');
    back.disabled = i === 0;
    if (i === KIT.steps.length - 1) {
      fwd.hidden = next < 0;
      fwd.textContent = next < 0 ? '' : 'Still to do: Step ' + (next + 1) + ' · ' + KIT.steps[next].title;
      fwd.dataset.go = next < 0 ? '' : String(next);
    } else { fwd.hidden = false; fwd.textContent = 'Next: ' + KIT.steps[i + 1].title; fwd.dataset.go = String(i + 1); fwd.disabled = false; }
    /* A step reads done only on its own evidence, never on a visit. */
    var own = kitRequired(s.el).length + kitAnyGroups(s.el).length > 0;
    label.innerHTML = own && done[i] ? '<span class="idea-chip idea-chip--lamp">Step done</span>' : '';
    var fin = s.el.querySelector('.hx-finish');
    if (fin) fin.hidden = next >= 0 || HX.readOnly;
  });
  kitQ('.hx-day').forEach(function (b) {
    var on = cur && b.dataset.goPhase === cur.phase && (!cur.day || b.dataset.goDay === cur.day);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  kitMarkPaste();
}

/* ---- Tap tips: a tap toggles, the width fits inside the page ------------ */
function kitFitTip(el) {
  var page = document.getElementById('hx-page').getBoundingClientRect();
  var r = el.getBoundingClientRect();
  var room = Math.max(160, Math.min(300, page.right - r.left - 16));
  el.style.setProperty('--tip-w', room + 'px');
}
document.addEventListener('click', function (e) {
  var tip = e.target.closest ? e.target.closest('.it') : null;
  kitQ('.it.open').forEach(function (o) { if (o !== tip) o.classList.remove('open'); });
  if (tip) { kitFitTip(tip); tip.classList.toggle('open'); }
});
document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('it')) kitFitTip(e.target); });
document.addEventListener('mouseover', function (e) { var t = e.target.closest ? e.target.closest('.it') : null; if (t) kitFitTip(t); });

/* ---- Keys --------------------------------------------------------------- */
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-go], [data-kit-back], [data-go-phase], #hx-view, #theme-key') : null;
  if (!t) return;
  if (t.id === 'theme-key') {
    HX.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    hxSetTheme(HX.theme);
    return;
  }
  if (t.id === 'hx-view') { kitSetView(KIT.view === 'list' ? 'step' : 'list'); return; }
  if (t.hasAttribute('data-kit-back')) { kitShow(KIT.cur - 1, { land: true, focus: true }); return; }
  if (t.dataset.goPhase) {
    var idx = -1;
    KIT.steps.forEach(function (s, i) { if (idx < 0 && s.phase === t.dataset.goPhase && (!s.day || s.day === t.dataset.goDay)) idx = i; });
    if (idx < 0) KIT.steps.forEach(function (s, i) { if (idx < 0 && s.phase === t.dataset.goPhase) idx = i; });
    if (idx >= 0) kitShow(idx, { land: true, focus: true });
    return;
  }
  if (t.dataset.go !== undefined && t.dataset.go !== '') kitShow(Number(t.dataset.go), { land: true, focus: true });
});
document.addEventListener('keydown', function (e) {
  var tip = e.target.classList && e.target.classList.contains('it');
  if (tip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.classList.toggle('open'); }
  if (tip && e.key === 'Escape') e.target.classList.remove('open');
});

/* ---- Page code shared by every assignment -------------------------------- */
function kitRefreshFields() {
  kitQ('[data-count-for]').forEach(function (chip) {
    var box = hxRoot(chip.dataset.countFor);
    var need = Number(chip.dataset.min);
    var have = box ? countSentences(box.value) : 0;
    chip.textContent = Math.min(have, need) + ' of ' + need + ' sentence' + (need === 1 ? '' : 's') + (have >= need ? ', done' : '');
  });
  kitQ('textarea').forEach(function (t) {
    if (!t.getClientRects().length) return;
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  });
}
function kitLabelThemeKey() {
  var k = document.getElementById('theme-key');
  if (k) k.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark mode' : 'Light mode';
}
document.addEventListener('input', function () { kitRefreshFields(); kitRefresh(); });
document.addEventListener('change', function () { kitRefresh(); });
HX.onState.push(function (d, first) {
  kitRefreshFields();
  if (first) {
    if (HX.readOnly) { kitSetView('list'); kitShow(0); }
    else {
      var now = kitTodayPhase();
      var start = -1;
      if (now) KIT.steps.forEach(function (s, i) { if (start < 0 && s.phase === now.phase && !kitStepDone(i)) start = i; });
      if (start < 0) start = kitFirstOpen(0);
      if (start < 0) start = KIT.steps.length - 1;
      kitShow(Math.max(0, start));
    }
  } else if (HX.readOnly && KIT.view !== 'list') kitSetView('list');
  kitRefresh();
});
HX.onSaved.push(function (d) {
  var b = document.getElementById('hx-failed');
  if (b) { b.hidden = !!d.ok; if (!d.ok) b.textContent = 'Not saved yet: ' + (d.reason || 'check the connection.') + ' Keep this page open and try again.'; }
});
new MutationObserver(kitLabelThemeKey).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---- The glossary: one definition per term, used by every tip ---------- */
/* A JSON script element with id hx-glossary holds {"term": "definition"}; a
   span.it with data-term="term" gets its tip and its screen-reader text from it.
   (Never write a closing script tag in this file: it is inlined into one.) */
function kitGlossary() {
  var el = document.getElementById('hx-glossary');
  var g = {};
  if (el) { try { g = JSON.parse(el.textContent); } catch (e) { g = {}; } }
  kitQ('.it[data-term]').forEach(function (t) {
    var def = g[t.dataset.term];
    if (!def) return;
    t.setAttribute('data-tip', def);
    t.setAttribute('tabindex', '0');
    if (!t.querySelector('.vh')) { var v = document.createElement('span'); v.className = 'vh'; v.textContent = ' (' + def + ')'; t.appendChild(v); }
  });
}

/* ---- Who does it (AUTHORING G10), drawn from the manifest ----------------
   On a team post every step head and every answer section says who answers there:
   "Just you" (individual), "Whole team" (team) or "Your role only" (role), both on a
   step that mixes them. Read from each block's module audience, so the page and the
   grading can never disagree. <html data-badges="manual"> keeps an author's own. */
var KIT_WHO = { individual: 'Just you', team: 'Whole team', role: 'Your role only' };
function kitWhoBadges() {
  if (document.documentElement.getAttribute('data-badges') === 'manual') return;
  var m; try { m = JSON.parse((document.getElementById('idea-manifest') || {}).textContent || '{}'); } catch (e) { return; }
  var aud = {};
  (m.modules || []).forEach(function (mod) { (mod.blocks || []).forEach(function (b) { aud[b.field] = mod.audience || 'individual'; }); });
  var kinds = Object.keys(aud).map(function (f) { return aud[f]; });
  if (!kinds.some(function (a) { return a !== 'individual'; })) return; /* not a team post */
  var chip = function (a) { return '<span class="idea-chip hx-who-badge" data-audience="' + a + '">' + KIT_WHO[a] + '</span>'; };
  var of = function (el) {
    var seen = {};
    kitQ('[data-field]', el).forEach(function (f) { var a = aud[f.getAttribute('data-field')]; if (a && KIT_WHO[a]) seen[a] = 1; });
    return ['individual', 'team', 'role'].filter(function (a) { return seen[a]; });
  };
  kitQ('.hx-step').forEach(function (step) {
    var head = step.querySelector('.hx-step-head');
    var list = of(step);
    if (head && list.length && !head.querySelector('.hx-who-badge')) {
      var box = document.createElement('span'); box.className = 'hx-who-badges'; box.innerHTML = list.map(chip).join('');
      head.appendChild(box);
    }
    kitQ('.hx-evidence, [data-role]', step).forEach(function (sec) {
      var l2 = of(sec);
      if (!l2.length || sec.querySelector(':scope > .hx-who-badges')) return;
      var b = document.createElement('span'); b.className = 'hx-who-badges'; b.innerHTML = l2.map(chip).join('');
      /* On the eyebrow's own line, so a badge never costs a row of the step's height. */
      var eb = sec.querySelector(':scope > .idea-eyebrow');
      if (eb) { b.classList.add('hx-who-inline'); eb.appendChild(b); } else sec.insertBefore(b, sec.firstChild);
    });
  });
}

/* ---- Start -------------------------------------------------------------- */
function kitStart() {
  kitGlossary();
  KIT.today = document.documentElement.dataset.today || kitIsoToday();
  KIT.plan = kitReadPlan();
  kitArcColors();
  kitWhoBadges();
  kitRenderPlan();
  kitRenderBar();
  kitCollectSteps();
  /* Before the portal seeds the page (or with no portal at all), show step 1. */
  kitShow(0);
  kitLabelThemeKey();
  kitRefreshFields();
  hxStart();
}
kitStart();

/* ---- Taken to one answer (idea:focus) ----------------------------------
   The portal's Answers left list sends { type: 'idea:focus', field }. Show
   the step that holds the field, open a fold around it, focus it without
   scrolling (the portal scrolls the page and rings the box), and answer with
   idea:field-box so the portal knows where it is. A portal that never sends
   it changes nothing here. */
addEventListener('message', function (e) {
  var d = e.data;
  if (e.source !== parent || !d || d.type !== 'idea:focus' || typeof d.field !== 'string') return;
  var el = document.querySelector('[data-field="' + CSS.escape(d.field) + '"]');
  var box = document.querySelector('[data-image-box="' + CSS.escape(d.field) + '"]') || el;
  if (!box) return;
  var idx = -1;
  KIT.steps.forEach(function (s, i) { if (idx < 0 && s.el.contains(box)) idx = i; });
  if (idx >= 0 && idx !== KIT.cur && KIT.view === 'step') kitShow(idx);
  var fold = box.closest('details:not([open])');
  if (fold) fold.open = true;
  setTimeout(function () {
    if (el && !el.disabled && el.type !== 'file') el.focus({ preventScroll: true });
    send({ type: 'idea:field-box', field: d.field, rect: fieldBoxOf(d.field) });
  }, 260);
});

/* THE POST'S DUE DATE AND DAY-BY-DAY PLAN (ledger 0439, SPEC 17.4). The portal
   sends `schedule` on idea:state: today, the post's own due date, and the
   manifest's pacing resolved to school days with this student's state. Any
   element carrying data-idea-schedule is filled with it; data-idea-due gets the
   due date alone. So a document never types a date that can disagree with its
   post. A portal that sends no schedule leaves both elements as written. */
var KIT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var KIT_PACE_WORDS = { done: 'Done', behind: 'Behind', today: 'Today', next: 'Next', later: 'Coming up' };
function kitDay(day) {
  var p = String(day || '').split('-');
  return p.length === 3 ? KIT_MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) : '';
}
HX.onState.push(function (d) {
  var s = d && d.schedule;
  if (!s || typeof s !== 'object') return;
  var due = s.due && s.due.day ? 'Due ' + kitDay(s.due.day) : 'No due date';
  kitQ('[data-idea-due]').forEach(function (el) { el.textContent = due; });
  var steps = Array.isArray(s.pacing) ? s.pacing : [];
  kitQ('[data-idea-schedule]').forEach(function (el) {
    el.innerHTML = '<p class="hx-sched-due">' + kitEsc(due) + '</p>' + (steps.length
      ? '<ol class="hx-sched">' + steps.map(function (p) {
          return '<li data-state="' + kitEsc(p.state) + '"><span class="hx-sched-day">' + kitEsc(kitDay(p.day)) +
            '</span> <span class="hx-sched-title">' + kitEsc(p.title) + '</span> <span class="hx-sched-state">' +
            kitEsc(KIT_PACE_WORDS[p.state] || '') + '</span></li>';
        }).join('') + '</ol>'
      : '');
  });
});
