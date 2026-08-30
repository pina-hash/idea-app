#!/usr/bin/env python3
"""
standards-sweep.py - the closeout pass, run as one command.

Answers, for every standards file at once:
  - is the mirror ahead of the local copy (the local copy is stale)
  - is the local copy ahead of the mirror (a delivery never landed)
  - has the same file been edited in both directions (a fork, merged by content)
  - does REGISTER.md agree with the version header of the file it names
  - is there a file in docs/standards/ that no register row covers, or a row
    naming a file that is not there
  - is a delivered file in neither the mirror nor the register, which is what a
    brand new standards document looks like

It reads. It writes nothing outside its own temporary clone, commits nothing,
and touches no git state in any working repo, so it is safe to run at any time
and beside any number of open sessions.

Why it clones instead of calling the GitHub API: the contents API is 60 requests
an hour on a shared container IP and is routinely already exhausted, which makes
a sweep built on it fail exactly when it is needed. A sparse blobless clone gets
the directory listing and every file in one operation with no rate limit. Nothing
git-derived is read from that clone: a shallow clone reports commit counts and
history metadata that are wrong rather than absent. Only file contents and the
directory listing at HEAD are used, and both are exact.

Usage
  python3 standards-sweep.py
  python3 standards-sweep.py --local /mnt/project --delivered ./incoming
  python3 standards-sweep.py --json

  --local      directory holding the project-knowledge copies. Default /mnt/project
  --delivered  optional directory of files a closing chat just handed over, such as
               an unzipped download. Compared against the mirror and reported beside
               the local copy, so a delivery that would overwrite newer work shows up
  --json       machine-readable output instead of the table
  --keep       leave the clone in place for follow-up diffing, and print its path

Exit codes
  0  nothing needs action
  1  at least one file or register row needs action
  2  the sweep itself could not run
"""

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO_URL = "https://github.com/pina-hash/idea-app.git"
BRANCH = "main"
STD_PATH = "docs/standards"

# In docs/standards/ but not themselves standards, so they carry no register row.
# Anything else unregistered is a finding.
NOT_STANDARDS = {"REGISTER.md", "README.md"}

VERSION_RE = re.compile(r"^\*\*Version\s+([0-9][0-9.]*)\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2})")
ROW_RE = re.compile(r"^\|\s*`([^`]+\.md)`\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|")

# A version-keyed changelog entry, `- **2.4 (2026-08-27)** - ...`. Deliberately narrow.
# It must not match a date-keyed entry (IDEA_instructions.md) or the unbulleted
# `**v4.1 - <date>**` shape (IDEA_REFERENCE_LIBRARY.md): in both of those a document
# genuinely makes no second version claim, which is different from one this cannot parse.
ENTRY_RE = re.compile(r"^-\s+\*\*([0-9][0-9.]*)\s*\(", re.M)
CHANGELOG_RE = re.compile(r"^##\s+Changelog\s*$", re.M)


def changelog_version(text):
    """Newest version-keyed changelog entry, or None where the document makes no such claim."""
    if not text:
        return None
    m = CHANGELOG_RE.search(text)
    if not m:
        return None
    rest = text[m.end():]
    nxt = re.search(r"^##\s", rest, re.M)
    section = rest[: nxt.start()] if nxt else rest
    e = ENTRY_RE.search(section)
    return e.group(1) if e else None


def clone(dest):
    subprocess.run(
        ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
         "--branch", BRANCH, REPO_URL, dest],
        check=True, capture_output=True, text=True,
    )
    subprocess.run(
        ["git", "-C", dest, "sparse-checkout", "set", STD_PATH],
        check=True, capture_output=True, text=True,
    )
    d = os.path.join(dest, STD_PATH)
    if not os.path.isdir(d):
        raise RuntimeError(f"{STD_PATH} is not present at {BRANCH}")
    return d


def read(path):
    if not path or not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def version_of(text):
    """Version and date from the header line, which is where every standards file carries it."""
    if not text:
        return None, None
    for line in text.splitlines()[:6]:
        m = VERSION_RE.match(line.strip())
        if m:
            return m.group(1), m.group(2)
    return None, None


def substantive(text):
    """Lines with the version header dropped, so a version bump alone is not a diff."""
    return [ln for ln in text.splitlines() if not VERSION_RE.match(ln.strip())]


def compare(a_text, b_text):
    """Line counts unique to each side, version header excluded."""
    a, b = substantive(a_text), substantive(b_text)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    only_a = only_b = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("replace", "delete"):
            only_a += i2 - i1
        if tag in ("replace", "insert"):
            only_b += j2 - j1
    return only_a, only_b


