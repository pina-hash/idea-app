#!/usr/bin/env python3
"""
idea-status: one read-only command that answers the questions currently spread
across a chat, a Claude Code report, and three GitHub pages.

Writes nothing outside its own temp clone. Commits nothing. Touches no working
repo. Collides with no open session, so it can run beside a full set of lanes.

Git-only. The GitHub Actions API is 60 requests/hour unauthenticated on a
shared container IP and is routinely already exhausted, so nothing here
depends on it. Needs Python 3 and git, nothing else.

    python3 tools/idea-status.py                       # pina-hash/idea-app
    python3 tools/idea-status.py --repo pina-hash/fll-app
    python3 tools/idea-status.py --repo FRC-Team-5669-Techmen/frc-app
    python3 tools/idea-status.py --json                # machine-readable dump
    python3 tools/idea-status.py --since 160 --keep    # keep the temp clone
    python3 tools/idea-status.py --local /path/to/clone   # read an existing
                                                       # clone's origin/* refs
                                                       # instead of cloning

Print order is urgency order, so the most urgent thing is at the top:

    [0]  DECISIONS OWED        docs/decisions/entries/*.md with Status: open, from origin/main
    [0a] PROMPTS IN FLIGHT     docs/prompt-ledger/entries/*.md not yet deployed, read across
                               origin/main, origin/integration and every claude/** branch
    [1]  STANDING BRANCHES     claude/** branches still on the remote, and why each stands
    [2]  MAIN vs INTEGRATION   both directions
    [3]  MIGRATIONS LANDED     at or above --since, with the date each landed on main
    [3a] APPLIED-STATE PROBES  the catalog query that answers which of [3] are APPLIED
    [4]  TWO AUTHORS, ONE OBJECT
    [5]  KNOWN-RED HARNESS FINDINGS  the generated counts block from
                               tools/browser-verify/README.md on origin/main, verbatim

Section [3a] is the only way applied state is known. Nothing in any of the
three repos records which migrations production has run: idea-app's remote
has no `supabase_migrations.schema_migrations` table at all (CLAUDE.md,
"NEVER RUN `supabase db push`"), so the probes below read the catalog
directly and never depend on one. This tool prepares the query; a person
pastes it into the Supabase SQL editor; the answer lives in that person's
head or in a ledger they write. A document that states applied status is a
snapshot and was wrong for a whole night on 2026-08-31.

`IDEA_REPO_WORKFLOW_STANDARD.md` is the standard this serves: the same tool
reads all three repos, so `--repo` changes the clone URL and nothing else.
The migrations directory is `supabase/migrations/` in all three; where it is
absent or holds no `NNNN_` files, section [3] says so and lists the `.sql`
files it found instead. The ledger and decisions directories are at the same
paths in all three, created by the conformance prompts issued 2026-09-02.
"""

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

DEFAULT_REPO = "pina-hash/idea-app"
MIG_DIR = "supabase/migrations"
LEDGER_DIR = "docs/prompt-ledger/entries"
DECISIONS_DIR = "docs/decisions/entries"
HARNESS_README = "tools/browser-verify/README.md"
COUNTS_BEGIN = "<!-- counts:begin -->"
COUNTS_END = "<!-- counts:end -->"

# Where an unnumbered repo might keep its SQL. Listed, never applied.
SQL_FALLBACK_DIRS = ("supabase/migrations", "supabase", "sql", "db", "migrations")


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True, text=True, check=False,
    ).stdout.strip()


def git_ok(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True).returncode == 0


def clone(url, dest):
    subprocess.run(
        ["git", "clone", "--quiet", "--filter=blob:none", url, dest],
        check=True, capture_output=True, text=True,
    )
    subprocess.run(["git", "-C", dest, "fetch", "--quiet", "origin",
                    "+refs/heads/*:refs/remotes/origin/*"],
                   check=False, capture_output=True, text=True)
    return dest


def ls_files(repo, ref, path):
    """Filenames (not paths) directly under `path` at `ref`; [] if the tree is absent."""
    out = git(repo, "ls-tree", "--name-only", ref, f"{path.rstrip('/')}/")
    return sorted(os.path.basename(p) for p in out.splitlines() if p.strip())


def show(repo, ref, path):
    return git(repo, "show", f"{ref}:{path}")


