#!/usr/bin/env python3
"""Pre-delivery validation for an IDEA assignment spec.

Enforces IDEA_RUBRIC_STANDARDS.md and the arithmetic in IDEA_MATERIAL_SPEC_v2.md.
Written 2026-08-30 after a two-level criterion reached the engine: point sums had
been checked by hand every time and the rubric rules had not been checked at all.

    python3 validate-assignment-spec.py <spec.json> [more.json ...]

Exit 1 if any spec fails.
"""
import json
import re
import sys

WORD = re.compile(r"[*_`#>|\[\]()]")
FIGURE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
# List markers are not reading load. Counting "-" and "1." as words inflated the
# count by roughly one per bullet and failed a compliant module on 2026-09-04.
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+", re.M)
INSTRUCTION_CEILING = 300


def words(s):
    t = LIST_MARKER.sub(" ", FIGURE.sub(" ", s or ""))
    return len([w for w in WORD.sub(" ", t).split() if w.strip()])


def check(spec, name):
    errs, warns = [], []
    E, W = errs.append, warns.append
    meta = spec.get("meta", {})

    if spec.get("kind") != "assignment":
        E(f"kind is {spec.get('kind')!r}, expected 'assignment'")
        return errs, warns

    block_ids, labels = [], set()
    total = 0

    for m in spec.get("modules", []):
        mid = m.get("id", "?")
        pts = m.get("points")
        total += pts or 0
        blocks = m.get("blocks", [])
        rubric = m.get("rubric", [])

        block_sum = sum(b.get("points", 0) for b in blocks)
        if block_sum != pts:
            E(f'module "{mid}" blocks sum to {block_sum}, module is {pts}')

        if not rubric:
            E(f'module "{mid}" has no rubric')

        rubric_max = 0
        for c in rubric:
            cid = c.get("id", "?")
            levels = c.get("levels", [])
            n = len(levels)
            top = max((l["points"] for l in levels), default=0)
            rubric_max += top

            # IDEA_RUBRIC_STANDARDS: four by default, three when near binary,
            # never two. This is the one the engine refuses.
            if n < 3:
                E(f'module "{mid}" criterion "{c.get("criterion","?")}": '
                  f"{n} level{'' if n == 1 else 's'}, needs 3 or 4")
            if n > 4:
                E(f'module "{mid}" criterion "{cid}": {n} levels, maximum is 4')

            # Three distinct values above zero are impossible below 2 points,
            # so a criterion worth less than 2 cannot satisfy the level rule.
            if top < 2:
                E(f'module "{mid}" criterion "{cid}": worth {top}, cannot carry '
                  f"3 distinct levels. Merge it or give it weight.")

            if levels and levels[-1].get("points") != 0:
                E(f'module "{mid}" criterion "{cid}": bottom level is '
                  f'{levels[-1].get("points")}, must be 0')

            vals = [l.get("points") for l in levels]
            if vals != sorted(vals, reverse=True):
                E(f'module "{mid}" criterion "{cid}": levels not in descending order')
            if len(set(vals)) != len(vals):
                E(f'module "{mid}" criterion "{cid}": duplicate level point values')

            for l in levels:
                labels.add(l.get("label", ""))
                s = l.get("short", "")
                if not s:
                    E(f'module "{mid}" criterion "{cid}": a level has no short form')
                elif len(s.split()) > 6:
                    E(f'module "{mid}" criterion "{cid}": short "{s}" is '
                      f"{len(s.split())} words, maximum 6")
                elif s[-1] in ".!?":
                    E(f'module "{mid}" criterion "{cid}": short "{s}" ends in '
                      f"punctuation")
                if not l.get("descriptor"):
                    E(f'module "{mid}" criterion "{cid}": a level has no descriptor')

        if rubric and rubric_max != pts:
            E(f'module "{mid}" rubric maxima sum to {rubric_max}, module is {pts}')

        iw = sum(words(b.get("content", "")) for b in blocks
                 if b.get("type") == "instructions")
        if iw > INSTRUCTION_CEILING:
            E(f'module "{mid}" instructions are {iw} words, ceiling is '
              f"{INSTRUCTION_CEILING}")

        for b in blocks:
            if b.get("id"):
                block_ids.append(b["id"])

        # Paste routing: SpecRenderer sends a pasted image to the imageZone in the
        # SAME module. Text fields with no zone beside them refuse the paste.
        zones = [b for b in blocks if b.get("type") == "imageZone"]
        fields = [b for b in blocks if b.get("type") == "textField"]
        if zones and not fields:
            W(f'module "{mid}" has an imageZone and no textField: nothing to '
              f"paste a screenshot into")
        if fields and not zones:
            W(f'module "{mid}" has text fields and no imageZone: a pasted image '
              f"is refused here")

    if total != meta.get("totalPoints"):
        E(f"modules sum to {total}, meta.totalPoints is {meta.get('totalPoints')}")

    dupes = {i for i in block_ids if block_ids.count(i) > 1}
    if dupes:
        E(f"duplicate block ids across the spec: {sorted(dupes)}")
    # Criterion ids are NOT spec-wide. rubricFromSpec generates `<moduleId>-<id>`,
    # so m1-r2 and m2-r2 are distinct and a cross-module repeat is harmless. A
    # repeat INSIDE one module collides, which is the case worth refusing.
    for m in spec.get("modules", []):
        ids = [c.get("id") for c in m.get("rubric", [])]
        d = {i for i in ids if ids.count(i) > 1}
        if d:
            E(f'module "{m.get("id")}" repeats criterion ids: {sorted(d)}')

    # Responses key on block_id and scores on `<moduleId>-<criterionId>`, so a
    # positional id is a rename waiting to happen and a rename orphans work.
    POSITIONAL = re.compile(r"^[cfrmtz]\d{1,2}$", re.I)
    stale = [i for i in block_ids if POSITIONAL.match(i)]
    stale += [m.get("id") for m in spec.get("modules", []) if POSITIONAL.match(m.get("id", ""))]
    stale += [c.get("id") for m in spec.get("modules", []) for c in m.get("rubric", [])
              if POSITIONAL.match(c.get("id", ""))]
    if stale:
        W(f"positional ids, which cannot be renamed after publishing without "
          f"orphaning student work: {sorted(set(stale))}")

    families = [{"Complete", "Proficient", "Developing", "Absent"},
                {"Excellent", "Good", "Fair", "None"}]
    if labels and not any(labels <= f for f in families):
        W(f"level labels are not one consistent family: {sorted(labels)}")

    raw = json.dumps(spec, ensure_ascii=False)
    if "\u2014" in raw:
        E("em dash present")
    for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                "Saturday", "Sunday"):
        if re.search(rf"\b{day}\b", raw):
            E(f"student-facing copy names a weekday: {day}")
    brit = re.findall(r"\b(centre[sd]?|colour[s]?|behaviour[s]?|organis\w+|"
                      r"recognis\w+|modell\w+|labour|defence|licence|programme|"
                      r"whilst|amongst)\b", raw, re.I)
    if brit:
        E(f"British spellings: {sorted(set(brit))}")
    if "### Sources" not in raw:
        E("no Sources block (IDEA_MATERIALS_PROCESS.md v3.1)")

    return errs, warns


if __name__ == "__main__":
    bad = False
    for path in sys.argv[1:]:
        errs, warns = check(json.load(open(path)), path)
        name = path.split("/")[-1]
        if errs:
            bad = True
            print(f"FAIL  {name}")
            for e in errs:
                print(f"        {e}")
        else:
            print(f"PASS  {name}")
        for w in warns:
            print(f"  warn  {w}")
    sys.exit(1 if bad else 0)
