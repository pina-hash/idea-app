#!/usr/bin/env python3
"""FRC Team 5669 morning announcement builder.

Builds, for one air date, the announcement request (subject + HTML body for the
office) and a dated one-page flyer PDF. Used by the scheduled task that leaves
a Gmail draft for Mr. Pina each school day before a Monday, Tuesday or Friday.

  python3 announce.py --auto --out OUTDIR          # next school day, from today (Los Angeles)
  python3 announce.py --air 2026-10-19 --out OUTDIR

Prints one JSON object. "job": false means there is nothing to draft today.
Requires: playwright (Chromium). Everything else is in this folder.
"""
import argparse, datetime as dt, json, os, pathlib, sys, zoneinfo

HERE = pathlib.Path(__file__).resolve().parent
TZ = zoneinfo.ZoneInfo("America/Los_Angeles")
URL = "https://frc-app-liard.vercel.app/"
TO = ["crivera@boscotech.edu"]
CC = ["mramirez@boscotech.edu", "gholguin@boscotech.edu"]

# School closures from the 2026-27 General Calendar (Sep 2026 - Feb 2027).
CLOSED = {dt.date(2026, 11, 11), *[dt.date(2026, 11, d) for d in range(23, 28)],
          *[dt.date(2026, 12, d) for d in range(21, 32)], dt.date(2027, 1, 1),
          dt.date(2027, 1, 4), dt.date(2027, 1, 18), dt.date(2027, 2, 15)}
CALENDAR_END = dt.date(2027, 2, 26)
# Start of lunch on a Monday. Daily schedule is 11:05 AM; known exceptions below.
LUNCH = {dt.date(2026, 11, 2): "11:50 AM"}  # mid-day liturgy
BEACH_BLITZ = (dt.date(2026, 10, 30), dt.date(2026, 11, 1))


def school(d):
    return d.weekday() < 5 and d not in CLOSED


def next_school_day(d):
    n = d + dt.timedelta(days=1)
    while not school(n):
        n += dt.timedelta(days=1)
    return n


WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 8: "eight",
         9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen"}


def span(days):
    if days == 14: return "two weeks"
    if days == 7: return "one week"
    if days == 21: return "three weeks"
    return f"{WORDS.get(days, days)} day{'s' if days != 1 else ''}"


def long_date(d):
    return d.strftime("%A, %B ") + str(d.day)


def content(air):
    k = {0: "MON", 1: "TUE", 4: "FRI"}.get(air.weekday())
    if k == "MON":
        return dict(kind="MON",
            title="TODAY! Robotics Team Meeting, MANDATORY",
            body=("The Techmen robotics team meets today at the start of lunch in the IDEA Classroom. "
                  "Come straight to the meeting, then get your food. This meeting is mandatory for every team member. "
                  "Miss it, and you are out of the loop. Team responsibility goes to the members who show up. "
                  "Want to join the robotics team? Come today at the start of lunch."),
            file="Flyer_Techmen Robotics Team Meeting.pdf")
    if k == "TUE":
        return dict(kind="TUE",
            title="Robotics Team: We Need You",
            body=("The Techmen robotics team is looking for new members. We need students for mechanical, "
                  "electrical, programming, design, media, and management. No experience needed. Training is today "
                  "after school in the IDEA building. Come find your place on the team."),
            file="Flyer_Techmen Robotics Recruiting.pdf")
    if k == "FRI":
        days = (BEACH_BLITZ[0] - air).days
        if days > 0:
            return dict(kind="FRI_BB", days=days,
                title=f"Robotics: Beach Blitz in {span(days).title()}",
                body=(f"The Techmen robotics team competes at Beach Blitz, a major robotics competition, in {span(days)}. Today after school, "
                      "the team works on the robot in the IDEA building. Then we coach kids' robotics teams from "
                      "4:30 to 6:00 PM, and tomorrow from 9:00 to 11:00 AM. Every hour before Beach Blitz counts."),
                file="Flyer_Techmen Robotics Beach Blitz.pdf")
        if days == 0:
            return dict(kind="FRI_BB0", days=0,
                title="TODAY! Robotics at Beach Blitz",
                body=("The Techmen robotics team competes at Beach Blitz, a major robotics competition, starting today at Capistrano Valley "
                      "High School, through Sunday. Wish the team luck, and follow along this weekend."),
                file="Flyer_Techmen Robotics Beach Blitz.pdf")
        return dict(kind="FRI",
            title="Robotics: Build and Training Today",
            body=("The Techmen robotics team works on the robot today after school in the IDEA building. Then we "
                  "coach kids' robotics teams from 4:30 to 6:00 PM, and tomorrow from 9:00 to 11:00 AM. "
                  "New students welcome. Come find your place on the team."),
            file="Flyer_Techmen Robotics Build Day.pdf")
    return None


