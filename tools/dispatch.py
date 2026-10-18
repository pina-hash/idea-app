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
  * Usage ceiling: automation never takes his week (or his weekly Fable limit) past 60%, at any
    hour, with nobody watching. Changed 2026-10-18 after a night of nothing starting: the
    dispatcher PROJECTS usage as the last reading (any age, from any of his machines, shared
    through the Session Dispatcher artifact) plus the estimated cost (COST) of every session
    started since, and starts a candidate only if that plus its own cost stays at or under 60%.
    A reading under 3 hours old also waits while the current session is at 80% or more.
    No reading has ever been taken: only size S starts.
  * Fable 5.1 and the xhigh, max and ultracode efforts never start on their own: the entry
    needs `go: yes`, which only Mr. Pina gives, in a chat.
  * Self-healing: an entry left `running` with no `trigger_id` for 20 minutes (its dispatcher
    died between claiming and launching) is released and started again.
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
WEEK_CEILING = 60.0      # Mr. Pina, 2026-10-17: automation never takes the week past 60%
FABLE_CEILING = 60.0     # the same ceiling on the separate weekly Fable limit
SESSION_CEILING = 80.0   # a fresh reading this high waits for the five-hour window to reset
FRESH_MIN = 180          # a reading younger than this also gates on the current session
ORPHAN_MIN = 20          # running with no trigger_id this long: its dispatcher died; release it
# Estimated share of his WEEK one dispatched session costs, by model and size. Calibrated
# 2026-10-18 from readings of 27% (01:58 PT) and 33% (15:10 PT) around one Opus 5.5 L run plus
# his own chats, and kept high so the projection errs toward waiting.
COST = {
    "haiku-5.5": {"S": 0.2, "M": 0.5, "L": 1.0},
    "sonnet-5.5": {"S": 0.5, "M": 1.5, "L": 3.0},
    "opus-5.5": {"S": 1.0, "M": 3.0, "L": 6.0},
    "fable-5.1": {"S": 2.0, "M": 6.0, "L": 12.0},
}
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


def is_own_new_file(item: str) -> bool:
    """`its own docs/history/ entry` names a new file each session creates; two never collide."""
    return item.strip().lower().startswith("its own ")


def surfaces_overlap(owns_a: list[str], owns_b: list[str]) -> bool:
    paths_a = [x for x in owns_a if not is_resource(x) and not is_own_new_file(x)]
    paths_b = [x for x in owns_b if not is_resource(x) and not is_own_new_file(x)]
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


def iso(s: str | None) -> dt.datetime | None:
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def cost(e: dict) -> float:
    return COST.get(e.get("model"), {}).get(e.get("size"), 6.0)


def projected(usage: dict | None, read_at: dt.datetime | None, entries: list[dict]) -> dict | None:
    """The last reading (any age) plus the estimated cost of every session started after it.
    A reading taken this run (read_at None) already includes everything that ran."""
    if usage is None:
        return None
    week, fable = usage.get("week", 0.0), usage.get("fable", 0.0)
    if read_at is not None:
        for e in entries:
            st = iso(e.get("started_at"))
            if st and st > read_at and e.get("status") in ("running", "done", "failed"):
                week += cost(e)
                if e.get("model") == "fable-5.1":
                    fable += cost(e)
    return {"week": round(week, 1), "fable": round(fable, 1), "session": usage.get("session", 0.0)}


def needs_go(e: dict) -> bool:
    return e.get("needs_go") or e["model"] in GATED_MODELS or e["effort"] in GATED_EFFORTS


# ---------------------------------------------------------------- the plan

