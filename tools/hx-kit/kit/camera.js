/* hx-kit: a phone hands in a photo straight from its camera (Mr. Pina, 2026-10-26:
   "students should be able to just take their phone out and take the picture within the
   HTML"). Runs after bridge.js and kit.js; nothing for an author to write.

   - Every picture box's Choose key gets a twin, "Take photo", shown only on a touch screen
     (pointer: coarse). It opens the camera directly (capture="environment" on the box's own
     file input, set for that one press). Choose photo still opens the library, so a photo
     taken earlier also works. On a computer the twin stays hidden.
   - A big photo is shrunk before it is sent: longest side 2400 px, JPEG at 0.85. A 12 MP
     phone photo of a sketch is 3 to 6 MB; this sends a few hundred KB, which is what makes
     it land on school Wi-Fi. A file that is not a picture, a small picture, or a format this
     browser cannot draw (HEIC outside Safari) is sent untouched. */
var HX_CAMERA_MAX_SIDE = 2400;
var HX_CAMERA_SHRINK_OVER = 1500000; /* bytes */
function hxCameraInputs() {
  return Array.prototype.slice.call(document.querySelectorAll('input[type="file"][data-field]')).filter(function (i) {
    return /image/.test(i.getAttribute('accept') || '');
  });
}
function hxCameraKeys() {
  hxCameraInputs().forEach(function (input) {
    var field = input.getAttribute('data-field');
    document.querySelectorAll('[data-choose="' + CSS.escape(field) + '"]').forEach(function (choose) {
      if (choose.previousElementSibling && choose.previousElementSibling.hasAttribute('data-capture')) return;
      var key = document.createElement('button');
      key.type = 'button';
      key.className = choose.className + ' hx-capture';
      key.setAttribute('data-capture', field);
      key.setAttribute('data-edits', '');
      key.textContent = 'Take photo';
      choose.parentNode.insertBefore(key, choose);
    });
  });
}
document.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('[data-capture]') : null;
  if (!t || HX.readOnly) return;
  var field = t.getAttribute('data-capture');
  var input = hxRoot(field);
  if (!input) return;
  HX.lastBox = field;
  input.setAttribute('capture', 'environment');
  input.click();
  setTimeout(function () { input.removeAttribute('capture'); }, 1000);
});
function hxCameraShrink(file, done) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size <= HX_CAMERA_SHRINK_OVER) return done(file);
  var url = URL.createObjectURL(file);
  var img = new Image();
  img.onload = function () {
    URL.revokeObjectURL(url);
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return done(file);
    var k = Math.min(1, HX_CAMERA_MAX_SIDE / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(function (blob) {
      if (!blob || blob.size >= file.size) return done(file);
      var name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      try { done(new File([blob], name, { type: 'image/jpeg' })); }
      catch (err) { blob.name = name; done(blob); }
    }, 'image/jpeg', 0.85);
  };
  img.onerror = function () { URL.revokeObjectURL(url); done(file); };
  img.src = url;
}
/* Capture phase: runs before bridge.js's own change listener, which it replaces for a
   picture that needs shrinking. */
document.addEventListener('change', function (e) {
  var input = e.target;
  if (!input || input.type !== 'file' || !input.dataset.field) return;
  var file = input.files && input.files[0];
  if (!file || !/^image\//.test(file.type) || file.size <= HX_CAMERA_SHRINK_OVER) return;
  e.stopImmediatePropagation();
  input.value = '';
  var field = input.dataset.field;
  hxNote(field, 'Getting the photo ready', false);
  hxCameraShrink(file, function (out) { hxAttach(field, out); });
}, true);
hxCameraKeys();
