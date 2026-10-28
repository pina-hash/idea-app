import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
# ROTATION 2 | SURVEY on the kit. Writes rotation-2-survey.src.html beside itself
# (or the path given as the first argument). Standard 2.15 G8: seven required answers,
# a "You're done" line, then optional depth on steps marked data-optional.
# Every block id, prompt, type and point value is the live draft's, read from the
# post on 2026-10-27 (get_post); value meanings are R1's: a rating is "1".."10"
# ("1".."9" for pace) or "skip", an award is the item id.
ITEMS = [  # (key, title, line, section, main)
 ('dogtag','Your dogtag','Designed in xTool Studio and cut on the MetalFab laser.','start',True),
 ('sw-day','SolidWorks Day','Your first day modeling in SolidWorks.','start',True),
 ('orientation','Orientation day','The room, the shop rules and how class runs.','start',True),
 ('hook-design','Designing your hook','V1 and V2 of your hook in SolidWorks.','hook',True),
 ('printing','Printing it yourself','Slicing and running the Bambu printers.','hook',True),
 ('pull','The half-scale pull test','Pulling your half-size hook apart on the rig.','hook',True),
 ('hook-bracket','The Hook tournament','Bracket day. First hook to break loses.','hook',True),
 ('research','Research and concepts','Past hooks, then your concept sketches.','hook',False),
 ('sim','Simulation','Running the study and finding the red on the plot.','hook',False),
 ('print-video','The printing video','The video on slicing and printing your part.','hook',False),
 ('blade-sketch','The team sketch','Your team’s sketch of the parts you would make.','bdesign',True),
 ('blade-design','Modeling your part','Your blade, body or assembly in SolidWorks.','bdesign',True),
 ('armory','IDEA Armory','Opening, checking out and checking in your team’s files.','bdesign',True),
 ('blade-videos','Mr. Pina’s Blade videos','The videos inside the IDEA-Blade assignments.','bdesign',False),
 ('nav-views','Day, Step or List','Moving through the assignment pages.','bdesign',False),
 ('blade-build','Building it','Printing, assembling and spinning your Blade.','bbuild',True),
 ('blade-bracket','The Blade tournament','Fight day: the Blade bracket.','bbuild',True),
 ('team','Your Blade team','Working with your team from sketch to fight.','bbuild',True),
 ('inspection','Measuring and inspection','Calipers, the scale and inspection before the fight.','bbuild',False),
 ('slide','Your team’s slide','Your team’s slide in the class deck.','bbuild',False),
 ('classroom','IDEA Classroom','The site where your assignments live.','around',True),
 ('tas','The TAs','The TAs who helped in class.','around',False),
 ('open-shop','Open shop','Shop time outside your class block.','around',False),
 ('coins','IDEA Coins','Earning and spending IDEA Coins.','around',False),
]
LIVE=['dogtag', 'sw-day', 'orientation', 'hook-design', 'printing', 'pull', 'hook-bracket', 'research', 'sim', 'print-video', 'blade-sketch', 'blade-design', 'armory', 'blade-build', 'blade-bracket', 'team', 'blade-videos', 'nav-views', 'inspection', 'slide', 'classroom', 'tas', 'open-shop', 'coins']
LIKE=['','Nope','Rough','Not great','Meh','Fine','Decent','Good','Really good','Great','Loved it']
LIKELY=['','No chance','Doubt it','Probably not','Leaning no','Could go either way','Maybe','Leaning IDEA','Probably IDEA','Almost sure','IDEA, done']
PACE=['','Way too slow','Too slow','A bit slow','A touch slow','Just right','A touch fast','A bit fast','Too fast','Way too fast']

def L(top,half,lo):
    pass

