#!/usr/bin/env python3
"""The IDEA session queue's dispatcher: decides which queued Claude Code sessions may start now.

Read-only. It reads `docs/dispatch/queue/*.md`, takes Mr. Pina's current claude.ai usage as
an argument (or none, when it cannot be read), and prints a JSON plan: which entries to start,
which wait and why, and what needs a person. Starting a session and writing the entry's new
status is the caller's job (the idea-dispatch procedure in `docs/dispatch/README.md`).

    python3 tools/dispatch.py plan                                  # usage unknown
    python3 tools/dispatch.py plan --usage session=27,week=19,fable=0 \
        --reset 2026-10-21T13:00:00-07:00 --now 2026-10-17T22:05:00-07:00
    python3 tools/dispatch.py --selftest                            # the instrument checks itself

The rules (Mr. Pina, 2026-10-17):
  * Usage reserve: automation starts nothing once the week is at 60% or more, and keeps to an
    even pace toward that ceiling (allowed = 10 + 50 x the fraction of the week elapsed, never
    above 60). It waits while the current session is at 80% or more.
  * Fable 5.1 and the xhigh, max and ultracode efforts never start on their own: the entry
    needs `go: yes`, which only Mr. Pina gives, in a chat.
  * Usage unknown (his browser unreachable): only size S on Sonnet or Opus at medium or high,
    and only when nothing at all is running.
  * One running session per repo, unless every running session's `owns` is disjoint from the
    candidate's; then at most two per repo, and at most three across every repo.
  * Every repo is listed in `docs/dispatch/repos.json`; an entry for an unlisted repo is flagged
    and never started. A resource token in `owns` (`db:idea-supabase`) is shared across repos:
    two entries naming the same token never run at once, whatever their repos. An entry whose
    `migration` is not `none` holds its repo's `db` token automatically, so an Armory server
    change and an idea-app migration cannot collide on the one database they share.
  * `after:` entries must be `done` first. A `failed` or `held` dependency holds the entry.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys

QUEUE_DIR = "docs/dispatch/queue"
WEEK_CEILING = 60.0
PACE_FLOOR = 10.0
SESSION_CEILING = 80.0
MAX_READING_AGE_MIN = 180  # a usage reading older than this counts as unreadable
MAX_PER_REPO = 2
GLOBAL_MAX = 3  # sessions running at once across every repo
REGISTRY = "docs/dispatch/repos.json"
GATED_MODELS = {"fable-5.1"}
GATED_EFFORTS = {"xhigh", "max", "ultracode"}
MODELS = {"haiku-5.5", "sonnet-5.5", "opus-5.5", "fable-5.1"}
MODEL_IDS = {"haiku-5.5": "claude-haiku-5-5", "sonnet-5.5": "claude-sonnet-5-5", "opus-5.5": "claude-opus-5-5", "fable-5.1": "claude-fable-5-1"}
MODEL_ALIAS = {"haiku-5.5": "haiku", "sonnet-5.5": "sonnet", "opus-5.5": "opus", "fable-5.1": "fable"}
EFFORTS = {"low", "medium", "high", "xhigh", "max", "ultracode"}
SIZES = {"S", "M", "L"}
STATUSES = {"queued", "running", "done", "failed", "held", "cancelled"}
REQUIRED = ["id", "repo", "chat", "ledger", "model", "effort", "size", "owns", "status", "queued_at"]


# ---------------------------------------------------------------- parsing

def parse_entry(text: str, path: str = "<memory>") -> dict:
    """Front matter between the first two `---` lines, `key: value` per line."""
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        raise ValueError(f"{path}: no front matter")
    fields: dict = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"{path}: bad line {line!r}")
        k, v = line.split(":", 1)
        fields[k.strip()] = v.strip()
    fields["prompt"] = m.group(2).strip()
    fields["path"] = path
    for k in ("owns", "after"):
        fields[k] = [x.strip() for x in fields.get(k, "").split(",") if x.strip()]
    for k in ("go", "needs_go"):
        fields[k] = fields.get(k, "").lower() in ("yes", "true")
    return fields


def validate(e: dict) -> list[str]:
    errs = [f"missing {k}" for k in REQUIRED if not e.get(k)]
    if e.get("model") and e["model"] not in MODELS:
        errs.append(f"model {e['model']!r} is not one of {sorted(MODELS)}")
    if e.get("effort") and e["effort"] not in EFFORTS:
        errs.append(f"effort {e['effort']!r} is not one of {sorted(EFFORTS)}")
    if e.get("size") and e["size"] not in SIZES:
        errs.append(f"size {e['size']!r} is not S, M or L")
    if e.get("status") and e["status"] not in STATUSES:
        errs.append(f"status {e['status']!r} is not one of {sorted(STATUSES)}")
    if e.get("status") in ("queued", "running") and not e.get("prompt"):
        errs.append("no prompt below the front matter")
    return errs


def load_queue(root: str) -> list[dict]:
    out = []
    for path in sorted(glob.glob(os.path.join(root, QUEUE_DIR, "*.md"))):
        if os.path.basename(path).upper() == "README.MD":
            continue
        with open(path, encoding="utf-8") as fh:
            out.append(parse_entry(fh.read(), os.path.relpath(path, root)))
    return out


# ---------------------------------------------------------------- surfaces

def literal_prefix(glob_pat: str) -> str:
    """The part of a glob before its first wildcard."""
    m = re.search(r"[*?\[{]", glob_pat)
    return glob_pat[: m.start()] if m else glob_pat


def globs_overlap(a: str, b: str) -> bool:
    """Conservative: two globs overlap unless their literal prefixes diverge.

    `src/lib/coin/**` and `src/lib/coin/x.ts` overlap; `src/lib/coin/**` and `src/lib/maps/**`
    do not. Anything uncertain counts as overlapping, because a false overlap only costs a wait
    and a false disjoint costs a collision.
    """
    pa, pb = literal_prefix(a), literal_prefix(b)
    exact_a, exact_b = pa == a, pb == b
    if exact_a and exact_b:
        return a == b
    return pa.startswith(pb) or pb.startswith(pa)


def is_resource(token: str) -> bool:
    return ":" in token and "/" not in token.split(":", 1)[0]


def surfaces_overlap(owns_a: list[str], owns_b: list[str]) -> bool:
    paths_a = [x for x in owns_a if not is_resource(x)]
    paths_b = [x for x in owns_b if not is_resource(x)]
    if not paths_a or not paths_b:
        return True
    return any(globs_overlap(x, y) for x in paths_a for y in paths_b)


def resources(e: dict, registry: dict | None) -> set[str]:
    out = {x for x in e.get("owns", []) if is_resource(x)}
    mig = (e.get("migration") or "none").strip().lower()
    if registry and mig not in ("", "none") and registry.get(e.get("repo"), {}).get("db"):
        out.add(registry[e["repo"]]["db"])
    return out


def load_registry(root: str) -> dict | None:
    path = os.path.join(root, REGISTRY)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return {r["repo"]: r for r in json.load(fh)["repos"]}


# ---------------------------------------------------------------- usage

def parse_usage(s: str | None) -> dict | None:
    if not s:
        return None
    out = {}
    for part in s.split(","):
        k, v = part.split("=")
        out[k.strip()] = float(v)
    return out


def fresh_usage(usage: dict | None, read_at: dt.datetime | None, now: dt.datetime) -> dict | None:
    """A reading with no time, or one older than MAX_READING_AGE_MIN, is treated as unreadable."""
    if usage is None:
        return None
    if read_at is None:
        return usage  # read this run
    if (now - read_at).total_seconds() / 60 > MAX_READING_AGE_MIN:
        return None
    return usage


def week_allowance(reset: dt.datetime | None, now: dt.datetime) -> float:
    """How much of the week automation may have reached by now: an even pace to the ceiling."""
    if reset is None:
        return WEEK_CEILING
    start = reset - dt.timedelta(days=7)
    frac = (now - start).total_seconds() / (7 * 86400)
    frac = min(max(frac, 0.0), 1.0)
    return min(WEEK_CEILING, PACE_FLOOR + (WEEK_CEILING - PACE_FLOOR) * frac)


def needs_go(e: dict) -> bool:
    return e.get("needs_go") or e["model"] in GATED_MODELS or e["effort"] in GATED_EFFORTS


# ---------------------------------------------------------------- the plan

def plan(entries: list[dict], usage: dict | None, reset: dt.datetime | None, now: dt.datetime,
         registry: dict | None = None) -> dict:
    by_id = {e["id"]: e for e in entries}
    start, wait, attention = [], [], []
    running = [e for e in entries if e.get("status") == "running"]

    for e in entries:
        errs = validate(e)
        if errs:
            attention.append({"id": e.get("id") or e["path"], "reason": "invalid entry: " + "; ".join(errs)})
        if e.get("status") == "running" and e.get("started_at"):
            try:
                started = dt.datetime.fromisoformat(e["started_at"])
                if (now - started) > dt.timedelta(hours=6):
                    attention.append({"id": e["id"], "reason": f"running for more than 6 hours (since {e['started_at']}); check the session"})
            except ValueError:
                attention.append({"id": e["id"], "reason": f"started_at {e['started_at']!r} is not ISO-8601"})

    # usage gate, decided once
    gate = None
    if usage is not None:
        allow = week_allowance(reset, now)
        if usage.get("week", 0) >= WEEK_CEILING:
            gate = f"week at {usage['week']:.0f}%, at or above the {WEEK_CEILING:.0f}% automation ceiling; his reserve"
        elif usage.get("week", 0) >= allow:
            gate = f"week at {usage['week']:.0f}%, ahead of the even pace ({allow:.0f}% allowed by now)"
        elif usage.get("session", 0) >= SESSION_CEILING:
            gate = f"current session at {usage['session']:.0f}%, waiting for its reset"

    queued = [e for e in entries if e.get("status") == "queued" and not validate(e)]
    queued.sort(key=lambda e: (e.get("queued_at", ""), e["id"]))
    starting: list[dict] = []

    for e in queued:
        live = running + starting
        deps = [by_id.get(d) for d in e["after"]]
        missing = [d for d, x in zip(e["after"], deps) if x is None]
        if missing:
            wait.append({"id": e["id"], "reason": f"after: {', '.join(missing)} not in the queue"})
            attention.append({"id": e["id"], "reason": f"names an unknown dependency: {', '.join(missing)}"})
            continue
        blocked = [d for d in deps if d["status"] in ("failed", "held", "cancelled")]
        if blocked:
            wait.append({"id": e["id"], "reason": f"held: dependency {blocked[0]['id']} is {blocked[0]['status']}"})
            attention.append({"id": e["id"], "reason": f"its dependency {blocked[0]['id']} is {blocked[0]['status']}"})
            continue
        pending = [d for d in deps if d["status"] != "done"]
        if pending:
            wait.append({"id": e["id"], "reason": f"after {pending[0]['id']} ({pending[0]['status']})"})
            continue
        if registry is not None and e["repo"] not in registry:
            wait.append({"id": e["id"], "reason": f"{e['repo']} is not in docs/dispatch/repos.json"})
            attention.append({"id": e["id"], "reason": f"unregistered repo {e['repo']}: add it to docs/dispatch/repos.json"})
            continue
        if needs_go(e) and not e["go"]:
            wait.append({"id": e["id"], "reason": f"{e['model']} {e['effort']} needs Mr. Pina's go"})
            attention.append({"id": e["id"], "reason": f"waiting for his go ({e['model']} {e['effort']}, size {e['size']})"})
            continue
        if usage is None:
            small = e["size"] == "S" and e["model"] in ("haiku-5.5", "sonnet-5.5", "opus-5.5") and e["effort"] in ("low", "medium", "high")
            if not small:
                wait.append({"id": e["id"], "reason": "usage unreadable; only size S Sonnet/Opus jobs start blind"})
                continue
            if live:
                wait.append({"id": e["id"], "reason": "usage unreadable; one blind job at a time and one is running"})
                continue
        elif gate:
            wait.append({"id": e["id"], "reason": gate})
            continue
        heavy = ("xhigh", "max", "ultracode")
        if e["effort"] in heavy and any(r["effort"] in heavy for r in live):
            wait.append({"id": e["id"], "reason": "one xhigh-or-above session at a time, and one is running"})
            continue
        if len(live) >= GLOBAL_MAX:
            wait.append({"id": e["id"], "reason": f"{GLOBAL_MAX} sessions already running across all repos"})
            continue
        mine = resources(e, registry)
        held = [r for r in live if mine & resources(r, registry)]
        if held:
            wait.append({"id": e["id"], "reason": f"shares {sorted(mine & resources(held[0], registry))[0]} with {held[0]['id']} ({held[0]['status']})"})
            continue
        same_repo = [r for r in live if r["repo"] == e["repo"]]
        if len(same_repo) >= MAX_PER_REPO:
            wait.append({"id": e["id"], "reason": f"{MAX_PER_REPO} sessions already on {e['repo']}"})
            continue
        clash = [r for r in same_repo if surfaces_overlap(r["owns"], e["owns"])]
        if clash:
            wait.append({"id": e["id"], "reason": f"files overlap with {clash[0]['id']} ({clash[0]['status']})"})
            continue
        mode = "parallel" if same_repo else "solo"
        starting.append({**e, "status": "starting", "mode": mode})
        start.append({"id": e["id"], "path": e["path"], "repo": e["repo"], "model": e["model"],
                      "model_id": MODEL_IDS[e["model"]], "subagent_model": MODEL_ALIAS[e["model"]],
                      "effort": e["effort"], "ultracode": e["effort"] == "ultracode",
                      "mode": mode, "ledger": e["ledger"]})
        if usage is None:
            break  # one blind start per run

    return {
        "now": now.isoformat(),
        "usage": usage if usage is not None else "unreadable",
        "week_allowance": round(week_allowance(reset, now), 1) if usage is not None else None,
        "running": [r["id"] for r in running],
        "start": start,
        "wait": wait,
        "attention": attention,
    }


# ---------------------------------------------------------------- self-test

def _entry(**kw) -> dict:
    base = {"id": "x", "repo": "pina-hash/idea-app", "chat": "t", "ledger": "0999", "model": "opus-5.5",
            "effort": "high", "size": "M", "owns": "src/lib/coin/**", "status": "queued",
            "queued_at": "2026-10-17T20:00:00-07:00", "after": "", "go": "no", "needs_go": "no"}
    base.update({k: v for k, v in kw.items()})
    text = "---\n" + "\n".join(f"{k}: {v}" for k, v in base.items()) + "\n---\nDo the work.\n"
    return parse_entry(text, f"{QUEUE_DIR}/{base['id']}.md")


def selftest() -> int:
    now = dt.datetime.fromisoformat("2026-10-17T22:05:00-07:00")
    reset = dt.datetime.fromisoformat("2026-10-21T13:00:00-07:00")   # elapsed ~ 0.48 of the week
    ok_usage = {"session": 27, "week": 19, "fable": 0}
    cases = []

    def check(name, cond, detail=""):
        cases.append((name, bool(cond), detail))

    # 1. two overlapping coin entries and a disjoint maps entry: coin-a and maps start, coin-b waits
    q = [_entry(id="coin-a", queued_at="2026-10-17T20:00:00-07:00"),
         _entry(id="coin-b", owns="src/lib/coin/fines.ts", queued_at="2026-10-17T20:05:00-07:00"),
         _entry(id="maps", owns="src/lib/maps/**", queued_at="2026-10-17T20:10:00-07:00")]
    p = plan(q, ok_usage, reset, now)
    ids = [s["id"] for s in p["start"]]
    check("overlap: first coin entry starts", "coin-a" in ids, ids)
    check("overlap: second coin entry waits", "coin-b" not in ids and any(w["id"] == "coin-b" and "overlap" in w["reason"] for w in p["wait"]), p["wait"])
    check("disjoint entry starts beside it in parallel mode", "maps" in ids and [s for s in p["start"] if s["id"] == "maps"][0]["mode"] == "parallel", p["start"])

    # 2. a running session blocks an overlapping one; after: waits for done
    q = [_entry(id="run", status="running", started_at="2026-10-17T21:00:00-07:00"),
         _entry(id="next", owns="src/lib/maps/**", after="run")]
    p = plan(q, ok_usage, reset, now)
    check("after: waits until its dependency is done", not p["start"] and "after run" in p["wait"][0]["reason"], p)

    # 3. reserve: 60% week stops everything; ahead-of-pace stops; session 80% stops
    q = [_entry(id="a")]
    check("week at 60% starts nothing", not plan(q, {"session": 5, "week": 60}, reset, now)["start"])
    check("week ahead of even pace starts nothing", not plan(q, {"session": 5, "week": 45}, reset, now)["start"])
    check("week behind pace starts", plan(q, {"session": 5, "week": 30}, reset, now)["start"])
    check("session at 80% starts nothing", not plan(q, {"session": 80, "week": 10}, reset, now)["start"])

    # 4. Fable and ultracode wait for go; with go they start
    check("Fable waits for go", not plan([_entry(id="f", model="fable-5.1")], ok_usage, reset, now)["start"])
    check("ultracode waits for go", not plan([_entry(id="u", effort="ultracode")], ok_usage, reset, now)["start"])
    check("Fable with go starts", plan([_entry(id="f", model="fable-5.1", go="yes")], ok_usage, reset, now)["start"])

    # 5. usage unreadable: only S Sonnet/Opus, one at a time
    check("blind: size M waits", not plan([_entry(id="m")], None, None, now)["start"])
    check("blind: size S Sonnet starts", plan([_entry(id="s", size="S", model="sonnet-5.5", effort="medium")], None, None, now)["start"])
    check("blind: S waits while anything runs", not plan([_entry(id="r", status="running", owns="docs/**"), _entry(id="s", size="S", owns="src/x/**")], None, None, now)["start"])
    two = plan([_entry(id="s1", size="S", owns="a/**"), _entry(id="s2", size="S", owns="b/**", queued_at="2026-10-17T20:30:00-07:00")], None, None, now)
    check("blind: one start per run", len(two["start"]) == 1, two["start"])

    # 6. three per repo never; a failed dependency holds and asks for attention
    q = [_entry(id="r1", status="running", owns="a/**"), _entry(id="r2", status="running", owns="b/**"), _entry(id="c", owns="c/**")]
    check("never three sessions on one repo", not plan(q, ok_usage, reset, now)["start"])
    q = [_entry(id="dep", status="failed"), _entry(id="kid", owns="z/**", after="dep")]
    p = plan(q, ok_usage, reset, now)
    check("failed dependency holds and flags", not p["start"] and any(a["id"] == "kid" for a in p["attention"]), p)

    # 7. invalid entries are flagged, never started; a stale run is flagged
    p = plan([_entry(id="bad", model="opus-5")], ok_usage, reset, now)
    check("invalid model is flagged, not started", not p["start"] and p["attention"], p)
    p = plan([_entry(id="old", status="running", started_at="2026-10-17T10:00:00-07:00")], ok_usage, reset, now)
    check("run longer than 6 hours is flagged", any("6 hours" in a["reason"] for a in p["attention"]), p)

    # 7b. reading age: 4 hours old counts as unreadable, 1 hour old counts
    old = now - dt.timedelta(hours=4); recent = now - dt.timedelta(hours=1)
    check("a 4-hour-old reading is treated as unreadable", fresh_usage(ok_usage, old, now) is None)
    check("a 1-hour-old reading is used", fresh_usage(ok_usage, recent, now) == ok_usage)
    check("stale reading means size M waits", not plan([_entry(id="m")], fresh_usage(ok_usage, old, now), reset, now)["start"])

    # 7c. many repos: registry, shared database, global cap
    reg = {"pina-hash/idea-app": {"db": "db:idea-supabase"}, "pina-hash/idea-armory": {"db": "db:idea-supabase"},
           "pina-hash/fll-app": {"db": "db:fll-supabase"}}
    q = [_entry(id="mig", migration="0262", owns="supabase/migrations/0262_*.sql"),
         _entry(id="armory", repo="pina-hash/idea-armory", owns="server/**, db:idea-supabase", queued_at="2026-10-17T20:30:00-07:00")]
    p = plan(q, ok_usage, reset, now, reg)
    check("Armory waits while an idea-app migration holds the shared database", [s["id"] for s in p["start"]] == ["mig"], p)
    q = [_entry(id="ia", owns="src/a/**"), _entry(id="fll", repo="pina-hash/fll-app", owns="src/a/**", queued_at="2026-10-17T20:30:00-07:00")]
    check("the same path in two different repos does not collide", len(plan(q, ok_usage, reset, now, reg)["start"]) == 2)
    p = plan([_entry(id="scout", repo="FRC-Team-5669-Techmen/scouting-app")], ok_usage, reset, now, reg)
    check("an unregistered repo is flagged and never started", not p["start"] and any("unregistered" in a["reason"] for a in p["attention"]), p)
    q = [_entry(id="r1", status="running", owns="a/**"), _entry(id="r2", status="running", repo="pina-hash/fll-app", owns="a/**"),
         _entry(id="r3", status="running", repo="pina-hash/idea-armory", owns="a/**"), _entry(id="n", repo="pina-hash/fll-app", owns="z/**")]
    check("never more than three sessions across all repos", not plan(q, ok_usage, reset, now, reg)["start"])

    # 7d. models: Haiku is routable; the plan names the exact model id and effort to set
    p = plan([_entry(id="h", model="haiku-5.5", effort="low", size="S")], ok_usage, reset, now)
    check("Haiku 5.5 entries start with their exact model id and effort", p["start"] and p["start"][0]["model_id"] == "claude-haiku-5-5" and p["start"][0]["effort"] == "low", p)
    check("a 5.0 model name is refused", plan([_entry(id="old", model="opus-5")], ok_usage, reset, now)["attention"])

    q = [_entry(id="x1", status="running", effort="xhigh", go="yes", owns="a/**"), _entry(id="x2", repo="pina-hash/fll-app", effort="max", go="yes", owns="b/**")]
    check("only one xhigh-or-above session at a time", not plan(q, ok_usage, reset, now)["start"])

    # 8. NEGATIVE CONTROL: the overlap test must not call two different trees overlapping
    check("control: disjoint globs are disjoint", not globs_overlap("src/lib/coin/**", "src/lib/maps/**"))
    check("control: nested globs overlap", globs_overlap("src/lib/**", "src/lib/coin/a.ts"))

    failed = [c for c in cases if not c[1]]
    for name, ok, detail in cases:
        print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {detail}"))
    print(f"\n{len(cases) - len(failed)} of {len(cases)} checks passed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", nargs="?", choices=["plan"], help="print the dispatch plan")
    ap.add_argument("--root", default=".", help="repository root")
    ap.add_argument("--usage", help="session=NN,week=NN,fable=NN as read from claude.ai/settings/usage; omit when unreadable")
    ap.add_argument("--reset", help="the weekly reset as ISO-8601, as read from the usage page")
    ap.add_argument("--read-at", help="when the usage was read, ISO-8601; omit when read this run. Older than 3 hours counts as unreadable")
    ap.add_argument("--now", help="ISO-8601; defaults to the current time")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.cmd != "plan":
        ap.print_help()
        return 2
    now = dt.datetime.fromisoformat(a.now) if a.now else dt.datetime.now(dt.timezone.utc).astimezone()
    reset = dt.datetime.fromisoformat(a.reset) if a.reset else None
    read_at = dt.datetime.fromisoformat(a.read_at) if a.read_at else None
    usage = fresh_usage(parse_usage(a.usage), read_at, now)
    print(json.dumps(plan(load_queue(a.root), usage, reset, now, load_registry(a.root)), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