def remote_refs(repo, prefix="refs/remotes/origin/"):
    out = git(repo, "for-each-ref", "--format=%(refname:short)", prefix)
    return [l for l in out.splitlines() if l.strip()]


# --------------------------------------------------------------------------
# 0. Decisions owed. One file per decision, Status line, default written in.
#    Read from origin/main only: a decision is raised by a chat and lands on
#    main through the standards path or a bundle, and reading branches here
#    would print a decision twice while its bundle is in flight.
# --------------------------------------------------------------------------
FIELD_RE = re.compile(r"^- ([A-Za-z][A-Za-z ]*?):\s*(.*)$")


def parse_fields(text):
    """`# <id> <title>` then `- Field: value` lines. Continuation lines
    (indented) are folded into the previous field."""
    lines = text.splitlines()
    head = lines[0] if lines else ""
    m = re.match(r"^#\s+(\S+)\s+(.*)$", head)
    ident, title = (m.group(1), m.group(2).strip()) if m else ("?", head.strip("# ").strip())
    fields = {}
    last = None
    for line in lines[1:]:
        fm = FIELD_RE.match(line)
        if fm:
            last = fm.group(1).strip()
            fields[last] = fm.group(2).strip()
        elif last and line.startswith("  ") and line.strip():
            fields[last] += " " + line.strip()
        elif line.strip() == "":
            last = None
    return ident, title, fields


def decisions(repo, ref="origin/main"):
    rows = []
    for f in ls_files(repo, ref, DECISIONS_DIR):
        if not f.endswith(".md"):
            continue
        ident, title, fields = parse_fields(show(repo, ref, f"{DECISIONS_DIR}/{f}"))
        rows.append({
            "id": ident, "title": title, "file": f,
            "status": (fields.get("Status") or "").split()[0].lower() if fields.get("Status") else "",
            "default": fields.get("Default this assistant would pick", ""),
            "unblocks": fields.get("What it unblocks", ""),
            "raised": fields.get("Raised", ""),
        })
    return rows


# --------------------------------------------------------------------------
# 0a. Prompts in flight. Read across every ref, because the session writes
#     its entry as its FIRST commit on its own branch and main will not carry
#     it until the branch is swept and deployed. Dedupe by id, prefer the copy
#     with the most advanced status: the same entry on main at `issued` and
#     on a branch at `pushed` is one entry, and the branch knows more.
# --------------------------------------------------------------------------
STATUS_RANK = {"issued": 0, "pushed": 1, "in-integration": 2,
               "deployed": 3, "superseded": 3, "withdrawn": 3}
TERMINAL = {"deployed", "superseded", "withdrawn"}


def ledger_refs(repo):
    refs = []
    for r in ("origin/main", "origin/integration"):
        if git_ok(repo, "rev-parse", "--verify", "--quiet", r):
            refs.append(r)
    refs += [r for r in remote_refs(repo) if r.startswith("origin/claude/")]
    return refs


def prompts(repo):
    best = {}
    for ref in ledger_refs(repo):
        for f in ls_files(repo, ref, LEDGER_DIR):
            if not f.endswith(".md"):
                continue
            ident, title, fields = parse_fields(show(repo, ref, f"{LEDGER_DIR}/{f}"))
            status = (fields.get("Status") or "").split()[0].strip(".,").lower()
            row = {
                "id": ident, "title": title, "file": f, "ref": ref,
                "status": status,
                "owns": fields.get("Owns", ""),
                "migration": fields.get("Migration permitted", ""),
                "branch": fields.get("Branch", ""),
            }
            cur = best.get(ident)
            if cur is None or STATUS_RANK.get(status, -1) > STATUS_RANK.get(cur["status"], -1):
                best[ident] = row
    rows = sorted(best.values(), key=lambda r: r["id"])
    return [r for r in rows if r["status"] not in TERMINAL], rows


# --------------------------------------------------------------------------
# 1. Branches. Under the integrate workflow a green branch is merged and
#    deleted, so a branch that still exists IS the signal. This needs no API.
# --------------------------------------------------------------------------
def branches(repo):
    out = []
    refs = git(repo, "for-each-ref", "--format=%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(contents:subject)",
               "refs/remotes/origin/claude")
    has_integration = git_ok(repo, "rev-parse", "--verify", "--quiet", "origin/integration")
    for line in [l for l in refs.splitlines() if l.strip()]:
        name, sha, date, subj = line.split("|", 3)
        contained = has_integration and git_ok(repo, "merge-base", "--is-ancestor", sha, "origin/integration")
        out.append({
            "name": name.replace("origin/", ""),
            "sha": sha[:8],
            "date": date,
            "subject": subj,
            "in_integration": contained,
        })
    return out