# ---------------------------------------------------------------- flyer HTML
def asset(n):
    return (HERE / n).read_text()


CSS = '''
@font-face{font-family:SG;src:url(sg700.woff2);font-weight:700}
@font-face{font-family:SG;src:url(sg500.woff2);font-weight:500}
@font-face{font-family:SM;src:url(sm700.woff2);font-weight:700}
@page{size:8.5in 11in;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit;text-decoration:none}
.p{position:relative;width:8.5in;height:11in;overflow:hidden;background:#000;color:#fff;font-family:SG}
.rail{position:absolute;left:0;top:0;width:.22in;height:11in;background:#FFE629}
.ghost{position:absolute;font-weight:700;color:#000;-webkit-text-stroke:2px #24262B;letter-spacing:-.04em;line-height:.8;white-space:nowrap;font-size:300pt;left:3.0in;top:.9in}
.top{position:absolute;left:.75in;right:.55in;top:.45in;display:flex;justify-content:space-between;align-items:center}
.top img{height:.7in}
.tag{font-family:SM;font-weight:700;font-size:10.5pt;letter-spacing:.2em;color:#94989C;text-align:right;line-height:1.5}
.tag b{color:#FFE629}
.hero{position:absolute;left:.75in;top:1.4in;font-size:54pt;font-weight:700;color:#FFE629;line-height:.88;letter-spacing:-.025em}
.hero span{color:#fff}
.robot{position:absolute;display:block}
.co{position:absolute;font-family:SM;font-weight:700;font-size:8.5pt;letter-spacing:.14em;color:#FFE629;white-space:nowrap}
.co i{display:block;font-style:normal;color:#C9CCCF;font-size:7.5pt;letter-spacing:.08em}
svg.lines{position:absolute;left:0;top:0;width:8.5in;height:11in}
.when{position:absolute;left:.75in;right:.55in;display:flex;border:2px solid #FFE629}
.when div{padding:.1in .16in;font-weight:700;font-size:14pt;line-height:1.1;border-right:2px solid #FFE629}
.when div:last-child{border-right:0}
.when div small{display:block;font-family:SM;font-size:8pt;letter-spacing:.18em;color:#94989C;margin-bottom:.03in}
.when .d{background:#FFE629;color:#000}
.when .d small{color:#000}
.ctx{position:absolute;left:.75in;font-weight:500;font-size:10pt;line-height:1.35;color:#FFFFFF}
.ctx b{display:block;font-family:SM;font-weight:700;font-size:8.5pt;letter-spacing:.18em;color:#FFE629;margin-bottom:.04in}
.stamp{position:absolute;left:.75in;right:.55in;display:flex;align-items:center;gap:.14in;font-family:SM;font-weight:700;font-size:8.5pt;letter-spacing:.08em;color:#fff;line-height:1.4}
.stamp b{background:#FFE629;color:#000;padding:.04in .1in;white-space:nowrap}
.body{position:absolute;left:.75in;right:.55in}
.lede{font-weight:500;font-size:14.5pt;line-height:1.32}
.lede b{color:#FFE629;font-weight:700}
.k{font-family:SM;font-weight:700;font-size:9.5pt;letter-spacing:.22em;color:#94989C;margin:.2in 0 .09in;display:flex;align-items:center;gap:.12in}
.k:after{content:"";flex:1;height:2px;background:#24262B}
.grid{display:grid;gap:.1in}
.cell{border:2px solid #2E3035;background:#0C0D0F;padding:.1in .15in}
.cell.hot{border-color:#FFE629}
.cell .d{font-family:SM;font-weight:700;font-size:8.5pt;letter-spacing:.16em;color:#94989C}
.cell.hot .d{color:#FFE629}
.cell .t{font-weight:700;font-size:13.5pt;margin-top:.03in;line-height:1.1}
.cell .s{font-weight:500;font-size:10pt;color:#B9BCC0;margin-top:.03in;line-height:1.3}
.role{display:flex;gap:.14in;align-items:center;padding:.08in .13in}
.ic{width:.5in;height:.5in;flex:none}.ic svg{width:100%;height:100%;display:block}
.join{position:absolute;left:.22in;right:0;bottom:.2in;height:2.3in;background:#FFE629;color:#000;display:flex;align-items:center;gap:.35in;padding:0 .55in 0 .53in}
.qr{width:1.85in;height:1.85in;background:#fff;padding:.12in;border:3px solid #000;flex:none;display:block}
.qr svg{width:100%;height:100%;display:block}
.jt{font-weight:700;font-size:30pt;line-height:.92;letter-spacing:-.02em}
.js{font-weight:500;font-size:11.5pt;margin-top:.1in;line-height:1.3}
.btn{display:inline-block;margin-top:.12in;background:#000;color:#FFE629;font-weight:700;font-size:14pt;padding:.12in .22in}
.btn small{display:block;font-family:SM;font-size:8pt;letter-spacing:.12em;color:#94989C;margin-top:.03in;font-weight:700}
.haz{position:absolute;left:0;bottom:0;width:8.5in;height:.2in;display:block}
'''