manifest={"schemaVersion":3,"kind":"html-assignment","title":"Rotation Survey","course":"IDEA100","points":10,
 "thumbnail":{"kind":"html","template":"idea-thumbnail"},
 "modules":[
  {"id":"sv2-survey","title":"Rotation Survey","points":10,"audience":"individual",
   "blocks":[
     {"id":"sv2-overall-r","field":"r-overall","type":"radio","prompt":"The rotation overall, 1 to 10"},
     {"id":"sv2-pace-r","field":"r-pace","type":"radio","prompt":"The pace, 1 way too slow to 9 way too fast"},
     {"id":"sv2-pathway-r","field":"r-pathway","type":"radio","prompt":"How likely you are to pick IDEA, 1 to 10"},
     {"id":"sv2-award-fun","field":"a-fun","type":"text","prompt":"Award: most fun"},
     {"id":"sv2-award-learned","field":"a-learned","type":"text","prompt":"Award: learned the most"},
     {"id":"sv2-award-hard","field":"a-hard","type":"text","prompt":"Award: hardest"},
     {"id":"sv2-keep-c","field":"c-keep","type":"longText","prompt":"What should stay exactly as it is","optional":True},
     {"id":"sv2-change-c","field":"c-change","type":"longText","prompt":"What should change for the next rotation","optional":True},
     {"id":"sv2-else-c","field":"c-else","type":"longText","prompt":"Anything else","optional":True}]
    +[b for k,t,_,_,m in sorted(ITEMS,key=lambda i: LIVE.index(i[0])) for b in (
      {"id":"sv2-%s-r"%k,"field":"r-%s"%k,"type":"radio","prompt":"Rating: %s"%t,"optional":True},
      {"id":"sv2-%s-c"%k,"field":"c-%s"%k,"type":"longText","prompt":"Comment: %s"%t,"optional":True})],
   "criteria":[
    {"id":"scales","text":"The three scales are set","points":4,"levels":[
     {"points":4,"label":"Complete","short":"All three set","descriptor":"The overall, pace and pathway scales all have an answer. Which number does not change the score."},
     {"points":2,"label":"Developing","short":"One or two set","descriptor":"One or two of the three scales have an answer."},
     {"points":0,"label":"Absent","short":"None set","descriptor":"None of the three scales has an answer."}]},
    {"id":"awards","text":"The three awards are picked","points":3,"levels":[
     {"points":3,"label":"Complete","short":"All three picked","descriptor":"Most fun, learned the most and hardest each have a pick."},
     {"points":2,"label":"Developing","short":"One or two picked","descriptor":"One or two of the three awards have a pick."},
     {"points":0,"label":"Absent","short":"None picked","descriptor":"No award has a pick."}]},
    {"id":"words","text":"One answer in your own words","points":3,"levels":[
     {"points":3,"label":"Complete","short":"Five or more words","descriptor":"At least one of keep, change or anything else holds five or more words. What it says does not change the score."},
     {"points":1,"label":"Developing","short":"One to four words","descriptor":"The longest of the three answers is one to four words."},
     {"points":0,"label":"Absent","short":"Nothing written","descriptor":"All three boxes are empty."}]}]}]}

def scale(field, legend, words, n=10, skip=True, label=''):
    keys=''.join('<label><input type="radio" name="%s" value="%d" aria-label="%d, %s"><span>%d</span></label>'%(field,i,i,words[i],i) for i in range(1,n+1))
    sk='<label class="sv-skip"><input type="radio" name="%s" value="skip"><span>Didn\u2019t do it</span></label>'%field if skip else ''
    head='<legend>%s</legend>'%legend if legend else ''
    aria='' if legend else ' aria-label="%s"'%label
    return ('<fieldset class="hx-scale" data-field="%s" data-kind="radio"%s>%s%s%s'
            '<p class="hx-scale-ends"><span>1 %s</span><span>%d %s</span></p></fieldset>')%(field,aria,head,keys,sk,words[1],n,words[n])

def tile(k,t,line,optional):
    opt=' data-optional' if optional else ''
    return ('<li class="hx-tile"%s><h3>%s</h3><p class="hx-muted hx-small">%s</p>%s'
            '<details class="hx-more"><summary>Say more</summary><textarea class="idea-well" data-field="c-%s" data-optional rows="2" placeholder="What made it good or bad, and what you would change"></textarea></details></li>'
            )%(opt,t,line,scale('r-%s'%k,'',LIKE,label='Your rating: %s'%t).replace('<fieldset class="hx-scale"','<fieldset class="hx-scale"'+opt),k)

def section(sec):
    main=[i for i in ITEMS if i[3]==sec and i[4]]; extra=[i for i in ITEMS if i[3]==sec and not i[4]]
    h='<ul class="hx-tiles">'+''.join(tile(k,t,l,True) for k,t,l,_,_ in main)+'</ul>'
    if extra:
        h+=('<details class="hx-more"><summary>More from this part</summary>'
            '<ul class="hx-tiles">'+''.join(tile(k,t,l,True) for k,t,l,_,_ in extra)+'</ul></details>')
    h+='<p class="hx-readout" data-count="%s" aria-live="polite"></p>'%sec
    return h

