/* hx-kit: team assignments (IDEA_HTML_ASSIGNMENT_SPEC.md section 16, ledger 0436).
   Inert in a worksheet that is not a team post: the portal never sends
   idea:team-state or idea:team-tracker to one, and the focus and blur notices are
   advisory (SPEC 16.7: a document that never sends them still works).

   What it does:
   - tells the portal which box the student is in (idea:field-focus / -blur), so the
     portal takes and releases that box's lock;
   - draws a box a teammate holds, a box another member owns, a box with no owner and
     a past-due box as read only, with the words beside it ("Jake is editing");
   - lets a teammate's saved answer replace what this page last typed in a shared box,
     once this page's own save has landed (the kit otherwise keeps a typed box forever,
     which is right for a worksheet and wrong for a shared one);
   - marks the student's own role panels ([data-role]) and names every owner
     ([data-role-owner]);
   - draws the team plan's tracker into #hx-team-tracker when the page has one. */
var TEAM = { on: false, fields: {}, roles: [], me: '', name: '', tracker: null };
function teamRootOf(el) { return el && el.closest ? el.closest('[data-field]') : null; }
function teamFocusedField() {
  var r = teamRootOf(document.activeElement);
  return r ? r.getAttribute('data-field') : null;
}
document.addEventListener('focusin', function (e) {
  var r = teamRootOf(e.target);
  if (!r || HX.readOnly) return;
  send({ type: 'idea:field-focus', field: r.getAttribute('data-field') });
});
document.addEventListener('focusout', function (e) {
  var r = teamRootOf(e.target);
  if (!r) return;
  var field = r.getAttribute('data-field');
  setTimeout(function () {
    if (teamFocusedField() === field) return; /* moved within the same box (a table) */
    send({ type: 'idea:field-blur', field: field });
  }, 0);
});
function teamWho(root) {
  var field = root.getAttribute('data-field');
  var who = document.querySelector('[data-who="' + CSS.escape(field) + '"]');
  if (!who) {
    who = document.createElement('p');
    who.className = 'hx-who';
    who.setAttribute('data-who', field);
    who.setAttribute('aria-live', 'polite');
    var host = root.closest('label') || root;
    host.parentNode.insertBefore(who, host.nextSibling);
  }
  return who;
}
var TEAM_WORDS = {
  held: function (t) { return (t.by || 'A teammate') + ' is editing'; },
  owned: function (t) { return 'Belongs to ' + (t.by || 'a teammate'); },
  unowned: function () { return 'No owner yet: pick roles in your Team plan'; },
  closed: function () { return 'Past due, read only'; },
  later: function (t) { return 'Opens after your team\u2019s ' + (t.by || 'next') + ' sign-off'; },
  mine: function () { return 'You are editing'; },
  free: function () { return ''; }
};
function teamApply() {
  if (!TEAM.on) return;
  var focused = teamFocusedField();
  hxRoots().forEach(function (root) {
    var field = root.getAttribute('data-field');
    var t = TEAM.fields[field];
    if (!t) return;
    var locked = t.state !== 'free' && t.state !== 'mine';
    var controls = [root].concat(Array.prototype.slice.call(root.querySelectorAll('input, textarea, select, button')));
    controls.forEach(function (c) { if ('disabled' in c) c.disabled = HX.readOnly || locked; });
    document.querySelectorAll('[data-choose="' + CSS.escape(field) + '"], [data-remove="' + CSS.escape(field) + '"]')
      .forEach(function (k) { k.disabled = HX.readOnly || locked; });
    root.classList.toggle('hx-locked', locked);
    var who = teamWho(root);
    who.textContent = (TEAM_WORDS[t.state] || TEAM_WORDS.free)(t);
    who.className = 'hx-who' + (t.state === 'mine' ? ' mine' : locked ? ' locked' : '');
    /* A shared box this page typed in follows the team again once its own save has
       landed (the portal's value is what this page last sent) or someone else has it. */
    if (field !== focused && HX.owned[field] && (locked || HX.sent[field] === HX.values[field])) {
      delete HX.owned[field];
    }
    if (field !== focused && !HX.owned[field] && Object.prototype.hasOwnProperty.call(HX.values, field) && hxKind(root) !== 'image') {
      var v = HX.values[field];
      if (hxRead(root) !== v) { hxWrite(root, v); HX.sent[field] = v; }
    }
  });
  document.querySelectorAll('[data-role]').forEach(function (panel) {
    var id = panel.getAttribute('data-role');
    var r = TEAM.roles.filter(function (x) { return x.id === id; })[0];
    panel.classList.toggle('is-mine', !!(r && r.mine));
  });
  document.querySelectorAll('[data-role-owner]').forEach(function (el) {
    var id = el.getAttribute('data-role-owner');
    var r = TEAM.roles.filter(function (x) { return x.id === id; })[0];
    el.textContent = !r ? '' : r.mine ? 'Yours' : r.owner ? r.owner : 'No owner yet';
    el.classList.toggle('is-mine', !!(r && r.mine));
  });
  document.querySelectorAll('[data-team-name]').forEach(function (el) { el.textContent = TEAM.name || 'your team'; });
  if (typeof kitRefresh === 'function') kitRefresh();
  if (typeof hxQueueLayout === 'function') hxQueueLayout();
}
function teamTrackerEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function teamDrawTracker() {
  var box = document.getElementById('hx-team-tracker');
  var d = TEAM.tracker;
  if (!box || !d) return;
  var flags = [];
  if (d.flags && d.flags.behind) flags.push('<span class="idea-chip idea-chip--lamp idea-chip--amber">Behind</span>');
  if (d.flags && d.flags.slipping) flags.push('<span class="idea-chip idea-chip--lamp idea-chip--amber">Slipping</span>');
  if (d.flags && d.flags.uneven) flags.push('<span class="idea-chip idea-chip--lamp idea-chip--amber">Uneven split</span>');
  var tasks = (d.tasks || []).slice(0, 6).map(function (t) {
    return '<li><span class="hx-tk-title">' + teamTrackerEsc(t.title) + '</span><span class="hx-tk-meta">' +
      teamTrackerEsc(t.owner) + ' · ' + teamTrackerEsc(t.due) + ' · ' + teamTrackerEsc(t.status) + '</span></li>';
  }).join('');
  box.innerHTML = '<p class="hx-tk-sum">' + teamTrackerEsc(d.summary) + '</p>' +
    (flags.length ? '<p class="hx-row">' + flags.join('') + '</p>' : '') +
    (d.next ? '<p class="hx-tk-next">Next sign-off: <strong>' + teamTrackerEsc(d.next.title) + '</strong>, ' + teamTrackerEsc(d.next.date) + ' (' + teamTrackerEsc(d.next.state) + ')</p>' : '') +
    (tasks ? '<ul class="hx-tk-list">' + tasks + '</ul>' : '');
  box.hidden = false;
  if (typeof hxQueueLayout === 'function') hxQueueLayout();
}
addEventListener('message', function (e) {
  if (e.source !== parent) return;
  var d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'idea:team-state') {
    TEAM.on = true;
    TEAM.fields = d.fields || {};
    TEAM.roles = Array.isArray(d.roles) ? d.roles : [];
    TEAM.me = d.me || '';
    TEAM.name = d.team || '';
    document.documentElement.classList.add('is-team');
    teamApply();
  } else if (d.type === 'idea:team-tracker') {
    TEAM.tracker = d;
    teamDrawTracker();
  }
});
HX.onState.push(function () { teamApply(); });