STAMP = ('<div class=stamp style="top:{top}in"><b>100% STUDENT-BUILT</b>'
         '<span>Designed, built, wired and programmed by students.</span></div>')


def robot(x, y, w, callouts=True):
    h = w * 873 / 1700
    out = f'<img class=robot src=robot_a.png style="left:{x}in;top:{y}in;width:{w}in">'
    if not callouts:
        return out
    # (label, sub, point as fraction of image, label anchor)
    pts = [("WIRED AND CODED", "BY STUDENTS", .44, .13, "up", None),
           ("PRECISION METAL PARTS", "DESIGNED AND MADE BY STUDENTS", .62, .30, "up", 7.95),
           ("EVEN THE BUMPERS", "MADE BY STUDENTS", .70, .80, "down", None)]
    lines, labels = [], []
    for name, sub, fx, fy, where, fixed in pts:
        px, py = x + fx * w, y + fy * h
        if where == "up":
            ly = y - .18
            lx = fixed if fixed else px - 1.5
        else:
            ly = y + h + .12
            lx = px - 1.8
        lines.append(f'<circle cx="{px}" cy="{py}" r=".045" fill="#FFE629"/>'
                     f'<circle cx="{px}" cy="{py}" r=".09" fill="none" stroke="#FFE629" stroke-width=".015"/>'
                     f'<polyline points="{px},{py} {px},{ly} {lx},{ly}" fill="none" stroke="#FFE629" stroke-width=".014"/>')
        top = ly - .34 if where == "up" else ly + .05
        if lx > px:
            labels.append(f'<div class=co style="right:{8.5 - lx}in;top:{top}in;text-align:right">{name}<i>{sub}</i></div>')
        else:
            labels.append(f'<div class=co style="left:{lx}in;top:{top}in">{name}<i>{sub}</i></div>')
    return out + '<svg class=lines viewBox="0 0 8.5 11">' + "".join(lines) + "</svg>" + "".join(labels)


CTX = ('<div class=ctx style="top:{top}in;width:{w}in"><b>WHAT WE DO</b>Students design and build a new robot every year, then compete '
       'against top teams from around the world.</div>')


def when(cells, top):
    inner = "".join(f'<div class="{c}"><small>{k}</small>{v}</div>' for c, k, v in cells)
    return f'<div class=when style="top:{top}in">{inner}</div>'


def join():
    return (f'<div class=join><a class=qr href="{URL}">{asset("qr.svg")}</a><div>'
            '<div class=jt>JOIN THE<br>TEAM.</div>'
            '<div class=js>Scan the code, or tap the button<br>if you are reading this on your phone.</div>'
            f'<a class=btn href="{URL}">Apply in the Team 5669 app &rarr;<small>FRC-APP-LIARD.VERCEL.APP</small></a>'
            '</div></div>')


def page(top_tag, body):
    return (f'<!doctype html><meta charset=utf-8><style>{CSS}</style><div class=p><div class=rail></div>'
            f'<div class=ghost>5669</div><div class=top><img src=Type-Gold.svg><div class=tag>{top_tag}</div></div>'
            f'{body}{join()}{asset("haz.svg")}</div>')


G = "#FFE629"


def ic(b):
    return f'<svg viewBox="0 0 48 48" fill="none" stroke="{G}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">{b}</svg>'


