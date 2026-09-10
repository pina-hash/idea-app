#!/usr/bin/env python3
"""Pre-delivery validation for an IDEA assignment spec, or a ported HTML
assignment and the manifest inside it.

Enforces IDEA_RUBRIC_STANDARDS.md and the arithmetic in IDEA_MATERIAL_SPEC_v2.md.
Written 2026-08-30 after a two-level criterion reached the engine: point sums had
been checked by hand every time and the rubric rules had not been checked at all.

    python3 validate-assignment-spec.py <spec.json | assignment.html> [more ...]

TWO FORMATS, ONE SET OF RUBRIC RULES. A v1 spec (schemaVersion 1, kind
"assignment") is a JSON description of a worksheet the engine renders. A ported
HTML assignment (schemaVersion 3, kind "html-assignment") IS the worksheet -- one
self-contained document -- carrying its manifest in a
`<script type="application/json" id="idea-manifest">` block. The two describe
different things and share every rubric rule, so `level_errors` below is called
by both rather than written twice: a level rule that held for one and not the
other is the drift this tool exists to catch.

Hand it the .html and it reads the manifest out of the document, which is the
only form that can check the manifest's fields against the document's own
`data-field` attributes -- the pair whose mismatch drops a student's answer with
nothing anywhere to say so. A manifest handed over as bare .json is still
checked, and the report says which half was skipped.

Exit 1 if any file fails.
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

# Kept term for term with WEEKDAYS and BRITISH_SPELLING_RE in
# src/lib/classroom/html-assignment/manifest.ts. Python cannot import
# TypeScript and the browser cannot run this tool, so the two are a mirror --
# and tests/html-assignment-manifest-parity.test.ts reads THIS FILE and asserts
# they still agree, because a mirror nobody compares is just two lists.
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday")
BRITISH = (r"\b(centre[sd]?|colour[s]?|behaviour[s]?|organis\w+|"
           r"recognis\w+|modell\w+|labour|defence|licence|programme|"
           r"whilst|amongst)\b")

HTML_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
HTML_BLOCK_TYPES = ("text", "longText", "checkbox", "radio", "image", "table")
MANIFEST_SCRIPT_ID = "idea-manifest"
# Statements a spec would never make and a ported document reaches for, from
# the sandbox's own costs. `localStorage` THROWS in an opaque origin.
SANDBOX_TRAPS = (
    ("localStorage", "localStorage throws in an opaque origin; autosave goes "
                     "through the bridge (idea:change)"),
    ("sessionStorage", "sessionStorage throws in an opaque origin"),
    ("document.cookie", "there are no cookies on the sandbox origin"),
    ("window.parent", "the frame has no reach into the parent document"),
    ("window.top", "the frame has no reach into the parent document"),
)


def words(s):
    t = LIST_MARKER.sub(" ", FIGURE.sub(" ", s or ""))
    return len([w for w in WORD.sub(" ", t).split() if w.strip()])


def copy_errors(raw, where="student-facing copy"):
    """Weekday and British-spelling refusals over a blob of copy."""
    out = []
    for day in WEEKDAYS:
        if re.search(rf"\b{day}\b", raw):
            out.append(f"{where} names a weekday: {day}")
    brit = re.findall(BRITISH, raw, re.I)
    if brit:
        out.append(f"{where} uses British spellings: {sorted(set(brit))}")
    return out


def level_errors(by_name, by_id, levels, labels):
    """THE RUBRIC RULES, and the ONE copy of them in this tool.

    Called by the v1 spec path and by the manifest path alike. `by_name` and
    `by_id` are the two prefixes the messages have always used -- the count
    refusal names the criterion's TEXT, everything else names its id -- and they
    are passed in rather than rebuilt so the v1 output is byte-identical to what
    this tool printed before the manifest path existed.

    Returns (errors, top), where `top` is the criterion maximum.
    """
    errs = []
    n = len(levels)
    top = max((l.get("points", 0) for l in levels), default=0)

    # IDEA_RUBRIC_STANDARDS: four by default, three when near binary,
    # never two. This is the one the engine refuses.
    if n < 3:
        errs.append(f'{by_name}: {n} level{"" if n == 1 else "s"}, needs 3 or 4')
    if n > 4:
        errs.append(f"{by_id}: {n} levels, maximum is 4")

    # Three distinct values above zero are impossible below 2 points,
    # so a criterion worth less than 2 cannot satisfy the level rule.
    if top < 2:
        errs.append(f"{by_id}: worth {top}, cannot carry "
                    f"3 distinct levels. Merge it or give it weight.")

    if levels and levels[-1].get("points") != 0:
        errs.append(f"{by_id}: bottom level is "
                    f'{levels[-1].get("points")}, must be 0')

    vals = [l.get("points") for l in levels]
    if vals != sorted(vals, reverse=True):
        errs.append(f"{by_id}: levels not in descending order")
    if len(set(vals)) != len(vals):
        errs.append(f"{by_id}: duplicate level point values")

    for l in levels:
        labels.add(l.get("label", ""))
        sh = l.get("short", "")
        if not sh:
            errs.append(f"{by_id}: a level has no short form")
        elif len(sh.split()) > 6:
            errs.append(f'{by_id}: short "{sh}" is '
                        f"{len(sh.split())} words, maximum 6")
        elif sh[-1] in ".!?":
            errs.append(f'{by_id}: short "{sh}" ends in punctuation')
        if not l.get("descriptor"):
            errs.append(f"{by_id}: a level has no descriptor")

    return errs, top


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
            # The rubric rules are level_errors', shared with the manifest path.
            found, top = level_errors(
                f'module "{mid}" criterion "{c.get("criterion","?")}"',
                f'module "{mid}" criterion "{cid}"',
                levels, labels)
            errs.extend(found)
            rubric_max += top

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
    for day in WEEKDAYS:
        if re.search(rf"\b{day}\b", raw):
            E(f"student-facing copy names a weekday: {day}")
    brit = re.findall(BRITISH, raw, re.I)
    if brit:
        E(f"British spellings: {sorted(set(brit))}")
    if "### Sources" not in raw:
        E("no Sources block (IDEA_MATERIALS_PROCESS.md v3.1)")

    return errs, warns


# ---------------------------------------------------------------------------
# The ported HTML assignment.
#
# Reading the document with regexes rather than an HTML parser, and the reason
# is agreement rather than laziness: the browser importer
# (src/lib/classroom/html-assignment/manifest.ts) has no parser available in a
# node test either, so both sides do the same narrow job the same narrow way. A
# document that validated differently here than at import is the failure this
# format is most exposed to.
# ---------------------------------------------------------------------------

SCRIPT_RE = re.compile(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", re.I)
DATA_FIELD_RE = re.compile(
    r"\sdata-field\s*=\s*(\"([^\"]*)\"|'([^']*)'|([^\s\"'`=<>]+))", re.I)
COMMENT_RE = re.compile(r"<!--[\s\S]*?-->")
STYLE_RE = re.compile(r"<style\b[^>]*>[\s\S]*?</style\s*>", re.I)
TAG_RE = re.compile(r"<[^>]*>")


def _attr(attrs, key):
    m = re.search(rf"\b{key}\s*=\s*(\"([^\"]*)\"|'([^']*)'|([^\s\"'`=<>]+))",
                  attrs, re.I)
    if not m:
        return None
    return (m.group(2) or m.group(3) or m.group(4) or "").strip()


def _inert_stripped(html):
    """Comments, scripts and styles out. A data-field inside a comment is not an
    input, and one written as a string inside the document's own JavaScript is
    what a ported document's autosave routinely carries."""
    return STYLE_RE.sub(" ", SCRIPT_RE.sub(" ", COMMENT_RE.sub(" ", html or "")))


