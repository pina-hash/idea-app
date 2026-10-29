# 0468 One page header, one sub-nav and the plate parts on every app

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("Fold in a site-wide color and geometry pass"). Queue: `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0468"
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: a new PageHeader and app sub-nav in `src/lib/shell/`, `src/lib/classroom/plate.css`, `src/lib/shell/site-plate.css`, `tools/hx-kit/kit/plate.css` (one shared source only), the page shells and card, list, field, readout and key markup of coin home, market, stocks, coin desk, Foundry, Maps, Armory, certifications, admin, calendar and notebook, the landing tour, the Live class panel, the notebook capture box, the stream unit headers, the Send feedback pill; the lane's tests; one `classroom-updates.json` entry where students see a change; its `docs/history/` entry; this entry.
- Starts: after 0466 and 0467 land; the frozen Coin Ledger page only with Mr. Pina's yes
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
- Notes: `tools/hx-kit/kit/plate.css` changed (the HTML standards chat's directory; this lane's one permitted file there): it is now the one source of the Plate's part classes for the site and the kit (the site imports it), it gained `idea-pad`/`idea-pads`, `idea-list` and `idea-display`, and `idea-titlebar`, `idea-pad` and `idea-eyebrow` carry their class twice so a room's own `h1`/`a` rule cannot restyle them. `starter.html` was not rebuilt; the kit test reads 0 FAIL on it and on a scratch rebuild. Armory was left out (ledger 0463's lane owned it). The frozen Coin Ledger is untouched (its `CoinBar` is held byte for byte by a golden). Record: `docs/history/site-geometry-0468.md`.