HOW=('<ol class="hx-do"><li><span>Everything from here on is optional. Rate as many cards as you like: <strong>1</strong> (not for you) to <strong>10</strong> (loved it), or <strong>Didn\u2019t do it</strong>.</span></li>'
     '<li><span><strong>Say more</strong> under any card. This is the part that changes what next rotation looks like.</span></li></ol>')

def step(sid,title,body,eyebrow='Your ratings',lead='',tag='Quick',optional=False):
    full=' data-layout="full"' if 'hx-tiles' in body else ''
    return ('<section class="hx-step idea-panel" id="%s" data-phase="survey" data-title="%s"%s%s><div class="hx-step-head"><div><span class="hx-phase-tag">%s</span><h2>%s</h2></div></div>'
            '<div class="hx-step-body">%s<div class="hx-evidence idea-panel"><span class="idea-eyebrow">%s</span>%s</div></div></section>')%(sid,title,full,' data-optional' if optional else '',tag,title,lead,eyebrow,body)

STUCK=('<details class="hx-stuck"><summary>Is this anonymous?</summary><table><tr><td>Does Mr. Pina see my name?</td><td>Yes. This is not anonymous.</td></tr>'
       '<tr><td>Can a low rating hurt me?</td><td>No. You get full credit for finishing, whatever you say. A low rating with a reason is the most useful answer here.</td></tr></table></details>')
def bigtile(field,title,words,n):
    return '<li class="hx-tile"><h3>%s</h3>%s</li>'%(title,scale(field,'Your answer',words,n,skip=False))
def award(f,line):
    opts='<option value="">Pick one</option>'+''.join('<option value="%s">%s</option>'%(k,t) for k,t,_,_,_ in sorted(ITEMS,key=lambda i: LIVE.index(i[0])))
    return '<label>%s<select class="idea-well idea-well--select" data-field="a-%s">%s</select></label>'%(line,f,opts)
S=[]
S.append(step('s-big','The big picture','<ul class="hx-tiles">'+bigtile('r-overall','The rotation, overall',LIKE,10)
   +bigtile('r-pace','The pace: 1 way too slow, 5 just right, 9 way too fast',PACE,9)
   +bigtile('r-pathway','How likely are you to pick IDEA as your pathway?',LIKELY,10)+'</ul><p class="hx-readout" data-count="scales" aria-live="polite"></p>','Your answers'))
S.append(step('s-awards','Three awards','<div class="hx-stack">'+award('fun','Most fun')+award('learned','Learned the most')+award('hard','Hardest')+'</div><p class="hx-readout" data-count="awards" aria-live="polite"></p>','Your awards',
   lead='<div class="hx-stack"><ol class="hx-do"><li><span>Pick one part of the rotation for each award.</span></li><li><span>The same part can win more than one.</span></li></ol></div>'))
S.append(step('s-words','In your words',
   '<div data-any-one><p class="hx-any-note">Answer any one of these three.</p><label>What should stay exactly as it is?<textarea class="idea-well" data-field="c-keep" data-optional rows="3" placeholder="Keep ... because ..."></textarea></label>'
   '<label>What should change for the next rotation?<textarea class="idea-well" data-field="c-change" data-optional rows="3" placeholder="Change ... to ..."></textarea></label>'
   '<label>Anything else?<textarea class="idea-well" data-field="c-else" data-optional rows="3" placeholder="Anything we did not ask"></textarea></label></div>'
   '<p class="hx-readout" data-count="words" aria-live="polite"></p>','Your answers',
   lead='<div class="hx-stack"><ol class="hx-do"><li><span>Answer at least one of the three.</span></li><li><span>One sentence is enough.</span></li></ol><p class="hx-see"><strong>You\u2019re done</strong> once one box has your words. Everything after this step is optional.</p></div>'))
S.append(step('s-start','Start of the rotation',section('start'),lead='<div class="hx-stack">'+HOW+'</div>',tag='Optional',optional=True))
S.append(step('s-hook','The Hook',section('hook'),tag='Optional',optional=True))
S.append(step('s-bdesign','IDEA-Blade: design',section('bdesign'),tag='Optional',optional=True))
S.append(step('s-bbuild','IDEA-Blade: build and fight',section('bbuild'),tag='Optional',optional=True))
S.append(step('s-around','Around the class',section('around'),tag='Optional',optional=True))