# --------------------------------------------------------------------------
# 2. main vs integration, both directions. GitHub's Ahead column compares
#    against main and is meaningless while main lags, so compute both.
# --------------------------------------------------------------------------
def delta(repo):
    if not git_ok(repo, "rev-parse", "--verify", "--quiet", "origin/integration"):
        return {"integration_exists": False, "integration_not_in_main": 0,
                "main_not_in_integration": 0, "to_deploy": [], "to_sweep_back": []}
    counts = git(repo, "rev-list", "--left-right", "--count",
                 "origin/main...origin/integration")
    main_only, integ_only = (counts.split() + ["0", "0"])[:2]
    ahead = git(repo, "log", "--oneline", "--no-merges",
                "origin/main..origin/integration")
    behind = git(repo, "log", "--oneline", "--no-merges",
                 "origin/integration..origin/main")
    return {
        "integration_exists": True,
        "integration_not_in_main": int(integ_only),
        "main_not_in_integration": int(main_only),
        "to_deploy": [l for l in ahead.splitlines() if l.strip()],
        "to_sweep_back": [l for l in behind.splitlines() if l.strip()],
    }


# --------------------------------------------------------------------------
# 3. Migrations. Nothing in the repo records the APPLIED state, so this
#    reports the landed set and the date each file landed on main. Applied is
#    a question only a catalog query against production can answer -- [3a].
# --------------------------------------------------------------------------
def migrations(repo, since):
    files = sorted(git(repo, "ls-tree", "--name-only", "origin/main", f"{MIG_DIR}/").splitlines())
    numbered = [f for f in files if re.match(r"^\d{4}_", os.path.basename(f))]
    if not numbered:
        found = []
        for d in SQL_FALLBACK_DIRS:
            for p in git(repo, "ls-tree", "-r", "--name-only", "origin/main", f"{d}/").splitlines():
                if p.endswith(".sql") and p not in found:
                    found.append(p)
        return {"numbered": False, "rows": [], "sql_files": found}
    rows = []
    for f in numbered:
        num = os.path.basename(f)[:4]
        if int(num) < since:
            continue
        landed = git(repo, "log", "-1", "--format=%ad", "--date=short", "origin/main", "--", f)
        rows.append({"num": num, "file": os.path.basename(f), "landed": landed})
    return {"numbered": True, "rows": rows, "sql_files": []}


# --------------------------------------------------------------------------
# 4. Two authors, one object. 0151 restored a function from 0147's body while
#    0148 had already rewritten it, deleting a server-stamped clock. Nothing
#    detected it because no test carried both. This is that sweep.
# --------------------------------------------------------------------------
CREATE_RE = re.compile(
    r"\bcreate\s+(?:or\s+replace\s+)?(?:unique\s+)?"
    r"(function|procedure|view|materialized\s+view|table|trigger|policy|index|type)\s+"
    r"(?:if\s+not\s+exists\s+)?"
    r"([a-zA-Z_][\w\.\"]*)",
    re.IGNORECASE,
)


def strip_sql_comments(sql):
    return re.sub(r"--[^\n]*", "", sql)


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


# --------------------------------------------------------------------------
# 3a. Applied-state probes. For each landed migration, ONE catalog probe
#     derived from the first object it creates, plus a BODY MARKER for any
#     `create or replace` over an object another migration in the range also
#     defines -- because for a replace, existence proves nothing: that is
#     exactly how 0151 reverted 0148 with the object present and the
#     server-stamped clock gone. The markers are lines present in the later
#     body and absent from every other definition in the range, so a `true`
#     means the LATER text is what the catalog holds.
#
#     Every probe reads pg_catalog / information_schema and none reads a
#     migrations table, because production has none.
# --------------------------------------------------------------------------
ALTER_ADD_COLUMN_RE = re.compile(
    r"\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w\.\"]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([\w\"]+)",
    re.IGNORECASE,
)
ADD_CONSTRAINT_RE = re.compile(
    r"\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w\.\"]+)\s+add\s+constraint\s+([\w\"]+)",
    re.IGNORECASE,
)
CREATE_ANY_RE = re.compile(
    r"\bcreate\s+(or\s+replace\s+)?(?:unique\s+)?"
    r"(function|procedure|view|materialized\s+view|table|trigger|policy|index|type|schema|extension)\s+"
    r"(?:if\s+not\s+exists\s+)?"
    r"([a-zA-Z_][\w\.\"]*)",
    re.IGNORECASE,
)


