# FRC Team 5669 morning announcements

`announce.py` builds one morning announcement request for the Bosco Tech office:
the subject, the HTML body (bold title, two dashes, italic body, the bulletin's
house format), and a dated one-page flyer PDF. The rules it follows are
`docs/standards/IDEA_MORNING_ANNOUNCEMENTS.md`.

    python3 tools/frc-announcements/announce.py --auto --out /tmp/ann      # next school day
    python3 tools/frc-announcements/announce.py --air 2026-10-19 --out /tmp/ann

It prints one JSON object. `"job": false` means nothing to draft today.

A scheduled task runs it at 7:50 AM every weekday, leaves a Gmail draft (never
sends), and hands Mr. Pina the flyer to attach. Rotation: Monday team meeting,
Tuesday recruiting, Friday build day (Beach Blitz countdown until 2026-10-30).

What lives in the script and needs editing by hand: the closure list and its end
date (the calendar loaded runs to February 2027), non-default Monday lunch times,
the event dates, and the announcement wording.

Assets: Techmen logotype and fonts from `FRC-Team-5669-Techmen/frc-app`
`src/lib/design-system/assets/`; robot photo supplied by Mr. Pina; `qr.svg`
encodes https://frc-app-liard.vercel.app/. Colors are solid only: some PDF
viewers render gradients and repeating patterns as solid pink.