SHELL=r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotation Survey</title>
<!--
  ROTATION 2 | SURVEY, IDEA100 Section 2, rebuilt on hx-kit for the 2.10 look (2026-10-27).
  Block ids are the draft's. 2026-10-27 evening, Mr. Pina: "quick to fill out and optional
  depth": seven answers are required (three scales, three awards, one sentence), and every
  rating card and comment is optional. Value meanings are Rotation 1's: a rating is "1" to
  "10" ("1" to "9" for pace) or "skip", an award is the item's id.
  Look: one phase, Survey, in magenta from the kit's linking set (no real-world meaning;
  neither neighbor uses it: IDEA-Blade 02 is steel, spark and Slides yellow). The header
  draws three things from the rotation: the dogtag, the hook and a Blade.
  Generated by gen.py beside this file.
-->
<script type="application/json" id="idea-manifest">
%%MANIFEST%%
</script>
<!-- hx:head -->
<style>
  /* "Didn't do it" is the last key of a rating, on its own row. */
  .hx-scale > label.sv-skip { flex-basis: 100%; }
  /* An optional step's ratings do not count toward the grade (kit gap, reported 2026-10-28). */
  .hx-step[data-optional] .hx-evidence > .idea-eyebrow::after { content: ' · optional, does not change your grade'; }