def split_name(raw):
    parts = [p.strip('"') for p in raw.split(".")]
    if len(parts) >= 2:
        return parts[-2].lower(), parts[-1].lower()
    return "public", parts[-1].lower()


def sql_lit(s):
    return "'" + s.replace("'", "''") + "'"


def probe_for(kind, raw, blob):
    """Return (object label, SQL boolean expression) for one created object."""
    schema, name = split_name(raw)
    kind = re.sub(r"\s+", " ", kind.lower())
    if kind in ("function", "procedure"):
        return (f"{kind} {schema}.{name}",
                f"exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                f"where n.nspname = {sql_lit(schema)} and p.proname = {sql_lit(name)})")
    if kind in ("table", "view", "materialized view", "index"):
        relkind = {"table": "'r','p'", "view": "'v'", "materialized view": "'m'", "index": "'i'"}[kind]
        if kind == "index":
            return (f"index {name}",
                    f"exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                    f"where c.relname = {sql_lit(name)} and c.relkind in ({relkind}))")
        return (f"{kind} {schema}.{name}",
                f"exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                f"where n.nspname = {sql_lit(schema)} and c.relname = {sql_lit(name)} and c.relkind in ({relkind}))")
    if kind == "policy":
        # `create policy "name" on schema.table`
        m = re.search(r"create\s+policy\s+" + re.escape(raw) + r"\s+on\s+([\w\.\"]+)", blob, re.IGNORECASE)
        if m:
            ts, tn = split_name(m.group(1))
            return (f"policy {name} on {ts}.{tn}",
                    f"exists (select 1 from pg_policies where schemaname = {sql_lit(ts)} "
                    f"and tablename = {sql_lit(tn)} and policyname = {sql_lit(name)})")
        return (f"policy {name}", f"exists (select 1 from pg_policies where policyname = {sql_lit(name)})")
    if kind == "trigger":
        return (f"trigger {name}", f"exists (select 1 from pg_trigger where tgname = {sql_lit(name)})")
    if kind == "type":
        return (f"type {schema}.{name}",
                f"exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace "
                f"where n.nspname = {sql_lit(schema)} and t.typname = {sql_lit(name)})")
    if kind == "schema":
        return (f"schema {name}", f"exists (select 1 from pg_namespace where nspname = {sql_lit(name)})")
    if kind == "extension":
        return (f"extension {name}", f"exists (select 1 from pg_extension where extname = {sql_lit(name)})")
    return None


def first_object(blob, shared=frozenset()):
    """The first probeable thing the file creates, in source order, preferring
    one no other migration in the range also defines: for a shared object
    existence proves nothing (it may be the OTHER file's copy that is live),
    so it is used only when the file creates nothing of its own, and labelled."""
    clean = strip_sql_comments(blob)
    picked = _first_object(clean, shared, skip_shared=True)
    if picked:
        return picked
    picked = _first_object(clean, shared, skip_shared=False)
    if picked:
        return (picked[0] + " (also defined by another migration in range; existence proves nothing)", picked[1])
    return None


