#!/usr/bin/env python3
"""Turn a feedback-console export zip into what a feedback round works from.

    python3 tools/feedback_digest.py <export.zip> <out dir>

Writes, into <out dir> (a SCRATCHPAD, never the repository):

  reports.txt     every report, oldest first, numbered R01.., with the reporter
                  named by ROLE only (the site owner is named, nobody else),
                  plus the path of its screenshot inside <out dir>/archive/
  mark-seen.sql   one paste for the Supabase SQL editor that moves exactly
                  these reports from `new` to `seen`, so the next export filtered
                  to `status: new` does not hand the same reports back
  archive/        the zip, unpacked, so screenshots can be opened with Read
  identities.txt  every reporter name, address and contact string in the export,
                  for tools/feedback_triage_md.py to refuse on. Never committed.

WHY THIS EXISTS. The export carries student names and addresses ("Submitter
identity: INCLUDED") and this repository is public. A session that reads the
raw markdown and then writes a triage file is one careless paste from
committing a student record. So the only text a round works from is this
file's output, and it has already dropped every identity but the owner's.
It does NOT scrub names a reporter typed INSIDE a message; the round's
committed triage still gets a name sweep before it is pushed (the skill says
how).

Standard library only, so it runs in a fresh container before `npm ci`.
"""

import json
import os
import sys
import zipfile

# Mirrors `admin_owner_email()` / ADMIN_OWNER_EMAIL in src/lib/admin.ts, for
# DISPLAY only: it decides whether a reporter is named, never what anyone may do.
OWNER_EMAIL = 'apina@boscotech.edu'
OWNER_LABEL = 'Mr. Pina (owner)'


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip())
        return 2
    zip_path, out_dir = argv[1], argv[2]
    archive_dir = os.path.join(out_dir, 'archive')
    os.makedirs(archive_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(archive_dir)

    index_path = None
    for root, _dirs, files in os.walk(archive_dir):
        if 'index.json' in files:
            index_path = os.path.join(root, 'index.json')
            break
    if not index_path:
        print('no index.json in the archive; is this a feedback-console export?', file=sys.stderr)
        return 1
    base = os.path.dirname(index_path)
    with open(index_path, encoding='utf-8') as f:
        data = json.load(f)

    reports = sorted(data.get('reports', []), key=lambda r: r.get('created_at') or '')
    files = data.get('files', {})
    sections = data.get('sections', {}) or {}

    lines, ids, shots, statuses = [], [], 0, {}
    for i, r in enumerate(reports, 1):
        meta = r.get('meta') or {}
        email = (r.get('submitter_email') or '').strip().lower()
        if email == OWNER_EMAIL:
            who = OWNER_LABEL
        elif r.get('anonymous'):
            who = 'anonymous'
        else:
            who = 'a ' + (meta.get('role') or 'user')
        build = (meta.get('build') or {}).get('value') or 'unknown'
        head = (
            f"R{i:02d} [{r.get('kind')}] app={r.get('app')} path={meta.get('path')} "
            f"by={who} filed={(r.get('created_at') or '')[:16]} build={build} "
            f"viewport={meta.get('viewport')} id={r.get('id')}"
        )
        sec = meta.get('section')
        if sec:
            label = sections.get(sec) if isinstance(sections, dict) else None
            head += f' section={label or sec}'
        entry = [head]
        shot = (files.get(r.get('id')) or {}).get('screenshot')
        if shot:
            shots += 1
            entry.append('  screenshot: ' + os.path.join(base, shot))
        entry.append('  > ' + (r.get('message') or '').replace('\n', '\n  > '))
        if r.get('tried'):
            entry.append('  tried: ' + r['tried'].replace('\n', ' '))
        lines.append('\n'.join(entry))
        ids.append(r.get('id'))
        statuses[r.get('status')] = statuses.get(r.get('status'), 0) + 1

    # Every identity in the export, for tools/feedback_triage_md.py to refuse on.
    # It stays in the scratchpad with the archive and is never committed.
    idents = set()
    for r in reports:
        for key in ('submitter_name', 'submitter_email', 'contact'):
            v = (r.get(key) or '').strip()
            if v and v.lower() != OWNER_EMAIL:
                idents.add(v)
                if key == 'submitter_name':
                    idents.update(p for p in v.split() if len(p) >= 3)
                if key == 'submitter_email':
                    idents.add(v.split('@')[0])
    idents = {i for i in idents if i.upper() not in ('MR.', 'PINA', 'MR. PINA')}
    with open(os.path.join(out_dir, 'identities.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(sorted(idents)) + '\n')

    with open(os.path.join(out_dir, 'reports.txt'), 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(lines) + '\n')

    id_list = ',\n  '.join(f"'{x}'" for x in ids)
    sql = f"""-- Marks the {len(ids)} reports of this feedback round as `seen`, so an
-- export filtered to `status: new` stops returning them. Only rows still `new`
-- move: a report somebody already resolved or marked spam is left alone.
-- Undo: the same statement with `status = 'new'` and `where status = 'seen'`.
-- Paste once in the Supabase SQL editor. It writes directly because
-- `app_feedback_set_status` needs a signed-in admin and the editor has no session;
-- the columns written are exactly the ones that function writes.
update public.app_feedback
set status = 'seen', reviewed_at = now(), reviewed_by = '{OWNER_EMAIL}'
where status = 'new'
  and id in (
  {id_list}
);
-- Expect: UPDATE {len(ids)} on a fresh round (fewer if some were already triaged).
"""
    with open(os.path.join(out_dir, 'mark-seen.sql'), 'w', encoding='utf-8') as f:
        f.write(sql)

    print(f'{len(reports)} reports, {shots} screenshots, statuses {statuses}')
    src = ((data.get('archive') or {}).get('exportedFrom') or {})
    print(f"exported {data.get('generatedAt')} from commit {src.get('sha', 'unknown')} ({src.get('date', '?')})")
    print(f'wrote {os.path.join(out_dir, "reports.txt")} and mark-seen.sql')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