TEETH = "".join(f'<rect x="21" y="3" width="6" height="8" rx="1" transform="rotate({i * 45} 24 24)" fill="{G}" stroke="none"/>' for i in range(8))
ROLES = [
    ("Mechanical", "Design, cut, machine and assemble the robot.", ic(TEETH + '<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="5"/>')),
    ("Electrical", "Wire the motors, sensors and control system.", ic(f'<path d="M27 4 L11 27 H23 L19 44 L37 19 H25 Z" fill="{G}" stroke="none"/>')),
    ("Programming", "Write the code that drives and scores.", ic('<rect x="4" y="8" width="40" height="32" rx="3"/><path d="M4 16 H44"/><path d="M17 23 L11 29 L17 35"/><path d="M31 23 L37 29 L31 35"/><path d="M26 21 L22 37"/>')),
    ("Design", "Model every part in 3D before it is built.", ic('<path d="M24 5 L41 14 V34 L24 43 L7 34 V14 Z"/><path d="M7 14 L24 23 L41 14"/><path d="M24 23 V43"/>')),
    ("Media", "Photo, video and social for the build and events.", ic(f'<rect x="4" y="14" width="40" height="26" rx="4"/><path d="M16 14 L19 8 H29 L32 14"/><circle cx="24" cy="27" r="8"/><circle cx="37" cy="20" r="1.5" fill="{G}"/>')),
    ("Management", "Lead the team: keep members on task, run schedules, budget and sponsors.", ic('<rect x="9" y="8" width="30" height="36" rx="3"/><rect x="17" y="4" width="14" height="8" rx="2"/><path d="M15 23 L18 26 L23 20"/><path d="M27 23 H33"/><path d="M15 34 L18 37 L23 31"/><path d="M27 34 H33"/>')),
]

WEEK = '''<div class=grid style="grid-template-columns:repeat(4,1fr)">
<div class="cell hot"><div class=d>MON · LUNCH</div><div class=t>Team meeting</div><div class=s>IDEA Classroom. Mandatory.</div></div>
<div class=cell><div class=d>TUE · AFTER SCHOOL</div><div class=t>Build the robot</div><div class=s>IDEA building, until 5:00 PM.</div></div>
<div class=cell><div class=d>FRI · AFTER SCHOOL</div><div class=t>Build the robot</div><div class=s>Then coach kids' robotics, 4:30 to 6:00 PM.</div></div>
<div class=cell><div class=d>SAT · MORNING</div><div class=t>Coach kids' robotics</div><div class=s>9:00 to 11:00 AM.</div></div></div>'''

FRI_CELLS = '''<div class=grid style="grid-template-columns:repeat(3,1fr)">
<div class="cell hot"><div class=d>TODAY · AFTER SCHOOL</div><div class=t>Build the robot</div><div class=s>Throughout the IDEA building.</div></div>
<div class=cell><div class=d>TODAY · 4:30 - 6:00 PM</div><div class=t>Coach kids' robotics</div><div class=s>Kids' LEGO robotics teams.</div></div>
<div class=cell><div class=d>{sat} · 9 - 11 AM</div><div class=t>Coach kids' robotics</div><div class=s>Kids' LEGO robotics teams.</div></div></div>'''


