/**
 * THE MINIMAL TEAM DOCUMENT (ledger 0436): one worksheet that exercises every
 * part of the team contract in `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md`
 * section 16, and the fixture the `/dev/team-document` harness and the tests
 * mount. It is plain data and a string, client-safe, with no network and no
 * dependency: an author can copy it whole and grow it.
 *
 * What it shows, in order of the spec section:
 *   - `team.roles`: four subsystem roles, declared once;
 *   - a `team` module (one answer per box per team) and four `role` modules
 *     (each owned by the role's owner in the team plan);
 *   - an `individual` module, each student's own;
 *   - `taskPoints` and `machine` on blocks, which seed the team plan's tasks;
 *   - `team.checkpoints`, the four sign-offs and their checklists;
 *   - the bridge: `idea:field-focus` and `idea:field-blur` up, and
 *     `idea:team-state` and `idea:team-tracker` down, with a field that is not
 *     the student's drawn read only with the teammate's name beside it.
 */

const LEVELS = (top: number, short: [string, string, string]) => [
	{ points: top, label: 'Complete', short: short[0], descriptor: 'Every part the box asks for is present and labeled.' },
	{ points: Math.round(top / 2), label: 'Developing', short: short[1], descriptor: 'About half of what the box asks for is present.' },
	{ points: 0, label: 'Absent', short: short[2], descriptor: 'The box is empty or off topic.' }
];

export const TEAM_FIXTURE_ROLES = [
	{ id: 'frame', title: 'Frame and mount' },
	{ id: 'energy', title: 'Energy store' },
	{ id: 'drive', title: 'Drive' },
	{ id: 'ballpath', title: 'Ball path' }
] as const;

export const TEAM_FIXTURE_MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Launcher plan (fixture)',
	course: 'IDEA209H',
	points: 100,
	team: {
		roles: TEAM_FIXTURE_ROLES.map((r) => ({ ...r })),
		checkpoints: [
			{
				id: 'plan',
				title: 'Plan',
				date: '2026-10-28',
				items: [
					{ id: 'owners', kind: 'auto', check: 'plan-owners', text: 'Every task has an owner and a due date' },
					{ id: 'roles', kind: 'auto', check: 'roles-owned', text: 'Every role has an owner' },
					{ id: 'balance', kind: 'auto', check: 'plan-balanced', text: 'The plan balances' },
					{
						id: 'role-fields',
						kind: 'auto',
						check: 'blocks-complete',
						blocks: ['frame-req', 'energy-req', 'drive-req', 'ballpath-req'],
						text: "Each role's requirement and sketch fields are complete"
					},
					{ id: 'interfaces', kind: 'tap', text: 'The sketches meet at the named interfaces' },
					{ id: 'method', kind: 'tap', ownerOnly: true, text: 'The launch method is a flywheel or a catapult' }
				]
			}
		]
	},
	header: [{ id: 'who', field: 'studentName', type: 'text', prompt: 'Your name' }],
	modules: [
		{
			id: 'goal',
			title: 'Team goal',
			points: 20,
			audience: 'team',
			blocks: [
				{ id: 'goal-text', field: 'goalText', type: 'longText', prompt: 'What will your launcher do?', taskPoints: 12 },
				{ id: 'goal-method', field: 'methodText', type: 'text', prompt: 'Flywheel or catapult?', taskPoints: 8 }
			],
			criteria: [{ id: 'c1', text: 'Goal and method', points: 20, levels: LEVELS(20, ['Goal and method stated', 'One of the two', 'Neither stated']) }]
		},
		...TEAM_FIXTURE_ROLES.map((r) => ({
			id: `${r.id}-mod`,
			title: r.title,
			points: 15,
			audience: 'role' as const,
			role: r.id,
			blocks: [
				{
					id: `${r.id}-req`,
					field: `${r.id}Req`,
					type: 'longText' as const,
					prompt: `${r.title}: requirement and sketch notes`,
					...(r.id === 'frame' ? { machine: 'router' } : r.id === 'drive' ? { machine: 'printer' } : {})
				}
			],
			criteria: [{ id: 'c1', text: `${r.title} requirement`, points: 15, levels: LEVELS(15, ['Requirement and sketch', 'Requirement only', 'Nothing usable']) }]
		})),
		{
			id: 'reflect',
			title: 'Your reflection',
			points: 20,
			audience: 'individual',
			blocks: [{ id: 'reflect-text', field: 'reflectText', type: 'longText', prompt: 'What did you learn today?' }],
			criteria: [{ id: 'c1', text: 'Reflection', points: 20, levels: LEVELS(20, ['Names a lesson and a change', 'Names a lesson', 'Nothing usable']) }]
		}
	]
};

/** Field to block id, as a parent builds it from the stored manifest. */
export const TEAM_FIXTURE_FIELDS: Record<string, string> = Object.fromEntries([
	...TEAM_FIXTURE_MANIFEST.header.map((b) => [b.field, b.id]),
	...TEAM_FIXTURE_MANIFEST.modules.flatMap((m) => m.blocks.map((b) => [b.field, b.id]))
]);