def extract_manifest(html):
    """(json_text, count). Matched on the type AND the id: a document may carry
    other application/json scripts, and two manifests are refused rather than
    resolved by taking the first."""
    found = []
    for m in SCRIPT_RE.finditer(html or ""):
        if (_attr(m.group(1), "type") or "").lower() != "application/json":
            continue
        if (_attr(m.group(1), "id") or "") != MANIFEST_SCRIPT_ID:
            continue
        found.append(m.group(2))
    return (found[0] if found else None), len(found)


def document_fields(html):
    seen, out = set(), []
    for m in DATA_FIELD_RE.finditer(_inert_stripped(html)):
        v = (m.group(2) or m.group(3) or m.group(4) or "").strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def document_text(html):
    return re.sub(r"\s+", " ", TAG_RE.sub(" ", _inert_stripped(html))).strip()


def check_manifest(manifest, name, html=None):
    """A ported HTML assignment. `html` is the document; None means the manifest
    arrived on its own, and the checks that need the document are SKIPPED WITH A
    WARNING rather than silently passing -- a check that cannot run must never
    read as a check that ran."""
    errs, warns = [], []
    E, W = errs.append, warns.append

    if manifest.get("schemaVersion") != 3:
        E(f"schemaVersion is {manifest.get('schemaVersion')!r}, expected 3")
    if manifest.get("kind") != "html-assignment":
        E(f"kind is {manifest.get('kind')!r}, expected 'html-assignment'")
        return errs, warns
    for key in ("title", "course"):
        if not str(manifest.get(key) or "").strip():
            E(f"manifest has no {key}")

    modules = manifest.get("modules") or []
    if not modules:
        E("manifest has no modules")
        return errs, warns

    module_ids, block_ids, fields, labels = [], [], {}, set()
    total = 0
    positional = re.compile(r"^[cfrmtz]\d{1,2}$", re.I)
    stale = []

    for m in modules:
        mid = m.get("id", "?")
        if not HTML_ID.match(str(mid)):
            E(f'module id "{mid}" is not [A-Za-z0-9_-] up to 40 characters')
        if mid in module_ids:
            E(f'duplicate module id "{mid}"')
        module_ids.append(mid)
        if positional.match(str(mid)):
            stale.append(mid)
        if not str(m.get("title") or "").strip():
            E(f'module "{mid}" has no title')

        pts = m.get("points")
        if not isinstance(pts, int) or isinstance(pts, bool) or pts < 0:
            E(f'module "{mid}" points is {pts!r}, needs a whole number')
            pts = 0
        total += pts

        aud = m.get("audience")
        if aud is not None and aud not in ("team", "individual"):
            E(f'module "{mid}" audience is {aud!r}, expected team or individual')

        for b in m.get("blocks") or []:
            bid = b.get("id", "?")
            if not HTML_ID.match(str(bid)):
                E(f'module "{mid}" block id "{bid}" is not [A-Za-z0-9_-] up to '
                  f"40 characters. It becomes block_id in classroom_responses.")
            if bid in block_ids:
                E(f'duplicate block id "{bid}" -- block ids key every stored '
                  f"answer, so two blocks sharing one write to the same row")
            block_ids.append(bid)
            if positional.match(str(bid)):
                stale.append(bid)
            f = str(b.get("field") or "").strip()
            if not f:
                E(f'module "{mid}" block "{bid}" has no field')
            elif f in fields:
                E(f'blocks "{fields[f]}" and "{bid}" both claim the field "{f}"')
            else:
                fields[f] = bid
            if b.get("type") not in HTML_BLOCK_TYPES:
                E(f'module "{mid}" block "{bid}" type is {b.get("type")!r}, '
                  f"expected one of {', '.join(HTML_BLOCK_TYPES)}")

        criteria = m.get("criteria") or []
        if not criteria:
            E(f'module "{mid}" has no criteria')
        crit_ids, crit_sum = [], 0
        for c in criteria:
            cid = c.get("id", "?")
            if not HTML_ID.match(str(cid)):
                E(f'module "{mid}" criterion id "{cid}" is not [A-Za-z0-9_-] '
                  f"up to 40 characters")
            # Criterion ids are NOT manifest-wide. rubricFromSpec generates
            # `<moduleId>-<id>`, so m1-r2 and m2-r2 are distinct and a
            # cross-module repeat is harmless. A repeat INSIDE one module
            # collides, which is the case worth refusing.
            if cid in crit_ids:
                E(f'module "{mid}" repeats criterion id "{cid}"')
            crit_ids.append(cid)
            if positional.match(str(cid)):
                stale.append(cid)
            if not str(c.get("text") or "").strip():
                E(f'module "{mid}" criterion "{cid}" has no text')

            found, top = level_errors(
                f'module "{mid}" criterion "{c.get("text","?")}"',
                f'module "{mid}" criterion "{cid}"',
                c.get("levels") or [], labels)
            errs.extend(found)
            crit_sum += top
            declared = c.get("points")
            if declared is not None and declared != top:
                E(f'module "{mid}" criterion "{cid}" declares {declared} points '
                  f"but its top level is worth {top}")
            if declared is None:
                E(f'module "{mid}" criterion "{cid}" has no points value '
                  f"(it is the top level's, {top})")

        # The module half of the three-way sum.
        if criteria and crit_sum != pts:
            E(f'module "{mid}" criteria sum to {crit_sum}, module is {pts}')

    # The manifest half.
    if total != manifest.get("points"):
        E(f"modules sum to {total}, manifest points is {manifest.get('points')}")

    # The document half: both directions, and neither is the cosmetic one.
    if html is None:
        W("no document: the manifest's fields were NOT checked against the "
          "document's [data-field] attributes. Run this on the .html.")
    else:
        in_doc = set(document_fields(html))
        missing = sorted(f for f in fields if f not in in_doc)
        if missing:
            E(f"manifest declares fields the document has no [data-field] for: "
              f"{missing}. A block with no input can never be answered.")
        undeclared = sorted(f for f in in_doc if f not in fields)
        if undeclared:
            E(f"document has [data-field] attributes the manifest does not "
              f"declare: {undeclared}. A student's answer there is dropped.")
        for trap, why in SANDBOX_TRAPS:
            if trap in html:
                W(f"document reaches for {trap}: {why}")
        if "allow-same-origin" in html:
            E("document mentions allow-same-origin. With allow-scripts that "
              "pair lets the frame remove its own sandbox attribute.")
        errs.extend(copy_errors(document_text(html), "the document"))

    raw = json.dumps(manifest, ensure_ascii=False)
    if "\u2014" in raw:
        E("em dash present")
    errs.extend(copy_errors(raw, "the manifest"))

    if stale:
        W(f"positional ids, which cannot be renamed after publishing without "
          f"orphaning student work: {sorted(set(stale))}")

    families = [{"Complete", "Proficient", "Developing", "Absent"},
                {"Excellent", "Good", "Fair", "None"}]
    if labels and not any(labels <= f for f in families):
        W(f"level labels are not one consistent family: {sorted(labels)}")

    return errs, warns


def check_path(path):
    """Route a file to the right checker, by what is IN it rather than by its
    extension alone -- a manifest saved as .json is still a manifest."""
    if path.lower().endswith((".html", ".htm")):
        html = open(path, encoding="utf-8").read()
        text, count = extract_manifest(html)
        if count > 1:
            return [f"the document carries {count} "
                    f'<script type="application/json" id="{MANIFEST_SCRIPT_ID}"> '
                    f"blocks; there must be exactly one"], []
        if text is None:
            return [f"the document carries no "
                    f'<script type="application/json" id="{MANIFEST_SCRIPT_ID}"> '
                    f"manifest"], []
        try:
            manifest = json.loads(text)
        except ValueError as e:
            return [f"the manifest is not valid JSON: {e}"], []
        return check_manifest(manifest, path, html)

    doc = json.load(open(path, encoding="utf-8"))
    if doc.get("kind") == "html-assignment" or doc.get("schemaVersion") == 3:
        return check_manifest(doc, path, None)
    return check(doc, path)


if __name__ == "__main__":
    bad = False
    for path in sys.argv[1:]:
        errs, warns = check_path(path)
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