def _first_object(clean, shared, skip_shared):
    candidates = []
    for m in CREATE_ANY_RE.finditer(clean):
        candidates.append((m.start(), "create", m.group(2), m.group(3)))
    for m in ALTER_ADD_COLUMN_RE.finditer(clean):
        candidates.append((m.start(), "column", m.group(1), m.group(2)))
    for m in ADD_CONSTRAINT_RE.finditer(clean):
        candidates.append((m.start(), "constraint", m.group(1), m.group(2)))
    candidates.sort()
    for _, how, a, b in candidates:
        if how == "create":
            kind = re.sub(r"\s+", " ", a.lower())
            key = kind + " " + b.lower().strip('"')
            if skip_shared and (key in shared or key.replace("public.", "") in shared):
                continue
            p = probe_for(a, b, clean)
            if p:
                return p
        elif how == "column":
            ts, tn = split_name(a)
            col = b.strip('"').lower()
            return (f"column {ts}.{tn}.{col}",
                    f"exists (select 1 from information_schema.columns where table_schema = {sql_lit(ts)} "
                    f"and table_name = {sql_lit(tn)} and column_name = {sql_lit(col)})")
        elif how == "constraint":
            ts, tn = split_name(a)
            cn = b.strip('"').lower()
            return (f"constraint {cn} on {ts}.{tn}",
                    f"exists (select 1 from pg_constraint where conname = {sql_lit(cn)})")
    return None


