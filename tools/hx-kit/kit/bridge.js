/* IDEA HTML assignment kit: the bridge. Copied verbatim from
   docs/standards/IDEA_HTML_ASSIGNMENT_BRIEF.md 6.1 to 6.5 (tested there in Chromium
   against the portal's own message gate). Edit it there and here together. */
/* ===== IDEA bridge client. Copy as is. ===== */
var HX = {
  ready: false, seeded: false, readOnly: false,
  values: {},   // the last values the portal sent, by field
  images: {},   // the last stored files the portal sent: field -> { url, name, caption }
  owned: {},    // fields the student changed this visit: no echo overwrites them
  sent: {},     // the last value sent for each field
  theme: null,  // 'light' or 'dark' from the page's own key, for this visit only
  onState: [],  // fn(message, isFirstSeed) after every idea:state
  onSaved: []   // fn(message) after every idea:saved
};
function send(msg) { parent.postMessage(msg, '*'); }
function hxRoots() { return Array.prototype.slice.call(document.querySelectorAll('[data-field]')); }
function hxRoot(field) { return document.querySelector('[data-field="' + CSS.escape(field) + '"]'); }
function hxKind(el) {
  if (el.dataset.kind) return el.dataset.kind;   // 'radio' or 'table'
  if (el.type === 'checkbox') return 'checkbox';
  if (el.type === 'file') return 'image';
  return 'text';                                  // text input or textarea
}
function hxCells(row) { return row.querySelectorAll('input, textarea, select'); }
function hxRead(root) {
  var kind = hxKind(root);
  if (kind === 'checkbox') return root.checked;
  if (kind === 'radio') {
    var on = root.querySelector('input[type="radio"]:checked');
    return on ? on.value : '';
  }
  if (kind === 'table') {
    return JSON.stringify(Array.prototype.map.call(root.querySelectorAll('tbody tr'), function (tr) {
      return Array.prototype.map.call(hxCells(tr), function (c) { return c.value; });
    }));
  }
  return root.value;
}
function hxAddRow(root) {
  var body = root.querySelector('tbody');
  var row = body.rows[0].cloneNode(true);
  Array.prototype.forEach.call(hxCells(row), function (c) { c.value = ''; });
  body.appendChild(row);
}
function hxWrite(root, value) {
  var kind = hxKind(root);
  if (kind === 'image') return;
  if (kind === 'checkbox') { root.checked = value === true; return; }
  if (kind === 'radio') {
    root.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = r.value === value; });
    return;
  }
  if (kind === 'table') {
    var rows;
    try { rows = JSON.parse(value); } catch (e) { return; }
    if (!Array.isArray(rows)) return;
    var body = root.querySelector('tbody');
    while (body.rows.length < rows.length) hxAddRow(root);
    Array.prototype.forEach.call(body.rows, function (tr, i) {
      Array.prototype.forEach.call(hxCells(tr), function (c, j) {
        var cell = rows[i] && rows[i][j];
        c.value = cell == null ? '' : String(cell);
      });
    });
    return;
  }
  root.value = typeof value === 'string' ? value : String(value);
}
/* A student edit: send the value exactly as it stands. Never trim it. */
function hxEdited(root) {
  if (HX.readOnly || hxKind(root) === 'image') return;
  var field = root.dataset.field;
  var value = hxRead(root);
  if (HX.sent[field] === value) return;
  HX.sent[field] = value;
  HX.owned[field] = true;
  send({ type: 'idea:change', field: field, value: value });
}
function hxOnEdit(e) {
  var root = e.target && e.target.closest ? e.target.closest('[data-field]') : null;
  if (root) hxEdited(root);
}
addEventListener('input', hxOnEdit);
addEventListener('change', hxOnEdit);
/* "Add a row" on a table: <button type="button" data-add-row="<field>" data-edits>. */
document.addEventListener('click', function (e) {
  var add = e.target.closest ? e.target.closest('[data-add-row]') : null;
  var root = add ? hxRoot(add.dataset.addRow) : null;
  if (!root || HX.readOnly) return;
  hxAddRow(root);
  hxEdited(root);
  hxQueueLayout();
});
function hxSetReadOnly(ro) {
  HX.readOnly = ro;
  document.documentElement.classList.toggle('is-readonly', ro);
  document.querySelectorAll('[data-field], [data-field] input, [data-field] textarea, ' +
    '[data-field] select, [data-field] button, [data-edits]').forEach(function (el) { el.disabled = ro; });
}
function hxApplyState(d) {
  var first = !HX.seeded;
  HX.seeded = true;
  HX.values = d.values || {};
  HX.images = d.images || {};
  hxRoots().forEach(function (root) {
    var field = root.dataset.field;
    if (HX.owned[field] || !Object.prototype.hasOwnProperty.call(HX.values, field)) return;
    var value = HX.values[field];
    if (hxRead(root) === value) return;
    hxWrite(root, value);
    HX.sent[field] = value;
  });
  var ro = d.readOnly === true;
  if (first || ro !== HX.readOnly) hxSetReadOnly(ro);
  HX.onState.forEach(function (fn) { fn(d, first); });
  hxQueueLayout();
}
function hxSetTheme(theme) { document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'; }
function hxOnSaved(d) {
  var pill = document.getElementById('hx-save');
  var at = new Date(d.at);
  if (pill) {
    pill.textContent = d.ok
      ? 'Saved ' + (isNaN(at) ? '' : at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
      : 'Not saved: ' + (d.reason || 'try again.');
    pill.classList.toggle('failed', !d.ok);
  }
  HX.onSaved.forEach(function (fn) { fn(d); });
}
addEventListener('message', function (e) {
  if (e.source !== parent) return;
  var d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'idea:state') hxApplyState(d);
  else if (d.type === 'idea:saved') hxOnSaved(d);
  else if (d.type === 'idea:theme' && !HX.theme) hxSetTheme(d.theme);
});
/* Height: the frame is exactly this tall. Measure the page wrapper, never
   documentElement.scrollHeight (it never drops below the frame's own height). */
var hxPage = document.getElementById('hx-page');
var hxLastHeight = 0;
var hxLayoutTimer = 0;
function hxReportHeight() {
  var px = Math.ceil(hxPage.getBoundingClientRect().height) + 2;
  if (px === hxLastHeight) return;
  hxLastHeight = px;
  send({ type: 'idea:height', px: px });
}
/* Call after anything that moves the layout: a fold, a stage change, a new row. */
function hxQueueLayout() {
  clearTimeout(hxLayoutTimer);
  hxLayoutTimer = setTimeout(function () {
    hxReportHeight();
    if (typeof sendImageBoxes === 'function') sendImageBoxes();
    if (typeof reportFieldBoxes === 'function') reportFieldBoxes();
    if (typeof hxMoveVideo === 'function') hxMoveVideo();
  }, 60);
}
new ResizeObserver(hxQueueLayout).observe(hxPage);
addEventListener('resize', hxQueueLayout);
function hxStart() {
  if (HX.ready) return;
  HX.ready = true;
  send({ type: 'idea:ready', schemaVersion: 3 });
  hxQueueLayout();
}
/* ===== end of the bridge client ===== */

/* ===== Pictures and files: choose, paste, remove, caption. Copy as is. ===== */
var HX_MAX_FILE = 50 * 1024 * 1024;
HX.pending = null;   // { field, timer } while the one upload in flight is unanswered
HX.removing = {};    // field -> true until the portal's state no longer lists it
HX.lastBox = null;   // the image field the student last touched, for paste
function hxEl(attr, field) { return document.querySelector('[' + attr + '="' + CSS.escape(field) + '"]'); }
function hxNote(field, text, failed) {
  var el = hxEl('data-file-note', field);
  if (el) { el.textContent = text; el.classList.toggle('failed', !!failed); }
}
function hxDrawBox(field, text, src) {
  var box = hxEl('data-image-box', field);
  if (!box) return;
  box.textContent = '';
  if (src) { var img = new Image(); img.alt = text; img.src = src; box.appendChild(img); }
  else box.appendChild(document.createTextNode(text));
}
function hxEmptyText(field) {
  var box = hxEl('data-image-box', field);
  return (box && box.getAttribute('data-empty')) || 'Nothing here yet';
}
/* After every idea:state: a file is handed in when its field appears in images. */
HX.onState.push(function () {
  document.querySelectorAll('input[type="file"][data-field]').forEach(function (input) {
    var field = input.dataset.field;
    var stored = HX.images[field];
    var cap = hxEl('data-caption-for', field);
    if (HX.pending && HX.pending.field === field) {
      if (!stored) return;                       // an echo from before the upload landed
      clearTimeout(HX.pending.timer);
      HX.pending = null;
      hxNote(field, 'Handed in.', false);
      if (cap && cap.value) send({ type: 'idea:image-caption', field: field, caption: cap.value });
    }
    if (HX.removing[field]) {
      if (stored) return;
      delete HX.removing[field];
      hxNote(field, 'Removed.', false);
    }
    hxDrawBox(field, stored ? 'Saved: ' + stored.name : hxEmptyText(field));
    var remove = hxEl('data-remove', field);
    if (remove) remove.hidden = !stored;
    if (cap && !HX.owned['caption:' + field]) cap.value = stored ? stored.caption : '';
  });
});
/* A failed save while a file is uploading or being removed is shown on that file. */
HX.onSaved.push(function (d) {
  if (d.ok) return;
  if (HX.pending) {
    var field = HX.pending.field;
    clearTimeout(HX.pending.timer);
    HX.pending = null;
    hxNote(field, 'Not handed in: ' + (d.reason || 'try again.'), true);
    hxDrawBox(field, hxEmptyText(field));
  }
  Object.keys(HX.removing).forEach(function (f) {
    delete HX.removing[f];
    hxNote(f, 'Not removed: ' + (d.reason || 'try again.'), true);
  });
});
function hxAttach(field, file) {
  if (HX.readOnly) return;
  if (HX.pending) return hxNote(field, 'One file at a time. Wait for the last one to finish.', true);
  if (HX.images[field]) return hxNote(field, 'Remove the file that is here first, then add the new one.', true);
  var input = hxRoot(field);
  var ext = ((file.name.match(/\.[^.]+$/) || [''])[0]).toLowerCase();
  var allowed = ((input && input.dataset.ext) || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (allowed.length && allowed.indexOf(ext) < 0) {
    return hxNote(field, 'This box takes a ' + allowed.join(' or ') + ' file. That one is ' +
      (ext || 'a file with no extension') + '.', true);
  }
  if (file.size > HX_MAX_FILE) {
    return hxNote(field, 'That file is ' + Math.ceil(file.size / 1048576) + ' MB. The limit is 50 MB.', true);
  }
  var reader = new FileReader();
  reader.onerror = function () { hxNote(field, 'That file could not be read. Choose it again.', true); };
  reader.onload = function () {
    HX.pending = { field: field, timer: setTimeout(function () {
      HX.pending = null;
      hxNote(field, 'No answer from Classroom after 45 seconds. Check the connection and add it again.', true);
      hxDrawBox(field, hxEmptyText(field));
    }, 45000) };
    hxNote(field, 'Uploading ' + file.name, false);
    if (/^image\//.test(file.type)) hxDrawBox(field, file.name, reader.result);
    else hxDrawBox(field, 'Uploading ' + file.name);
    send({ type: 'idea:image', field: field, name: file.name, bytes: reader.result });
  };
  reader.readAsDataURL(file);
}
function hxRemove(field) {
  if (HX.readOnly || !HX.images[field] || HX.removing[field]) return;
  HX.removing[field] = true;
  hxNote(field, 'Removing', false);
  send({ type: 'idea:image-remove', field: field });
}
document.addEventListener('change', function (e) {
  var input = e.target;
  if (!input || input.type !== 'file' || !input.dataset.field) return;
  var file = input.files && input.files[0];
  input.value = '';
  if (file) hxAttach(input.dataset.field, file);
});
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-choose], [data-remove], [data-image-box]') : null;
  if (!t) return;
  if (t.dataset.choose) {
    HX.lastBox = t.dataset.choose;
    var input = hxRoot(t.dataset.choose);
    if (input && !HX.readOnly) input.click();
  } else if (t.dataset.remove) hxRemove(t.dataset.remove);
  else HX.lastBox = t.getAttribute('data-image-box');
});
var hxCaptionTimers = {};
document.addEventListener('input', function (e) {
  var cap = e.target.closest ? e.target.closest('[data-caption-for]') : null;
  if (!cap || HX.readOnly) return;
  var field = cap.dataset.captionFor;
  HX.owned['caption:' + field] = true;
  clearTimeout(hxCaptionTimers[field]);
  hxCaptionTimers[field] = setTimeout(function () {
    if (HX.images[field]) send({ type: 'idea:image-caption', field: field, caption: cap.value });
  }, 600);
});
document.addEventListener('focusin', function (e) {
  var slot = e.target.closest ? e.target.closest('[data-choose], [data-caption-for]') : null;
  if (slot) HX.lastBox = slot.dataset.choose || slot.dataset.captionFor;
  else if (e.target.closest && e.target.closest('[data-field]')) HX.lastBox = null;
});
/* A pasted picture goes to the slot last touched while it is empty and visible, else the first. */
function hxPasteTarget() {
  var open = Array.prototype.filter.call(document.querySelectorAll('[data-image-box]'), function (box) {
    var field = box.getAttribute('data-image-box');
    var input = hxRoot(field);
    return box.getClientRects().length > 0 && !box.closest('details:not([open])') &&
      !HX.images[field] && !(input && input.dataset.ext);
  }).map(function (box) { return box.getAttribute('data-image-box'); });
  return HX.lastBox && open.indexOf(HX.lastBox) >= 0 ? HX.lastBox : open[0] || null;
}
document.addEventListener('paste', function (e) {
  if (HX.readOnly) return;
  var files = (e.clipboardData && e.clipboardData.files) || [];
  var file = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); })[0];
  var field = file && hxPasteTarget();
  if (!field) return;
  e.preventDefault();
  hxAttach(field, file);
});

