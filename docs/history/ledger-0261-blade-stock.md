---
title: "Blade stock selection refuses unsourced physics"
date: 2026-09-14
branches: ["codex/ledger-0261-blade-stock"]
migrations: []
subsystems: ["ideacad", "blade", "materials"]
---

Ledger 0261 adds a model-layer catalogue for the five names students use when
choosing blade stock: AR500 abrasion-resistant steel, 6061 aluminum, 4140 alloy
steel, polycarbonate sheet, and Baltic birch plywood. Each row states its stock
thickness convention and supplies selectable thickness labels rather than a free
number. `resolveBladeStock` resolves material and thickness together and returns
a named `UNKNOWN_MATERIAL`, `UNKNOWN_THICKNESS`, or `DENSITY_UNVERIFIED` refusal;
it never falls through to a default material, thickness, or density.

## Density values and published sources

**None.** No density value was added in this bundle, so there is no source/value
pair to list. The session attempted to open manufacturer or association documents
from SSAB, the Aluminum Association, SABIC, and Koskisen. Every request was
refused by the container proxy with `CONNECT tunnel failed, response 403`; no
document was opened, and a search result or an AI recollection is not a source.

## Densities not sourced

- AR500 abrasion-resistant steel — **UNVERIFIED; no number**.
- 6061 aluminum — **UNVERIFIED; no number**.
- 4140 alloy steel — **UNVERIFIED; no number**.
- Polycarbonate sheet — **UNVERIFIED; no number**.
- Baltic birch plywood — **UNVERIFIED; no number**.

This deliberately means the new catalogue refuses physics for all five entries
until a person opens a standard, mill certificate, or manufacturer datasheet
that actually contains the value being attributed. ASTM A240 was not used: it is
a procurement specification and contains no density value.

## Compatibility and scope

No existing export signature changed. The catalogue, refusal union, and resolver
are additive exports. The existing database-backed material library remains
intact because changing its row shape would require edits outside this lane and,
for persisted global materials, a migration expressly forbidden by this ledger.
No migration was created. No interactive or visual surface changed, so there was
no browser screenshot to take.