def verdict(mirror_text, other_text, label):
    if other_text is None:
        return "ABSENT", f"not present in {label}"
    if mirror_text == other_text:
        return "SAME", ""
    only_mirror, only_other = compare(mirror_text, other_text)
    if only_mirror and only_other:
        return "FORK", (
            f"{only_mirror} lines only in the mirror, {only_other} only in {label}. "
            "Inspect before acting: a sentence rewritten in place counts on both "
            "sides, so this is a prompt to look and not a proof. Where it is a real "
            "fork, merge by content section by section and record in the changelog "
            "that the version number was reused. Never pick the higher number"
        )
    if only_other:
        return "AHEAD", f"{only_other} lines in {label} that never reached the mirror. Push it"
    if only_mirror:
        return "STALE", f"{only_mirror} lines in the mirror missing from {label}. Re-download before editing"
    return "TRIVIAL", "differs only in the version header or in whitespace"


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--local", default="/mnt/project")
    ap.add_argument("--delivered", default=None)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    tmp = tempfile.mkdtemp(prefix="std-sweep-")
    try:
        try:
            mirror_dir = clone(os.path.join(tmp, "repo"))
        except (subprocess.CalledProcessError, RuntimeError) as e:
            detail = getattr(e, "stderr", "") or str(e)
            print(f"sweep could not run: {detail.strip()}", file=sys.stderr)
            return 2

        on_disk = sorted(f for f in os.listdir(mirror_dir) if f.endswith(".md"))

        register_text = read(os.path.join(mirror_dir, "REGISTER.md")) or ""
        registered = {}
        for line in register_text.splitlines():
            m = ROW_RE.match(line)
            if m and m.group(2).lower() not in ("version", "---"):
                registered[m.group(1)] = (m.group(2), m.group(3))

        findings, rows = [], []

        if args.delivered:
            delivered_register = read(os.path.join(args.delivered, "REGISTER.md"))
            if delivered_register is not None and delivered_register != register_text:
                only_mirror, only_delivered = compare(register_text, delivered_register)
                findings.append(
                    f"REGISTER      a delivered REGISTER.md differs from the mirrored one "
                    f"({only_mirror} rows or lines only in the mirror, {only_delivered} only in "
                    "the delivered copy). Reconcile it against the sweep below before pushing, "
                    "because a register row is only ever read from a mirrored file"
                )

        # A closing chat's most common delivery is a file that has never been mirrored
        # and has no register row, and until 2026-08-30 such a file produced no row and
        # no finding at all: the sweep iterated the mirror and the register only, so the
        # one file the closeout existed to place was the one thing it could not see.
        delivered_names = set()
        if args.delivered and os.path.isdir(args.delivered):
            delivered_names = {f for f in os.listdir(args.delivered)
                               if f.endswith(".md") and f not in NOT_STANDARDS}

        for name in on_disk:
            if name not in registered and name not in NOT_STANDARDS:
                findings.append(f"UNREGISTERED  {name} is in {STD_PATH}/ with no REGISTER.md row")
        for name in registered:
            if name not in on_disk:
                findings.append(f"MISSING       REGISTER.md names {name}, which is not in {STD_PATH}/")
        for name in sorted(delivered_names - set(on_disk) - set(registered)):
            findings.append(
                f"NEW           {name} was delivered and is in neither {STD_PATH}/ nor "
                "REGISTER.md. Decide whether it is a standards file. If it is, mirror it "
                "and add a register row in the same commit, or it has no freshness "
                "authority and the next chat to edit it cannot tell that it forked"
            )

        for name in sorted(set(on_disk) | set(registered) | delivered_names):
            if name in NOT_STANDARDS:
                continue
            mirror_text = read(os.path.join(mirror_dir, name))
            if mirror_text is None:
                local_text = read(os.path.join(args.local, name)) if args.local else None
                delivered_text = (read(os.path.join(args.delivered, name))
                                  if args.delivered else None)
                for label, text in (("local", local_text), ("delivered", delivered_text)):
                    if text is None:
                        continue
                    h = version_of(text)[0]
                    c = changelog_version(text)
                    if h and c and h != c:
                        findings.append(
                            f"SELF          {name} ({label} copy): the header says {h}, its "
                            f"newest changelog entry says {c}. Write the missing entry before "
                            "this is mirrored; CI refuses the copy otherwise"
                        )
                rows.append({"file": name, "register": registered.get(name, ("-",))[0],
                             "mirror": "-",
                             "local": version_of(local_text)[0] or "-",
                             "local_state": "UNMIRRORED" if local_text else "-",
                             "local_note": "",
                             "delivered": version_of(delivered_text)[0] or "-",
                             "delivered_state": "UNMIRRORED" if delivered_text else "-",
                             "delivered_note": ""})
                continue

            m_ver, m_date = version_of(mirror_text)
            r_ver, r_date = registered.get(name, (None, None))

            local_text = read(os.path.join(args.local, name)) if args.local else None
            delivered_text = read(os.path.join(args.delivered, name)) if args.delivered else None

            l_state, l_note = verdict(mirror_text, local_text, "the local copy")
            d_state, d_note = (verdict(mirror_text, delivered_text, "the delivered copy")
                               if args.delivered else ("-", ""))

            # A document states its version in up to three places and they must agree.
            # `tests/standards-version-header.test.ts` in this repository enforces exactly
            # this and will fail CI on a copy that does not. Checking it here means the
            # mismatch is found at closeout, before the file is ever handed to a session,
            # rather than four minutes into a CI run on a branch that then cannot merge.
            # Added 2026-08-30, after this sweep passed a file whose header said 2.4 while
            # its newest changelog entry said 2.3 and CI caught what the sweep had not.
            for label, text in (("mirror", mirror_text), ("local", local_text),
                                ("delivered", delivered_text)):
                if text is None:
                    continue
                h = version_of(text)[0]
                c = changelog_version(text)
                if h and c and h != c:
                    findings.append(
                        f"SELF          {name} ({label} copy): the header says {h}, its newest "
                        f"changelog entry says {c}. Write the missing entry before this is "
                        "mirrored; CI refuses the copy otherwise"
                    )

            if name in registered and (r_ver, r_date) != (m_ver, m_date):
                findings.append(
                    f"REGISTER      {name}: the row says {r_ver} / {r_date}, "
                    f"the mirrored file says {m_ver} / {m_date}"
                )

            for state, note, label in ((l_state, l_note, "local"), (d_state, d_note, "delivered")):
                if state in ("FORK", "AHEAD", "STALE"):
                    findings.append(f"{state:<13} {name} vs {label}: {note}")

            # A delivered copy that is behind the local copy would overwrite newer work.
            if delivered_text is not None and local_text is not None and delivered_text != local_text:
                only_local, only_delivered = compare(local_text, delivered_text)
                if only_local and not only_delivered:
                    findings.append(
                        f"REGRESSION    {name}: the delivered copy is missing {only_local} lines "
                        "the local copy has. Uploading it would destroy them"
                    )
                elif only_local and only_delivered:
                    findings.append(
                        f"FORK          {name}: local and delivered have each diverged "
                        f"({only_local} / {only_delivered} unique lines). Merge before uploading"
                    )

            rows.append({
                "file": name,
                "register": r_ver or "-",
                "mirror": m_ver or "-",
                "local": version_of(local_text)[0] or "-",
                "local_state": l_state,
                "local_note": l_note,
                "delivered": version_of(delivered_text)[0] or "-",
                "delivered_state": d_state,
                "delivered_note": d_note,
            })

        if args.json:
            print(json.dumps({"rows": rows, "findings": findings}, indent=2))
            return 1 if findings else 0

        print(f"{STD_PATH}/ at {BRANCH}: {len(on_disk)} files, {len(registered)} register rows\n")
        hdr = f"{'file':<38} {'reg':<6} {'mir':<6} {'loc':<6} {'local':<9}"
        if args.delivered:
            hdr += f" {'dlv':<6} {'delivered':<9}"
        print(hdr)
        print("-" * len(hdr))
        for r in rows:
            line = (f"{r['file']:<38} {r['register']:<6} {r['mirror']:<6} "
                    f"{r['local']:<6} {r['local_state']:<9}")
            if args.delivered:
                line += f" {r['delivered']:<6} {r['delivered_state']:<9}"
            print(line)
        print()

        if args.keep:
            print(f"clone kept at {mirror_dir}\n")

        if findings:
            print(f"{len(findings)} thing(s) need action:\n")
            for f in findings:
                print("  " + f)
            print(
                "\nAHEAD means push that copy to the mirror. STALE means re-download it"
                "\nbefore editing. FORK means merge by content and say in the changelog"
                "\nthat the version number was reused, after confirming it is one."
                "\nREGRESSION means do not upload the"
                "\ndelivered copy as it stands. Fix REGISTER.md rows in the same commit."
            )
            return 1

        print("Nothing needs action. Mirror, register and local copies agree.")
        return 0
    finally:
        if args.keep:
            print(f"(temporary tree at {tmp} left in place)")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