/* ===== Picture-box reporter: where each stored picture should be drawn. ===== */
var HX_BOX_SENT = {};
function sendImageBoxes() {
  document.querySelectorAll('[data-image-box]').forEach(function (el) {
    var field = el.getAttribute('data-image-box');
    var r = el.getBoundingClientRect();
    var showing = r.width > 0 && r.height > 0 && !el.closest('details:not([open])');
    var rect = showing
      ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
      : null;
    var key = JSON.stringify(rect);
    if (HX_BOX_SENT[field] === key) return;
    HX_BOX_SENT[field] = key;
    send({ type: 'idea:image-box', field: field, rect: rect, clipTop: 0 });
  });
}

var NOTE_FIELDS = [];
var REPORTED = {};
function fieldBoxOf(field) {
	var el = document.querySelector('[data-image-box="' + CSS.escape(field) + '"]') ||
		document.querySelector('[data-field="' + CSS.escape(field) + '"]');
	if (!el) return null;
	var r = el.getBoundingClientRect();
	if (!(r.width > 0 && r.height > 0)) return null;
	return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
}
function reportFieldBoxes() {
	NOTE_FIELDS.forEach(function (field) {
		REPORTED[field] = true;
		send({ type: 'idea:field-box', field: field, rect: fieldBoxOf(field) });
	});
	Object.keys(REPORTED).forEach(function (field) {
		if (NOTE_FIELDS.indexOf(field) >= 0) return;
		delete REPORTED[field];
		send({ type: 'idea:field-box', field: field, rect: null });
	});
}
addEventListener('message', function (e) {
	var d = e.data;
	if (!d || typeof d !== 'object') return;
	if (d.type === 'idea:feedback' && Array.isArray(d.fields)) {
		NOTE_FIELDS = d.fields.filter(function (f) { return typeof f === 'string'; });
		reportFieldBoxes();
	}
	if (d.type === 'idea:state') setTimeout(reportFieldBoxes, 0);
});
var fieldBoxTimer = 0;
addEventListener('resize', function () {
	clearTimeout(fieldBoxTimer);
	fieldBoxTimer = setTimeout(reportFieldBoxes, 100);
});

