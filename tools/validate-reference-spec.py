"""Mirror of _classroom_check_reference_spec from 0092.
Catches an import failure here instead of in the Supabase SQL editor.
"""
import json, re, sys

BANNED = ['points', 'totalPoints', 'rubric', 'aiLevel',
          'declarations', 'approvalGate', 'modules']
BLOCK_TYPES = {'instructions', 'keyValue', 'dataTable',
               'callout', 'cardGrid', 'linkCard', 'calc'}
SLUG_RE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
COLKEY_RE = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
URL_RE = re.compile(r'^https?://', re.I)

errors = []
warnings = []

PAYLOAD_CAP = 400_000  # pg_column_size cap enforced by classroom_set_reference_spec


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def all_keys(value, depth=0):
    out = []
    if depth > 12:
        return out
    if isinstance(value, dict):
        for k, v in value.items():
            out.append(k)
            out.extend(all_keys(v, depth + 1))
    elif isinstance(value, list):
        for v in value:
            out.extend(all_keys(v, depth + 1))
    return out


def check(spec):
    if not isinstance(spec, dict):
        err('spec must be an object'); return
    if spec.get('kind') != 'reference':
        err('kind must be "reference"')
    if spec.get('schemaVersion') != 2:
        err('schemaVersion must be 2')

    keys = set(all_keys(spec))
    for b in BANNED:
        if b in keys:
            err(f'banned key present anywhere in tree: "{b}"')

    meta = spec.get('meta')
    if not isinstance(meta, dict):
        err('meta object required')
    else:
        if not str(meta.get('referenceId', '')).strip():
            err('meta.referenceId required')
        if not str(meta.get('title', '')).strip():
            err('meta.title required')

    nav = spec.get('navigation')
    if nav is not None and nav not in ('tabs', 'stacked'):
        err('navigation must be tabs or stacked')

    sections = spec.get('sections')
    if not isinstance(sections, list) or not sections:
        err('non-empty sections array required'); return
    if len(sections) > 40:
        err('at most 40 sections')

    seen = set()
    for i, sec in enumerate(sections, 1):
        if not isinstance(sec, dict):
            err(f'section {i} not an object'); continue
        slug = sec.get('slug')
        if not isinstance(slug, str) or not SLUG_RE.match(slug or '') or len(slug or '') > 60:
            err(f'section {i} bad slug: {slug!r}'); continue
        if slug in seen:
            err(f'duplicate slug "{slug}"')
        seen.add(slug)
        if not str(sec.get('title', '')).strip():
            err(f'section "{slug}" needs a title')

        blocks = sec.get('blocks')
        if not isinstance(blocks, list) or not blocks:
            err(f'section "{slug}" needs non-empty blocks'); continue
        if len(blocks) > 60:
            err(f'section "{slug}" over 60 blocks')

        for j, blk in enumerate(blocks, 1):
            name = f'section "{slug}" block {j}'
            if not isinstance(blk, dict):
                err(f'{name} not an object'); continue
            t = blk.get('type')
            if t not in BLOCK_TYPES:
                err(f'{name} unknown type {t!r}'); continue

            if t == 'instructions':
                if not str(blk.get('content', '')).strip():
                    err(f'{name} instructions has no content')

            elif t == 'keyValue':
                items = blk.get('items')
                if not isinstance(items, list) or not (1 <= len(items) <= 40):
                    err(f'{name} keyValue needs 1-40 items'); continue
                for k, it in enumerate(items, 1):
                    if (not isinstance(it, dict)
                            or not str(it.get('label', '')).strip()
                            or not isinstance(it.get('value'), str)):
                        err(f'{name} keyValue row {k} needs label + string value')

            elif t == 'dataTable':
                cols = blk.get('columns')
                if not isinstance(cols, list) or not (1 <= len(cols) <= 10):
                    err(f'{name} dataTable needs 1-10 columns'); continue
                ckeys = []
                for k, c in enumerate(cols, 1):
                    if (not isinstance(c, dict)
                            or not COLKEY_RE.match(str(c.get('key', '')))
                            or not str(c.get('label', '')).strip()):
                        err(f'{name} dataTable column {k} needs key + label'); continue
                    if c['key'] in ckeys:
                        err(f'{name} dataTable duplicate column key {c["key"]!r}')
                    ckeys.append(c['key'])
                rows = blk.get('rows')
                if not isinstance(rows, list) or not (1 <= len(rows) <= 200):
                    err(f'{name} dataTable needs 1-200 rows'); continue
                for k, r in enumerate(rows, 1):
                    if not isinstance(r, dict):
                        err(f'{name} dataTable row {k} must be an object'); continue
                    # Neither SQL nor the TS mirror checks row-to-column conformance.
                    # A typo silently renders a blank cell, so warn locally.
                    extra = set(r) - set(ckeys)
                    missing = set(ckeys) - set(r)
                    if extra:
                        warn(f'{name} dataTable row {k} has keys not in columns: {sorted(extra)}')
                    if missing:
                        warn(f'{name} dataTable row {k} missing columns: {sorted(missing)}')

            elif t == 'callout':
                if blk.get('variant') not in ('info', 'warn', 'required'):
                    err(f'{name} callout variant must be info/warn/required')
                if not str(blk.get('content', '')).strip():
                    err(f'{name} callout has no content')

            elif t == 'cardGrid':
                cards = blk.get('cards')
                if not isinstance(cards, list) or not (2 <= len(cards) <= 4):
                    err(f'{name} cardGrid needs 2-4 cards'); continue
                for k, c in enumerate(cards, 1):
                    if not isinstance(c, dict) or not str(c.get('title', '')).strip():
                        err(f'{name} cardGrid card {k} needs a title'); continue
                    if c.get('url') and not URL_RE.match(c['url']):
                        err(f'{name} cardGrid card {k} bad url')

            elif t == 'linkCard':
                links = blk.get('links')
                if not isinstance(links, list) or not (1 <= len(links) <= 30):
                    err(f'{name} linkCard needs 1-30 links'); continue
                for k, l in enumerate(links, 1):
                    if not isinstance(l, dict) or not URL_RE.match(str(l.get('url', ''))):
                        err(f'{name} linkCard link {k} needs http(s) url'); continue
                    if not str(l.get('fallbackLabel', '')).strip():
                        err(f'{name} linkCard link {k} needs fallbackLabel')

            elif t == 'calc':
                tool = blk.get('tool')
                if tool not in ('gradeCalculator', 'aiLevelLookup'):
                    err(f'{name} calc unknown tool {tool!r}'); continue
                cfg = blk.get('config')
                if not isinstance(cfg, dict):
                    err(f'{name} calc needs config object'); continue
                if tool == 'gradeCalculator':
                    cats = cfg.get('categories')
                    if not isinstance(cats, list) or not (1 <= len(cats) <= 20):
                        err(f'{name} gradeCalculator needs 1-20 categories'); continue
                    for k, c in enumerate(cats, 1):
                        if not isinstance(c, dict) or not str(c.get('name', '')).strip():
                            err(f'{name} gradeCalculator cat {k} needs name'); continue
                        pp = c.get('pointsPossible')
                        w = c.get('weight')
                        if not isinstance(pp, (int, float)) or isinstance(pp, bool) or pp <= 0:
                            err(f'{name} gradeCalculator cat {k} pointsPossible>0')
                        if not isinstance(w, (int, float)) or isinstance(w, bool) or w <= 0:
                            err(f'{name} gradeCalculator cat {k} weight>0')
                    if not str(cfg.get('disclaimer', '')).strip():
                        err(f'{name} gradeCalculator needs disclaimer')
                else:
                    ents = cfg.get('entries')
                    if not isinstance(ents, list) or not (1 <= len(ents) <= 40):
                        err(f'{name} aiLevelLookup needs 1-40 entries'); continue
                    for k, e in enumerate(ents, 1):
                        if not isinstance(e, dict) or not str(e.get('workType', '')).strip():
                            err(f'{name} aiLevelLookup entry {k} needs workType'); continue
                        lv = e.get('level')
                        if not isinstance(lv, (int, float)) or isinstance(lv, bool) or lv not in (0, 1, 2, 3):
                            err(f'{name} aiLevelLookup entry {k} level must be 0-3')
                        if not str(e.get('permitted', '')).strip() or not str(e.get('notPermitted', '')).strip():
                            err(f'{name} aiLevelLookup entry {k} needs permitted + notPermitted')


if __name__ == '__main__':
    path = sys.argv[1]
    spec = json.load(open(path))
    check(spec)
    text = open(path, encoding='utf-8').read()
    if '\u2014' in text:
        err('em dash present in spec text')
    size = len(json.dumps(spec, ensure_ascii=False).encode('utf-8'))
    if size > PAYLOAD_CAP:
        err(f'payload {size} bytes exceeds the {PAYLOAD_CAP} byte cap')

    if errors:
        print(f'FAIL ({len(errors)})')
        for e in errors:
            print('  -', e)
        sys.exit(1)
    print('PASS')
    print(f'payload: {size:,} bytes of {PAYLOAD_CAP:,}')
    if warnings:
        print(f'warnings ({len(warnings)}), not enforced by the database:')
        for w in warnings:
            print('  !', w)
    print('sections:', len(spec['sections']))
    for s in spec['sections']:
        print(f"  #{s['slug']:<12} {s['title']:<24} {len(s['blocks'])} blocks")