</style>
<template id="idea-thumbnail">
<style>
  :root { --a: #3a1430; --b: #140712; --word: #f6eef3; --cap: #e7a9cf; --key: #2a1a24; --lit: #e85fb8; }
  :root[data-idea-scheme="light"] { --a: #fae6f2; --b: #efc9df; --word: #241020; --cap: #7d2a5f; --key: #ffffff; --lit: #b0307f; }
  .t { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5%; background: radial-gradient(ellipse at 30% 50%, var(--a), var(--b) 85%); }
  .t svg { height: 60%; flex: none; }
  .w { display: none; font: 700 clamp(13px, 26vh, 24px)/1.05 Rajdhani, "Segoe UI", system-ui, sans-serif; color: var(--word); white-space: nowrap; }
  .w small { display: block; font: 400 .6em/1.2 "Share Tech Mono", ui-monospace, monospace; color: var(--cap); letter-spacing: .16em; text-transform: uppercase; margin-top: .35em; }
  :root[data-idea-shape="wide"] .t, :root[data-idea-shape="banner"] .t { justify-content: center; padding: 0 5%; box-sizing: border-box; }
  :root[data-idea-shape="wide"] .w, :root[data-idea-shape="banner"] .w { display: block; }
</style>
<div class="t">
  <svg viewBox="0 0 250 60" aria-hidden="true">
    <g fill="var(--key)" stroke="var(--cap)" stroke-width="2"><rect x="2" y="12" width="40" height="36" rx="6"/><rect x="52" y="12" width="40" height="36" rx="6"/><rect x="102" y="12" width="40" height="36" rx="6"/><rect x="152" y="12" width="40" height="36" rx="6" fill="var(--lit)" stroke="var(--lit)"/><rect x="202" y="12" width="40" height="36" rx="6"/></g>
    <g font-family="Share Tech Mono, monospace" font-size="18" text-anchor="middle" fill="var(--word)"><text x="22" y="37">1</text><text x="72" y="37">4</text><text x="122" y="37">7</text><text x="172" y="37">9</text><text x="222" y="37">10</text></g>
  </svg>
  <div class="w"><span>Rotation Survey</span><small>About two minutes</small></div>
</div>
</template>
</head>
<body class="idea-plate">
<main id="hx-page">
  <header class="hx-hero">
    <div class="hx-hero-text">
      <span class="hx-crumb">IDEA100 · Last class</span>
      <h1>Rotation Survey</h1>
      <p class="hx-done-when"><strong>Done when:</strong> three scales set, three awards picked and one sentence written. About two minutes.</p>
      <div class="hx-row">
        <span class="idea-chip">Required: 7 answers</span>
        <span class="idea-chip">Optional: rate each part</span>
      </div>
      <p class="hx-note">Not anonymous, and it cannot hurt you: full credit for finishing, whatever you say.</p>
    </div>
    <div class="hx-hero-art" data-color="magenta" aria-hidden="true">
      <svg viewBox="0 0 320 160">
        <rect x="20" y="40" width="70" height="96" rx="12" fill="var(--hx-wash)" stroke="var(--hx-ink)" stroke-width="2.5"/>
        <circle cx="55" cy="56" r="6" fill="none" stroke="var(--hx-ink)" stroke-width="2.5"/>
        <path d="M36 92 H74 M36 106 H66" stroke="var(--hx-ink)" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M128 36 V96 a26 26 0 1 0 52 0 V86" fill="none" stroke="var(--plate-ink)" stroke-width="7" stroke-linecap="round"/>
        <rect x="118" y="24" width="20" height="14" rx="3" fill="var(--panel-top)" stroke="var(--plate-ink)" stroke-width="2.5"/>
        <path d="M262 52 L276 72 L300 70 L284 88 L292 112 L268 102 L250 118 L248 94 L226 84 L248 74 Z" fill="var(--hx-fill)" stroke="var(--hx-line)" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="262" cy="86" r="7" fill="var(--panel-top)" stroke="var(--plate-ink)" stroke-width="2.5"/>
      </svg>
    </div>
  </header>
  <nav class="hx-plan idea-panel" id="hx-plan" aria-label="Classes in this assignment"></nav>
  <div class="hx-bar idea-panel" id="hx-bar"></div>
  <p class="hx-banner-failed" id="hx-failed" role="alert" hidden></p>
%%STEPS%%
</main>
<script type="application/json" id="hx-plan-data">
%%PLAN%%
</script>
<!-- hx:script -->
<script id="hx-page-js">
/* The survey's own mirrors (AUTHORING F9): the word for each rating, and how many
   cards each step still needs. Never gates; it runs after the kit. */
var SV_SECTIONS = %%SECTIONS%%;
function svVal(f) { var r = hxRoot(f); return r ? String(hxRead(r) || '').trim() : ''; }
function svRefresh() {
  Object.keys(SV_SECTIONS).forEach(function (sec) {
    var keys = SV_SECTIONS[sec], left = keys.filter(function (k) { return !svVal('r-' + k); }).length;
    var out = document.querySelector('[data-count="' + sec + '"]');
    if (out) { var n = keys.length - left; out.textContent = n ? n + ' of ' + keys.length + ' rated. Thank you.' : 'Optional: rate any you like.'; }
  });
  var sc = document.querySelector('[data-count="scales"]');
  if (sc) {
    var unset = ['r-overall', 'r-pace', 'r-pathway'].filter(function (f) { return !svVal(f); }).length;
    sc.textContent = unset ? unset + ' of 3 scales still to set.' : 'All three scales set.';
    sc.classList.toggle('warn', unset > 0);
  }
  var aw = document.querySelector('[data-count="awards"]');
  if (aw) {
    var left = ['a-fun', 'a-learned', 'a-hard'].filter(function (f) { return !svVal(f); }).length;
    aw.textContent = left ? left + ' of 3 awards still to pick.' : 'All three awards picked.';
    aw.classList.toggle('warn', left > 0);
  }
  var wd = document.querySelector('[data-count="words"]');
  if (wd) {
    var wrote = ['c-keep', 'c-change', 'c-else'].some(function (f) { return svVal(f); });
    wd.textContent = wrote ? 'Thank you. That counts.' : 'Write at least one of the three.';
    wd.classList.toggle('warn', !wrote);
  }
}
document.addEventListener('input', svRefresh);
document.addEventListener('change', svRefresh);
HX.onState.push(svRefresh);
svRefresh();
</script>
</body>
</html>
'''

PLAN={"phases":[{"id":"survey","name":"Survey","color":"magenta","days":[{"label":"Class 7 · Oct 28","short":"Rate the rotation","date":"2026-10-28"}]}]}
WORDS={'like':LIKE,'likely':LIKELY,'pace':PACE}
SECTIONS={sec:[k for k,_,_,s,m in ITEMS if s==sec] for sec in ['start','hook','bdesign','bbuild','around']}

TEMPLATE=SHELL
out=TEMPLATE.replace('%%MANIFEST%%',json.dumps(manifest,ensure_ascii=False,indent=1).replace('<','\\u003c')) \
  .replace('%%STEPS%%','\n'.join(S)).replace('%%PLAN%%',json.dumps(PLAN,ensure_ascii=False,indent=1)) \
   \
  .replace('%%SECTIONS%%',json.dumps(SECTIONS))
open(sys.argv[1] if len(sys.argv)>1 else os.path.join(HERE,'rotation-2-survey.src.html'),'w').write(out)
print('ok',len(out))