/* ===== A video the portal plays over a 16:9 box. ===== */
/* <div class="video-box" data-video="<11-character YouTube id>" data-start="95"></div>
   <button type="button" class="key" data-play="<same id>">Play video</button> */
var HX_VIDEO = { box: null, answered: false, timer: 0 };
function hxSendVideo(box) {
  var r = box.getBoundingClientRect();
  var start = parseInt(box.dataset.start || '0', 10);
  send({ type: 'idea:video', videoId: box.dataset.video, start: start > 0 ? start : undefined, clipTop: 0,
    rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
}
function hxPlay(box) {
  HX_VIDEO.box = box;
  hxSendVideo(box);
  clearTimeout(HX_VIDEO.timer);
  HX_VIDEO.timer = setTimeout(function () {
    if (HX_VIDEO.answered) return;
    var key = document.createElement('button');
    key.type = 'button'; key.className = 'key'; key.textContent = 'Watch on YouTube, new tab';
    key.addEventListener('click', function () {
      var w = window.open('https://www.youtube.com/watch?v=' + box.dataset.video + '&t=' + (box.dataset.start || 0) + 's', '_blank');
      if (w) w.opener = null;
    });
    box.textContent = 'The video did not open here. ';
    box.appendChild(key);
  }, 1500);
}
function hxStopVideo() {
  if (!HX_VIDEO.box) return;
  HX_VIDEO.box = null;
  send({ type: 'idea:video', videoId: null });
}
/* Called by hxQueueLayout: keep the player on its box, and stop it when the box is hidden. */
function hxMoveVideo() {
  var box = HX_VIDEO.box;
  if (!box) return;
  if (box.getClientRects().length === 0 || box.getBoundingClientRect().width === 0) return hxStopVideo();
  hxSendVideo(box);
}
addEventListener('message', function (e) {
  if (e.data && e.data.type === 'idea:video-state') HX_VIDEO.answered = true;
});
document.addEventListener('click', function (e) {
  var key = e.target.closest ? e.target.closest('[data-play]') : null;
  var box = key && document.querySelector('[data-video="' + CSS.escape(key.dataset.play) + '"]');
  if (box) hxPlay(box);
});