def plan(entries: list[dict], usage: dict | None, reset: dt.datetime | None, now: dt.datetime,
         registry: dict | None = None, read_at: dt.datetime | None = None) -> dict:
    by_id = {e["id"]: e for e in entries}
    start, wait, attention, release = [], [], [], []

    for e in entries:
        errs = validate(e)
        if errs:
            attention.append({"id": e.get("id") or e["path"], "reason": "invalid entry: " + "; ".join(errs)})
        if e.get("status") == "running" and e.get("started_at"):
            started = iso(e["started_at"])
            if started is None:
                attention.append({"id": e["id"], "reason": f"started_at {e['started_at']!r} is not ISO-8601"})
            elif not e.get("trigger_id") and (now - started) > dt.timedelta(minutes=ORPHAN_MIN):
                release.append({"id": e["id"], "path": e["path"],
                                "reason": f"claimed at {e['started_at']} but no session was ever created; back to queued"})
            elif (now - started) > dt.timedelta(hours=6):
                attention.append({"id": e["id"], "reason": f"running for more than 6 hours (since {e['started_at']}); check the session"})

    released = {r["id"] for r in release}
    running = [e for e in entries if e.get("status") == "running" and e["id"] not in released]
    proj = projected(usage, read_at, entries)
    fresh = usage is not None and (read_at is None or (now - read_at) <= dt.timedelta(minutes=FRESH_MIN))

    queued = [e for e in entries if (e.get("status") == "queued" or e.get("id") in released) and not validate(e)]
    queued.sort(key=lambda e: (e.get("queued_at", ""), e["id"]))
    starting: list[dict] = []
    spent = spent_fable = 0.0

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
        c = cost(e)
        if proj is None:
            if e["size"] != "S":
                wait.append({"id": e["id"], "reason": "no usage reading exists at all; only size S starts until one is taken"})
                continue
        else:
            wk = proj["week"] + spent + c
            if wk > WEEK_CEILING:
                wait.append({"id": e["id"], "reason": f"would take the week to about {wk:.0f}% (projected {proj['week'] + spent:.0f}% + {c:g}%), past the {WEEK_CEILING:.0f}% ceiling"})
                continue
            if e["model"] == "fable-5.1" and proj["fable"] + spent_fable + c > FABLE_CEILING:
                wait.append({"id": e["id"], "reason": f"would take the Fable week past {FABLE_CEILING:.0f}%"})
                continue
            if fresh and proj["session"] >= SESSION_CEILING:
                wait.append({"id": e["id"], "reason": f"current session at {proj['session']:.0f}%, waiting for its five-hour reset"})
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
        spent += c
        if e["model"] == "fable-5.1":
            spent_fable += c
        start.append({"id": e["id"], "path": e["path"], "repo": e["repo"], "model": e["model"],
                      "model_id": MODEL_IDS[e["model"]], "subagent_model": MODEL_ALIAS[e["model"]],
                      "effort": "xhigh" if e["effort"] == "ultracode" else e["effort"],
                      "ultracode": e["effort"] == "ultracode", "est_cost_pct": c,
                      "mode": mode, "ledger": e["ledger"], "released": e["id"] in released})

    return {
        "now": now.isoformat(),
        "usage": usage if usage is not None else "none",
        "read_at": read_at.isoformat() if read_at else None,
        "projected": proj,
        "projected_after_starts": round(proj["week"] + spent, 1) if proj else None,
        "running": [r["id"] for r in running],
        "release": release,
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
    q = [_entry(id="run", status="running", trigger_id="t", started_at="2026-10-17T21:00:00-07:00"),
         _entry(id="next", owns="src/lib/maps/**", after="run")]
    p = plan(q, ok_usage, reset, now)
    check("after: waits until its dependency is done", not p["start"] and "after run" in p["wait"][0]["reason"], p)

    # 3. the 60% ceiling, by projection (no even-pace rule)
    q = [_entry(id="a")]   # Opus M, about 3%
    check("projected past 60% waits", not plan(q, {"session": 5, "week": 58}, reset, now)["start"])
    check("projected at 60% or under starts", plan(q, {"session": 5, "week": 57}, reset, now)["start"])
    check("week at 45% midweek still starts (no pace rule)", plan(q, {"session": 5, "week": 45}, reset, now)["start"])
    check("session at 80% on a fresh reading waits", not plan(q, {"session": 80, "week": 10}, reset, now)["start"])
    q = [_entry(id="ran", status="done", size="L", started_at="2026-10-17T21:30:00-07:00"), _entry(id="b", size="L", owns="z/**")]
    p = plan(q, {"session": 5, "week": 50}, reset, now, None, now - dt.timedelta(hours=1))
    check("sessions started after the reading count toward the projection", not p["start"] and p["projected"]["week"] == 56.0, p)
    q = [_entry(id="c1", size="L", owns="a/**"), _entry(id="c2", repo="pina-hash/fll-app", size="L", owns="b/**", queued_at="2026-10-17T20:05:00-07:00")]
    check("several starts in one run add up against the ceiling", len(plan(q, {"session": 5, "week": 49}, reset, now)["start"]) == 1)
    check("the Fable week has its own 60% ceiling", not plan([_entry(id="f", model="fable-5.1", go="yes", size="L")], {"session": 5, "week": 10, "fable": 55}, reset, now)["start"])

    # 4. Fable and ultracode wait for go; with go they start
    check("Fable waits for go", not plan([_entry(id="f", model="fable-5.1")], ok_usage, reset, now)["start"])
    check("ultracode waits for go", not plan([_entry(id="u", effort="ultracode")], ok_usage, reset, now)["start"])
    check("Fable with go starts", plan([_entry(id="f", model="fable-5.1", go="yes")], ok_usage, reset, now)["start"])

    # 5. THE 2026-10-18 OVERNIGHT FAILURE: a reading hours old must not stop M and L work,
    #    and separate repos run at the same time
    stale = now - dt.timedelta(hours=9)
    q = [_entry(id="coin", size="L", owns="src/routes/market/**, db:idea-supabase"),
         _entry(id="fll", repo="pina-hash/fll-app", size="L", owns="src/**", queued_at="2026-10-17T20:01:00-07:00"),
         _entry(id="frc", repo="FRC-Team-5669-Techmen/frc-app", size="M", owns="src/**", queued_at="2026-10-17T20:02:00-07:00")]
    ids = [s["id"] for s in plan(q, ok_usage, reset, now, None, stale)["start"]]
    check("a 9-hour-old reading still starts L and M work", ids == ["coin", "fll", "frc"], ids)
    check("a stale reading does not gate on its old session number", plan([_entry(id="a")], {"session": 95, "week": 10}, reset, now, None, stale)["start"])
    check("no reading at all: size M waits", not plan([_entry(id="m")], None, None, now)["start"])
    two = plan([_entry(id="s1", size="S", owns="a/**"), _entry(id="s2", size="S", owns="b/**", queued_at="2026-10-17T20:30:00-07:00")], None, None, now)
    check("no reading at all: size S jobs start, more than one", len(two["start"]) == 2, two["start"])

    # 5b. self-healing: a claim whose dispatcher died is released and started again
    p = plan([_entry(id="orphan", status="running", started_at="2026-10-17T12:12:00-07:00")], ok_usage, reset, now)
    check("a claim with no session after 20 minutes is released and restarted", p["release"] and p["start"] and p["start"][0]["released"], p)
    p = plan([_entry(id="young", status="running", started_at="2026-10-17T22:00:00-07:00")], ok_usage, reset, now)
    check("a claim under 20 minutes old is left alone", not p["release"] and not p["start"], p)

    # 6. three per repo never; a failed dependency holds and asks for attention
    q = [_entry(id="r1", status="running", owns="a/**"), _entry(id="r2", status="running", owns="b/**"), _entry(id="c", owns="c/**")]
    check("never three sessions on one repo", not plan(q, ok_usage, reset, now)["start"])
    q = [_entry(id="dep", status="failed"), _entry(id="kid", owns="z/**", after="dep")]
    p = plan(q, ok_usage, reset, now)
    check("failed dependency holds and flags", not p["start"] and any(a["id"] == "kid" for a in p["attention"]), p)

    # 7. invalid entries are flagged, never started; a stale run is flagged
    p = plan([_entry(id="bad", model="opus-5")], ok_usage, reset, now)
    check("invalid model is flagged, not started", not p["start"] and p["attention"], p)
    p = plan([_entry(id="old", status="running", trigger_id="t", started_at="2026-10-17T10:00:00-07:00")], ok_usage, reset, now)
    check("run longer than 6 hours is flagged", any("6 hours" in a["reason"] for a in p["attention"]), p)

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
    check("'its own docs/history/ entry' on both sides is not a collision",
          not surfaces_overlap(["tools/a.mjs", "its own docs/history/ entry"], ["src/x/**", "its own docs/history/ entry"]))
    check("control: a real shared file still collides",
          surfaces_overlap(["docs/ARMORY.md", "its own docs/history/ entry"], ["docs/ARMORY.md"]))

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
    ap.add_argument("--read-at", help="when the usage was read, ISO-8601 (omit when read this run); sessions started after it are added to the projection")
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
    read_at = iso(a.read_at)
    print(json.dumps(plan(load_queue(a.root), parse_usage(a.usage), reset, now, load_registry(a.root), read_at), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