FUNC_BODY_RE = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+([\w\.\"]+)\s*\(.*?\$(\w*)\$(.*?)\$\2\$",
    re.IGNORECASE | re.DOTALL,
)


def function_bodies(blob):
    """{ (schema, name): [body, ...] } for every function definition in a file."""
    out = collections.defaultdict(list)
    for m in FUNC_BODY_RE.finditer(blob):
        out[split_name(m.group(1))].append(m.group(3))
    return out


def body_marker(later, others):
    """A line present in `later` and absent from every body in `others`.
    Prefer a non-comment line; longest first, so the marker is distinctive."""
    other_text = "\n".join(others)
    lines = [l.strip() for l in later.splitlines()]
    lines = [l for l in lines if len(l) >= 12]
    lines.sort(key=len, reverse=True)
    for l in lines:
        if l.startswith("--"):
            continue
        if l not in other_text:
            return l
    for l in lines:
        if l not in other_text:
            return l
    return None


def probes(repo, rows, collisions):
    """One probe per migration, plus body markers for replaced functions
    that another migration in the range also defines."""
    bodies = {}
    blobs = {}
    for r in rows:
        blobs[r["num"]] = git(repo, "show", f"origin/main:{MIG_DIR}/{r['file']}")
        bodies[r["num"]] = function_bodies(blobs[r["num"]])

    shared = frozenset(collisions.keys())
    out = []
    for r in rows:
        p = first_object(blobs[r["num"]], shared)
        if p:
            out.append({"num": r["num"], "file": r["file"], "kind": "object", "object": p[0], "sql": p[1]})
        else:
            out.append({"num": r["num"], "file": r["file"], "kind": "none", "object": "no probe", "sql": None})

    # Body markers: for every function two files in the range both define,
    # the LATER file gets a marker probe.
    for key, nums in sorted(collisions.items()):
        if not key.startswith("function "):
            continue
        fq = key.split(" ", 1)[1]
        skey = split_name(fq)
        ordered = sorted(nums)
        for i, num in enumerate(ordered[1:], start=1):
            later_bodies = bodies.get(num, {}).get(skey, [])
            others = []
            for o in ordered[:i]:
                others += bodies.get(o, {}).get(skey, [])
            if not later_bodies:
                out.append({"num": num, "file": next(r["file"] for r in rows if r["num"] == num),
                            "kind": "marker-missing", "object": f"function {skey[0]}.{skey[1]} (body not parsed; out of reach)", "sql": None})
                continue
            marker = body_marker(later_bodies[-1], others)
            if not marker:
                out.append({"num": num, "file": next(r["file"] for r in rows if r["num"] == num),
                            "kind": "marker-missing", "object": f"function {skey[0]}.{skey[1]} (no distinguishing line; out of reach)", "sql": None})
                continue
            out.append({
                "num": num,
                "file": next(r["file"] for r in rows if r["num"] == num),
                "kind": "marker",
                "object": f"function {skey[0]}.{skey[1]} carries {num}'s body",
                "marker": marker,
                "sql": (f"exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                        f"where n.nspname = {sql_lit(skey[0])} and p.proname = {sql_lit(skey[1])} "
                        f"and position({sql_lit(marker)} in p.prosrc) > 0)"),
            })
    out.sort(key=lambda p: (p["num"], 0 if p["kind"] == "object" else 1))
    return out


def probe_sql(plist):
    parts = []
    for p in plist:
        if not p["sql"]:
            continue
        parts.append(
            f"  select {sql_lit(p['num'])} as migration, {sql_lit(p['object'])} as object where {p['sql']}"
        )
    if not parts:
        return "-- no probeable object in range"
    return (
        "-- One row per APPLIED migration (by number and probed object). A migration\n"
        "-- with no row is not applied, or its probe is listed above as `no probe`.\n"
        "-- Reads pg_catalog and information_schema only; never a migrations table.\n"
        "select migration, object from (\n" + "\n  union all\n".join(parts) + "\n) as applied\norder by migration, object;"
    )


# --------------------------------------------------------------------------
# 5. Known-red harness findings: the generated counts block in
#    tools/browser-verify/README.md, verbatim, from origin/main. It carries
#    the sha and the date it was measured at; this tool adds nothing to it.
# --------------------------------------------------------------------------
def harness_block(repo, ref="origin/main"):
    text = show(repo, ref, HARNESS_README)
    if not text:
        return {"present": False, "readme": False, "block": ""}
    a, b = text.find(COUNTS_BEGIN), text.find(COUNTS_END)
    if a < 0 or b < 0 or b < a:
        return {"present": False, "readme": True, "block": ""}
    return {"present": True, "readme": True, "block": text[a + len(COUNTS_BEGIN):b].strip("\n")}


# --------------------------------------------------------------------------
def gather(repo, since):
    dec = decisions(repo)
    inflight, ledger_all = prompts(repo)
    br = branches(repo)
    d = delta(repo)
    mig = migrations(repo, since)
    collisions = two_authors(repo, mig["rows"]) if mig["numbered"] else {}
    plist = probes(repo, mig["rows"], collisions) if mig["numbered"] else []
    hb = harness_block(repo)
    return {
        "decisions": dec,
        "prompts_in_flight": inflight,
        "prompts_all": ledger_all,
        "branches": br,
        "delta": d,
        "migrations": mig,
        "probes": plist,
        "probe_sql": probe_sql(plist) if mig["numbered"] else None,
        "two_authors": collisions,
        "harness": hb,
    }


def report(repo_name, since, data):
    print("=" * 72)
    print(f"REPO STATUS: {repo_name}")
    print("=" * 72)

    open_dec = [r for r in data["decisions"] if r["status"] == "open"]
    print(f"\n[0] DECISIONS OWED (Status: open, from origin/main): {len(open_dec)}")
    if not data["decisions"]:
        print(f"    No {DECISIONS_DIR}/ on origin/main.")
    elif not open_dec:
        print("    None open.")
    for r in open_dec:
        print(f"    {r['id']}  {r['title']}")
        print(f"        default: {r['default']}")
        if r["unblocks"]:
            print(f"        unblocks: {r['unblocks']}")

    inflight = data["prompts_in_flight"]
    print(f"\n[0a] PROMPTS IN FLIGHT (Status not deployed, across main, integration and claude/**): {len(inflight)}")
    if not data["prompts_all"]:
        print(f"    No {LEDGER_DIR}/ on any ref.")
    elif not inflight:
        print("    None. Every ledger entry is deployed or superseded.")
    for r in inflight:
        print(f"    {r['id']}  {r['title']}")
        print(f"        Owns: {r['owns']}")
        print(f"        Migration permitted: {r['migration']}")
        print(f"        Status: {r['status']}   Branch: {r['branch']}   (read from {r['ref']})")

    br = data["branches"]
    print(f"\n[1] STANDING claude/** BRANCHES: {len(br)}")
    if not br:
        print("    None. The sweep has drained the queue.")
    for b in br:
        why = "already in integration (superseded ref)" if b["in_integration"] \
            else "NOT in integration: CI failed, CI not finished, or the merge conflicted"
        print(f"    {b['name']}  {b['sha']}  {b['date']}")
        print(f"      {b['subject']}")
        print(f"      -> {why}")

    d = data["delta"]
    print("\n[2] main vs integration")
    if not d["integration_exists"]:
        print("    No origin/integration branch. Nothing has been swept; see .github/workflows/integrate.yml.")
    else:
        print(f"    in integration, not in main : {d['integration_not_in_main']}  (this is the deploy)")
        print(f"    in main, not in integration : {d['main_not_in_integration']}  (next sweep merges these back)")
        for l in d["to_deploy"]:
            print(f"      DEPLOY  {l}")
        for l in d["to_sweep_back"]:
            print(f"      back    {l}")

    mig = data["migrations"]
    if not mig["numbered"]:
        print(f"\n[3] MIGRATIONS: unnumbered SQL; applied state unknowable by number")
        print(f"    No NNNN_ files under {MIG_DIR}/ on origin/main. .sql files found:")
        for f in mig["sql_files"]:
            print(f"      {f}")
        if not mig["sql_files"]:
            print("      (none)")
        print("\n[3a] APPLIED-STATE PROBES: none; a probe needs a numbered migration to name.")
        print("\n[4] TWO AUTHORS, ONE OBJECT: not swept; no numbered range.")
    else:
        rows = mig["rows"]
        print(f"\n[3] MIGRATIONS landed on main at or above {since:04d}: {len(rows)}")
        print("    Nothing in the repo records which of these are APPLIED. See [3a].")
        for r in rows:
            print(f"      {r['num']}  landed {r['landed']}  {r['file']}")

        plist = data["probes"]
        print(f"\n[3a] APPLIED-STATE PROBES: {len([p for p in plist if p['sql']])} probe(s), "
              f"{len([p for p in plist if not p['sql']])} out of reach")
        print("    THIS IS THE ONLY WAY APPLIED STATE IS KNOWN. Nothing in the repo records it")
        print("    and production has no supabase_migrations.schema_migrations table, so the")
        print("    query below reads the catalog directly. Paste it into the Supabase SQL")
        print("    editor; it returns one row per APPLIED migration, by number and object.")
        print("    A `carries NNNN's body` row is a body marker: for a `create or replace`")
        print("    existence proves nothing, so it checks the later text is what is live.")
        for p in plist:
            tag = {"object": "probe ", "marker": "marker", "none": "NO PROBE", "marker-missing": "NO PROBE"}[p["kind"]]
            print(f"      {p['num']}  {tag}  {p['object']}")
        print()
        for line in data["probe_sql"].splitlines():
            print(f"    {line}")

        collisions = data["two_authors"]
        print(f"\n[4] TWO AUTHORS, ONE OBJECT across that range: {len(collisions)}")
        if not collisions:
            print("    None. No object in this range is defined by two files.")
        for obj, nums in sorted(collisions.items()):
            print(f"    !! {obj}")
            print(f"       defined by: {', '.join(nums)}")

    hb = data["harness"]
    print("\n[5] KNOWN-RED HARNESS FINDINGS (tools/browser-verify/README.md counts block, origin/main)")
    if not hb["readme"]:
        print(f"    No {HARNESS_README} on origin/main.")
    elif not hb["present"]:
        print(f"    {HARNESS_README} carries no {COUNTS_BEGIN} ... {COUNTS_END} block yet.")
        print("    The block is generated by `npm run verify:readme`; until it lands, the")
        print("    README's prose counts are hand-written and are to be re-derived, not trusted.")
    else:
        for line in hb["block"].splitlines():
            print(f"    {line}")
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=DEFAULT_REPO,
                    help="GitHub owner/name to read (default pina-hash/idea-app)")
    ap.add_argument("--since", type=int, default=151,
                    help="lowest migration number to treat as possibly unapplied")
    ap.add_argument("--keep", action="store_true", help="keep the temp clone")
    ap.add_argument("--json", action="store_true", help="print everything as JSON instead of the report")
    ap.add_argument("--local", metavar="PATH",
                    help="read an existing clone's origin/* refs instead of cloning (offline use and tests)")
    args = ap.parse_args()

    tmp = None
    if args.local:
        repo = os.path.abspath(args.local)
    else:
        tmp = tempfile.mkdtemp(prefix="idea-status-")
        repo = os.path.join(tmp, args.repo.split("/")[-1])
    try:
        if not args.local:
            clone(f"https://github.com/{args.repo}.git", repo)
        data = gather(repo, args.since)
        data["repo"] = args.repo
        data["since"] = args.since
        data["main_sha"] = git(repo, "rev-parse", "origin/main")
        if args.json:
            print(json.dumps(data, indent=2))
        else:
            report(args.repo, args.since, data)
        return 1 if data["two_authors"] else 0
    finally:
        if tmp:
            if args.keep:
                print(f"clone kept at {repo}", file=sys.stderr)
            else:
                shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
