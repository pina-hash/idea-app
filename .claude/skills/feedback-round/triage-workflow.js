export const meta = {
  name: 'feedback-triage',
  description: 'Ground a feedback round against the tree: one read-only investigator per report cluster',
  whenToUse: 'Step 3 of the feedback-round skill, after reports.txt exists and the reports are clustered',
  phases: [{ title: 'Ground', detail: 'one agent per cluster, read-only, file:line evidence' }],
}

// Run with the Workflow tool:
//   Workflow({ scriptPath: '.claude/skills/feedback-round/triage-workflow.js', args: {
//     reports: '<scratchpad>/reports.txt',
//     head: '<short sha of origin/main>',
//     clusters: [{ key: 'scroll', ids: 'R07, R29', focus: '<what to look for and the suspects you already know>' }, ...],
//   }})
// Returns one object per cluster in the shape below. The session turns the result into
// TRIAGE.md with the renderer in SKILL.md, so the committed record and this schema agree.

const A = args || {}
if (!A.reports || !Array.isArray(A.clusters) || A.clusters.length === 0) {
  throw new Error('feedback-triage needs args.reports (path to reports.txt) and args.clusters (non-empty)')
}

const SCHEMA = {
  type: 'object',
  properties: {
    cluster: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: {
      report: { type: 'string', description: 'R-number(s)' },
      verdict: { type: 'string', enum: ['already-shipped', 'bug-confirmed', 'bug-suspected', 'buildable-feature', 'needs-decision', 'conflicts-with-rule', 'not-reproducible'] },
      summary: { type: 'string', description: 'what the report asks, in one or two plain sentences' },
      evidence: { type: 'string', description: 'what the code actually does, with file:line citations' },
      root_cause_or_approach: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      migration_needed: { type: 'string', description: 'no / maybe / yes, and why' },
      decision_question: { type: 'string', description: 'if Mr. Pina must decide: the question plus the default you would pick and why; else empty' },
      size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
      priority: { type: 'string', enum: ['P0-broken-in-class', 'P1', 'P2', 'P3'] },
    }, required: ['report', 'verdict', 'summary', 'evidence', 'files', 'size', 'priority'] } },
    owns_paths: { type: 'array', items: { type: 'string' }, description: 'the file surface a build lane for this cluster would own' },
    overlaps: { type: 'string', description: 'other clusters or surfaces this collides with' },
    notes: { type: 'string' },
  },
  required: ['cluster', 'items', 'owns_paths'],
}

log(`${A.clusters.length} clusters against ${A.head || 'HEAD'}`)

const results = await parallel(A.clusters.map(c => () => agent(
  `You are grounding user feedback against the idea-app repository (HEAD ${A.head || 'as checked out'}). READ-ONLY: do not edit, commit, run the dev server or run the test suite. Use grep, reading files, git log, docs/history and docs/decisions.

The feedback set is in ${A.reports} (read it; screenshots listed there can be opened with Read). Your cluster is "${c.key}", reports ${c.ids}.
Focus: ${c.focus}

For every report in your cluster, establish from the CODE what is true today, not from the report and not from CLAUDE.md prose alone. CLAUDE.md sentences are claims; verify the ones you lean on. Roughly half of feedback items turn out already built somewhere, so search before concluding something is missing, and cite file:line. For a bug, find the root cause if you can, or else the narrowest suspect set plus exactly how a session would reproduce it in a /dev harness. For a big ask, say what a first bundle could safely build with no migration, what needs one, and what is genuinely Mr. Pina's decision (with the default you would pick and why). Name any CLAUDE.md rule or docs/decisions entry the ask collides with or reverses. Keep prose tight; it feeds a prompt writer. Never write a student's name.`,
  { label: `ground:${c.key}`, phase: 'Ground', schema: SCHEMA },
)))

const done = results.filter(Boolean)
if (done.length < A.clusters.length) log(`${A.clusters.length - done.length} cluster(s) returned nothing; re-run them before writing TRIAGE.md`)
return done
