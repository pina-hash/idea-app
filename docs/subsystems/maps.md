# IDEA Maps

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The editor gate, map photos and the maps-media bucket. The overview line for Maps is in CLAUDE.md. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

  - **THE `/maps/edit` GATE IS THE AREA'S `+layout.server.ts`**, hoisted there
    the moment there was a second page, so a third cannot ship ungated by
    somebody forgetting to copy a check. The editor page keeps its own identical
    `isAdmin` call as defence in depth; the shelf page deliberately carries none,
    which `tests/maps-shelf-route.test.ts` asserts in both directions.
  - **A MAP PHOTO'S MEDIA TYPE COMES FROM THE EXTENSION WHEN THE BROWSER GIVES
    NONE, AND THAT IS 0163'S OWN INSTRUCTION TO THE EDITOR.** `File.type` is
    legitimately EMPTY for HEIC off an iPhone, an empty type uploads as
    `application/octet-stream`, and the `maps-media` bucket refuses it -- so a
    perfectly good camera photo fails at the far end unless the type is
    resolved first. `mapsImageMime` in `$lib/maps/media.ts` is the one place
    that happens, and the size ceiling beside it (20 MiB) is refused from
    `File.size` BEFORE the transfer, because a refusal after a minute of school
    wifi is the same refusal at the worst moment.
  - **THE BUCKET'S `image/*` WILDCARD USED TO ADMIT SVG AND `0168` CLOSED IT.**
    An SVG is a document, not a picture, and `maps-media` is PUBLIC, so an
    accepted one is served back as `image/svg+xml` from a public URL on the
    Storage origin, where navigating to it executes it -- Storage's own
    content-type rewrite catches `text/html` alone. `0168` replaced the
    wildcard with a concrete raster list and RAISES if any SVG spelling
    survives in `allowed_mime_types`; it also warns, by key, about SVG objects
    already in the bucket, which it deliberately does not delete. This rule
    read "which no bundle has written yet" for a full day after `0168` landed,
    which is what a paragraph describing an unwritten migration turns into the
    moment somebody writes it.