def flyer_html(air, c):
    D = long_date(air).upper()
    sat = (air + dt.timedelta(days=1)).strftime("SAT %-m/%-d")
    if c["kind"] == "MON":
        lunch = LUNCH.get(air, "11:05 AM")
        body = (f'<div class=hero>TEAM<br>MEETING<br><span>TODAY.</span></div>{robot(4.2, 1.6, 3.95)}' + CTX.format(top=3.42, w=3.3)
                + when([("d", "DATE", long_date(air)), ("", "TIME", f"Start of lunch, {lunch}"), ("", "PLACE", "IDEA Classroom")], 4.5)
                + '<div class=body style="top:5.25in"><div class=lede>Every member, every Monday. <b>Come straight to the meeting, then get your food.</b> '
                  'Miss it and you are out of the loop. New students welcome.</div>'
                + f'<div class=k>EVERY WEEK</div>{WEEK}</div>' + STAMP.format(top=7.88))
        return page(f'ROBOTICS TEAM <b>5669</b><br>{D} · <b>MANDATORY</b>', body)
    if c["kind"] == "TUE":
        cells = "".join(f'<div class="cell role"><div class=ic>{i}</div><div><div class=t>{n}</div><div class=s>{d}</div></div></div>' for n, d, i in ROLES)
        body = (f'<div class=hero>WE<br>NEED<br><span>YOU.</span></div>{robot(3.35, 1.45, 4.8, callouts=False)}' + CTX.format(top=3.95, w=7.2)
                + when([("d", "DATE", long_date(air)), ("", "TIME", "After school, until 5:00 PM"), ("", "PLACE", "IDEA building")], 4.58)
                + '<div class=body style="top:5.12in">'
                + f'<div class=k>EVERY TECHNOLOGY HAS A PLACE · NO EXPERIENCE REQUIRED</div><div class=grid style="grid-template-columns:repeat(2,1fr)">{cells}</div></div>')
        return page(f'ROBOTICS TEAM <b>5669</b><br>{D} · <b>NOW RECRUITING</b>', body)
    if c["kind"] in ("FRI_BB", "FRI_BB0"):
        if c["kind"] == "FRI_BB":
            hero = f'<div class=hero>BEACH<br>BLITZ<br><span style="font-size:22pt;letter-spacing:.02em">IN {span(c["days"]).upper()}</span></div>'
            third = ("", "BEACH BLITZ", "Oct 30 - Nov 1")
        else:
            hero = '<div class=hero>BEACH<br>BLITZ<br><span>TODAY.</span></div>'
            third = ("", "THROUGH", "Sunday, Nov 1")
        body = (hero + robot(4.2, 1.6, 3.95) + CTX.format(top=3.42, w=3.3)
                + when([("d", "DATE", long_date(air)), ("", "WHERE" if c["kind"] == "FRI_BB0" else "TODAY", "Capistrano Valley HS" if c["kind"] == "FRI_BB0" else "After school, IDEA building"), third], 4.5)
                + '<div class=body style="top:5.25in"><div class=lede>Our next robotics competition. <b>Every hour before it counts.</b></div>'
                + '<div class=k>THIS WEEKEND</div>' + FRI_CELLS.format(sat=sat)
                + '<div class=k>GOING TO BEACH BLITZ?</div><div class=cell><div class=t>Family sign-up is required to attend.</div>'
                  '<div class=s>No school transportation. Families carpool from the Bosco Tech front lot. See Mr. Pina.</div></div></div>')
        return page(f'ROBOTICS TEAM <b>5669</b><br>{D} · <b>BEACH BLITZ</b>', body)
    body = ('<div class=hero>BUILD<br>DAY.<br><span style="font-size:22pt;letter-spacing:.02em">TODAY AFTER SCHOOL</span></div>' + robot(4.2, 1.6, 3.95) + CTX.format(top=3.42, w=3.3)
            + when([("d", "DATE", long_date(air)), ("", "TIME", "After school"), ("", "PLACE", "IDEA building")], 4.5)
            + '<div class=body style="top:5.25in"><div class=lede>Build and test the robot. <b>New students welcome.</b></div>'
            + '<div class=k>THIS WEEKEND</div>' + FRI_CELLS.format(sat=sat) + '</div>' + STAMP.format(top=7.6))
    return page(f'ROBOTICS TEAM <b>5669</b><br>{D} · <b>BUILD DAY</b>', body)


def render_pdf(html, out_pdf):
    from playwright.sync_api import sync_playwright
    tmp = HERE / f".render_{os.getpid()}.html"
    tmp.write_text(html)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page()
            pg.goto(tmp.as_uri())
            pg.wait_for_timeout(500)
            pg.pdf(path=str(out_pdf), width="8.5in", height="11in", print_background=True,
                   margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            b.close()
    finally:
        tmp.unlink(missing_ok=True)


def email_html(air, c, flyer):
    short = air.strftime("%a %-m/%-d")
    return (f'Hello,<br><br>I would like to request a morning announcement for {short}:<br><br>'
            f'<b>{c["title"]}</b> -- <i>{c["body"]}</i><br><br>'
            f'Contact: Mr. Pina | apina@boscotech.edu<br>' + ('Flyer attached.<br>' if flyer else '')
            + '<br>Thank you,<br>Mr. Pina')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--air")
    ap.add_argument("--auto", action="store_true")
    ap.add_argument("--out", default=".")
    ap.add_argument("--no-pdf", action="store_true")
    a = ap.parse_args()
    today = dt.datetime.now(TZ).date()
    if a.auto:
        if not school(today):
            print(json.dumps({"job": False, "reason": f"{today} is not a school day"})); return
        air = next_school_day(today)
    else:
        air = dt.date.fromisoformat(a.air)
    if air > CALENDAR_END:
        print(json.dumps({"job": False, "calendar_expired": True,
                          "notify": "Robotics announcement drafts are paused: the school calendar in the task ends in February 2027. Send the new calendar to update it."}))
        return
    c = content(air)
    if not c:
        print(json.dumps({"job": False, "reason": f"{air:%a} is not an announcement day"})); return
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    pdf = out / c["file"]
    if not a.no_pdf:
        render_pdf(flyer_html(air, c), pdf)
    short = air.strftime("%a %-m/%-d")
    print(json.dumps({
        "job": True, "air": air.isoformat(), "kind": c["kind"],
        "to": TO, "cc": CC, "subject": f"Morning Announcement Request for {short}",
        "html": email_html(air, c, True), "flyer": str(pdf.resolve()),
        "notify": f"Robotics announcement draft ready for {short}. Attach the flyer from this message and send before 2:00 PM today.",
    }, indent=1))


if __name__ == "__main__":
    main()