/**
 * The document. Plain inline script, no network: the bridge it speaks is
 * exactly the spec's, so it doubles as the reference implementation.
 */
export function teamFixtureHtml(): string {
	const m = TEAM_FIXTURE_MANIFEST;
	const box = (field: string, label: string, long: boolean) =>
		`<div class="box" data-box="${field}"><label for="${field}">${label}</label>` +
		`<span class="who" data-who="${field}"></span>` +
		(long
			? `<textarea id="${field}" data-field="${field}" rows="3"></textarea>`
			: `<input id="${field}" data-field="${field}" type="text">`) +
		`</div>`;
	const sections = m.modules
		.map(
			(mod) =>
				`<section class="mod" data-audience="${mod.audience}"><h2>${mod.title}</h2>` +
				mod.blocks.map((b) => box(b.field, b.prompt ?? b.field, b.type === 'longText')).join('') +
				`</section>`
		)
		.join('');
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${m.title}</title>
<style>
:root{color-scheme:dark;--bg:#14181c;--panel:#1d2329;--line:#36414b;--text:#e8ecef;--dim:#9aa6b1;--green:#3fb37f;--amber:#d9a441}
:root[data-theme=light]{color-scheme:light;--bg:#f3f5f7;--panel:#fff;--line:#c9d1d8;--text:#1c2228;--dim:#56616c}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px;color:var(--dim);text-transform:uppercase;letter-spacing:.04em}
.team{color:var(--dim);margin:0 0 12px}
.mod{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 12px}
.box{display:grid;gap:4px;margin:0 0 10px}
label{font-weight:600}
textarea,input{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;width:100%;box-sizing:border-box}
[readonly]{opacity:.75}
.who{font-size:13px;color:var(--amber);min-height:1em}
.who.mine{color:var(--green)}
#tracker{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 12px;display:none}
#tracker.on{display:block}
#tracker li{margin:2px 0}
</style></head><body>
<h1>${m.title}</h1>
<p class="team" id="team">Waiting for your team.</p>
<section id="tracker" aria-label="Your team's tracker"><h2>Your tracker</h2><p id="tracker-sum"></p><ul id="tracker-list"></ul></section>
${box('studentName', 'Your name', false)}
${sections}
<script type="application/json" id="idea-manifest">${JSON.stringify(m)}</script>
<script>
(function(){
  var send=function(msg){parent.postMessage(msg,'*')};
  var fields=[].slice.call(document.querySelectorAll('[data-field]'));
  var focused=null, base={}, team={};
  function apply(){
    fields.forEach(function(el){
      var f=el.getAttribute('data-field'), t=team[f];
      var ro=base.readOnly || (t && t.state!=='free' && t.state!=='mine');
      if(ro) el.setAttribute('readonly',''); else el.removeAttribute('readonly');
      var who=document.querySelector('[data-who="'+f+'"]');
      if(!who) return;
      who.className='who'+(t&&t.state==='mine'?' mine':'');
      who.textContent=!t?'':t.state==='held'?(t.by+' is editing'):t.state==='owned'?('Belongs to '+t.by):t.state==='unowned'?'No owner yet: choose one in your team plan':t.state==='closed'?'Past due, read only':t.state==='mine'?'You are editing':'';
    });
  }
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type==='idea:state'){
      base=d;
      fields.forEach(function(el){
        var f=el.getAttribute('data-field');
        if(el===focused) return;
        var v=d.values[f];
        el.value=(typeof v==='string')?v:'';
      });
      apply();
      send({type:'idea:height',px:document.documentElement.scrollHeight});
    } else if(d.type==='idea:team-state'){
      team=d.fields||{};
      document.getElementById('team').textContent=d.team+(d.me?(', you are '+d.me):'');
      apply();
    } else if(d.type==='idea:team-tracker'){
      var box=document.getElementById('tracker');
      box.className='on';
      document.getElementById('tracker-sum').textContent=d.summary||'';
      var ul=document.getElementById('tracker-list'); ul.innerHTML='';
      (d.tasks||[]).forEach(function(t){var li=document.createElement('li');li.textContent=t.title+' ('+t.owner+', '+t.status+')';ul.appendChild(li);});
      send({type:'idea:height',px:document.documentElement.scrollHeight});
    } else if(d.type==='idea:theme'){
      document.documentElement.setAttribute('data-theme',d.theme);
    }
  });
  fields.forEach(function(el){
    var f=el.getAttribute('data-field');
    el.addEventListener('focus',function(){focused=el;send({type:'idea:field-focus',field:f});});
    el.addEventListener('blur',function(){if(focused===el)focused=null;send({type:'idea:field-blur',field:f});});
    el.addEventListener('input',function(){if(el.hasAttribute('readonly'))return;send({type:'idea:change',field:f,value:el.value});});
  });
  send({type:'idea:ready',schemaVersion:3});
})();
</script>
</body></html>`;
}
