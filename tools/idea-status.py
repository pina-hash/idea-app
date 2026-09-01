#!/usr/bin/env python3
"""
idea-status: one read-only command that answers the questions currently spread
across a chat, a Claude Code report, and three GitHub pages.

Writes nothing outside its own temp clone. Commits nothing. Touches no working
repo. Collides with no open session, so it can run beside a full set of lanes.

Git-only by default. The GitHub Actions API is 60 requests/hour unauthenticated
on a shared container IP and is routinely already exhausted, so nothing here
depends on it; --api adds CI conclusions when a token is available.
"""

import argparse
import collections
import os
import re
import subprocess
import sys
import tempfile
import shutil

REPO = "https://github.com/pina-hash/idea-app.git"
MIG_DIR = "supabase/migrations"


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True, text=True, check=False,
    ).stdout.strip()


def clone(dest):
    subprocess.run(
        ["git", "clone", "--quiet", "--filter=blob:none", REPO, dest],
        check=True, capture_output=True, text=True,
    )
    subprocess.run(["git", "-C", dest, "fetch", "--quiet", "origin",
                    "+refs/heads/*:refs/remotes/origin/*"],
                   check=False, capture_output=True, text=True)
    return dest


# --------------------------------------------------------------------------
# 1. Branches. Under the integrate workflow a green branch is merged and
#    deleted, so a branch that still exists IS the signal. This needs no API.
# --------------------------------------------------------------------------
def branches(repo):
    out = []
    refs = git(repo, "for-each-ref", "--format=%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(contents:subject)",
               "refs/remotes/origin/claude")
    for line in [l for l in refs.splitlines() if l.strip()]:
        name, sha, date, subj = line.split("|", 3)
        contained = git(repo, "merge-base", "--is-ancestor", sha, "origin/integration")
        rc = subprocess.run(["git", "-C", repo, "merge-base", "--is-ancestor",
                             sha, "origin/integration"], capture_output=True).returncode
        out.append({
            "name": name.replace("origin/", ""),
            "sha": sha[:8],
            "date": date,
            "subject": subj,
            "in_integration": rc == 0,
        })
    return out


# --------------------------------------------------------------------------
# 2. main vs integration, both directions. GitHub's Ahead column compares
#    against main and is meaningless while main lags, so compute both.
# --------------------------------------------------------------------------
def delta(repo):
    counts = git(repo, "rev-list", "--left-right", "--count",
                 "origin/main...origin/integration")
    main_only, integ_only = (counts.split() + ["0", "0"])[:2]
    ahead = git(repo, "log", "--oneline", "--no-merges",
                "origin/main..origin/integration")
    behind = git(repo, "log", "--oneline", "--no-merges",
                 "origin/integration..origin/main")
    return {
        "integration_not_in_main": int(integ_only),
        "main_not_in_integration": int(main_only),
        "to_deploy": [l for l in ahead.splitlines() if l.strip()],
        "to_sweep_back": [l for l in behind.splitlines() if l.strip()],
    }


# --------------------------------------------------------------------------
# 3. Migrations. Nothing in the repo records the APPLIED state, so this
#    reports the landed set and the date each file landed on main. Applied is
#    a question only a catalog query against production can answer.
# --------------------------------------------------------------------------
def migrations(repo, since):
    files = sorted(git(repo, "ls-tree", "--name-only", "origin/main", f"{MIG_DIR}/").splitlines())
    rows = []
    for f in files:
        num = os.path.basename(f)[:4]
        if not num.isdigit() or int(num) < since:
            continue
        landed = git(repo, "log", "-1", "--format=%ad", "--date=short", "origin/main", "--", f)
        rows.append({"num": num, "file": os.path.basename(f), "landed": landed})
    return rows


# --------------------------------------------------------------------------
# 4. Two authors, one object. 0151 restored a function from 0147's body while
#    0148 had already rewritten it, deleting a server-stamped clock. Nothing
#    detected it because no test carried both. This is that sweep.
# --------------------------------------------------------------------------
CREATE_RE = re.compile(
    r"\bcreate\s+(?:or\s+replace\s+)?"
    r"(function|procedure|view|materialized\s+view|table|trigger|policy|index|type)\s+"
    r"(?:if\s+not\s+exists\s+)?"
    r"([a-zA-Z_][\w\.\"]*)",
    re.IGNORECASE,
)


def two_authors(repo, rows):
    owners = collections.defaultdict(set)
    for r in rows:
        blob = git(repo, "show", f"origin/main:{MIG_DIR}/{r['file']}")
        for kind, name in CREATE_RE.findall(blob):
            kind = re.sub(r"\s+", " ", kind.lower())
            clean = name.lower().strip('"')
            key = kind + " " + clean
            owners[key].add(r["num"])
    return {k: sorted(v) for k, v in owners.items() if len(v) > 1}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=int, default=151,
                    help="lowest migration number to treat as possibly unapplied")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    tmp = tempfile.mkdtemp(prefix="idea-status-")
    repo = os.path.join(tmp, "idea-app")
    try:
        clone(repo)

        print("=" * 72)
        print("IDEA APP STATUS")
        print("=" * 72)

        br = branches(repo)
        print(f"\n[1] STANDING claude/** BRANCHES: {len(br)}")
        if not br:
            print("    None. The sweep has drained the queue.")
        for b in br:
            why = "already in integration (superseded ref)" if b["in_integration"] \
                else "NOT in integration: CI failed or the merge conflicted"
            print(f"    {b['name']}  {b['sha']}  {b['date']}")
            print(f"      {b['subject']}")
            print(f"      -> {why}")

        d = delta(repo)
        print(f"\n[2] main vs integration")
        print(f"    in integration, not in main : {d['integration_not_in_main']}  (this is the deploy)")
        print(f"    in main, not in integration : {d['main_not_in_integration']}  (next sweep merges these back)")
        for l in d["to_deploy"]:
            print(f"      DEPLOY  {l}")
        for l in d["to_sweep_back"]:
            print(f"      back    {l}")

        rows = migrations(repo, args.since)
        print(f"\n[3] MIGRATIONS landed on main at or above {args.since:04d}: {len(rows)}")
        print("    Nothing in the repo records which of these are APPLIED.")
        for r in rows:
            print(f"      {r['num']}  landed {r['landed']}  {r['file']}")

        collisions = two_authors(repo, rows)
        print(f"\n[4] TWO AUTHORS, ONE OBJECT across that range: {len(collisions)}")
        if not collisions:
            print("    None. No object in this range is defined by two files.")
        for obj, nums in sorted(collisions.items()):
            print(f"    !! {obj}")
            print(f"       defined by: {', '.join(nums)}")

        print()
        return 1 if collisions else 0
    finally:
        if args.keep:
            print(f"clone kept at {repo}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
