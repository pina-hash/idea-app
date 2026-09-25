#!/usr/bin/env python3
"""Render a feedback round's triage into the committed record, and refuse to leak.

    python3 tools/feedback_triage_md.py <out dir> <triage.json> <TRIAGE.md> <export label>

<out dir> is where tools/feedback_digest.py wrote reports.txt and identities.txt.
<triage.json> is the list .claude/skills/feedback-round/triage-workflow.js returned.
<TRIAGE.md> is written only if NO identity from identities.txt appears in it,
matched case-insensitively as a whole word. A hit prints the offending lines and
exits 1 without writing: the repository is public and these are student records.
"""

import json
import os
import re
import sys


def render(reports, triage, label):
    out = [f"""# Feedback round: triage against the tree

- Source: the admin feedback export {label}. **The archive itself is NOT committed**: it
  carries student names and addresses and this repository is public. Reporters are named by
  role only (the owner excepted); the report `id` is the join key back to `app_feedback`.
- Every "evidence" line below is a CLAIM with a file:line, made by a read-only investigator.
  A build session verifies it before relying on it.

## The reports, verbatim

```
{reports.rstrip()}
```

## Findings by cluster
"""]
    for c in triage:
        out.append(f"\n### Cluster: {c['cluster']}\n")
        for it in c['items']:
            out.append(f"\n#### {it['report']} -- {it['verdict']} (size {it['size']}, {it['priority']})\n")
            out.append(f"**Ask.** {it['summary']}\n\n**Evidence.** {it['evidence']}\n\n"
                       f"**Root cause / approach.** {it.get('root_cause_or_approach', '')}\n\n"
                       f"**Migration.** {it.get('migration_needed', '')}\n")
            if it.get('decision_question'):
                out.append(f"\n**Decision owed.** {it['decision_question']}\n")
            out.append('\n**Files.** ' + ', '.join(f'`{f}`' for f in it.get('files', [])) + '\n')
        out.append('\n**Owns (if built as a lane).** ' + ', '.join(f'`{p}`' for p in c.get('owns_paths', [])) + '\n')
        if c.get('overlaps'):
            out.append(f"\n**Overlaps.** {c['overlaps']}\n")
        if c.get('notes'):
            out.append(f"\n**Notes.** {c['notes']}\n")
    return ''.join(out)


def main(argv):
    if len(argv) != 5:
        print(__doc__.strip().splitlines()[2].strip())
        return 2
    out_dir, triage_path, dest, label = argv[1:]
    with open(os.path.join(out_dir, 'reports.txt'), encoding='utf-8') as f:
        reports = f.read()
    with open(triage_path, encoding='utf-8') as f:
        triage = json.load(f)
    if isinstance(triage, dict) and 'result' in triage:
        triage = triage['result']
    with open(os.path.join(out_dir, 'identities.txt'), encoding='utf-8') as f:
        idents = [l.strip() for l in f if l.strip()]
    text = render(reports, triage, label)
    hits = []
    for ident in idents:
        pat = re.compile(r'(?<![\w@.])' + re.escape(ident) + r'(?![\w@])', re.IGNORECASE)
        for n, line in enumerate(text.splitlines(), 1):
            if pat.search(line):
                hits.append((ident, n, line.strip()[:120]))
    if hits:
        print(f'REFUSED: {len(hits)} identity hit(s); {dest} was not written.', file=sys.stderr)
        for ident, n, line in hits[:20]:
            print(f'  line {n}: [{ident}] {line}', file=sys.stderr)
        return 1
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(text)
    items = sum(len(c['items']) for c in triage)
    print(f'wrote {dest}: {len(triage)} clusters, {items} items, 0 identity hits against {len(idents)} identities')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
