# FRC quiz banks: what the option text gives away

Generated 2026-08-29 by `node --experimental-strip-types tests/frc-quiz-bank-bias-report.mjs`.
Every figure comes from `tests/frc-quiz-bank-bias.ts`, which is also what
`tests/frc-quiz-bank-bias.test.ts` enforces. Regenerate after editing a bank.

## The finding

Across the 10 committed banks (140 items), the single longest option is the
correct one **95 times, 67.9%**, against 25% at chance. Shuffling cannot help:
length is invariant under permutation, so the tell survives every draw.

The gate is 90% on a short draw, so the rate turns into a pass rate. A student
who knows nothing, always picks the longest option and retakes through the
cooldown clears MDM-10 in about **1.75 attempts**.

## Per bank, worst first

`P(pass)` is the exact probability that ONE attempt passes, hypergeometric over
that bank's own draw, against its own test length and 90% threshold.

| Bank | Items | Draw | Need | Longest-is-answer | P(pass) longest-only | P(pass) random |
|---|---|---|---|---|---|---|
| MDM-10 | 14 | 6 | 6 | 13/14 (92.9%) | **57.1%** | 0.024% |
| F5 | 10 | 6 | 6 | 9/10 (90.0%) | **40.0%** | 0.024% |
| F2 | 10 | 6 | 6 | 8/10 (80.0%) | **13.3%** | 0.024% |
| F4 | 10 | 6 | 6 | 8/10 (80.0%) | **13.3%** | 0.024% |
| MDM-1 | 32 | 10 | 9 | 21/32 (65.6%) | **5.6%** | 0.003% |
| MDM-2 | 14 | 6 | 6 | 8/14 (57.1%) | **0.9%** | 0.024% |
| MDM-3 | 14 | 6 | 6 | 8/14 (57.1%) | **0.9%** | 0.024% |
| MDM-9 | 14 | 6 | 6 | 8/14 (57.1%) | **0.9%** | 0.024% |
| F1 | 12 | 8 | 8 | 7/12 (58.3%) | **0.0%** | 0.002% |
| F3 | 10 | 6 | 6 | 5/10 (50.0%) | **0.0%** | 0.024% |

## What else leaks, and what does not

"Fires on" is the number of items where the heuristic points at an option at
all; a tie points at nothing and is neither a hit nor a miss. That is why the
longest-option row reads 72.5% of the 131 it fires on, while the headline above
is 67.9% of all 140 items -- the second is the number a student experiences,
because a tie is a question the trick does not answer.

| Dimension | Fires on | Correct | Chance | Verdict |
|---|---|---|---|---|
| Longest option (characters) | 131 | 95 (72.5%) | 25.0% | **the dominant tell** |
| Most words | 108 | 88 (81.5%) | 25.0% | the same tell, second reading |
| Only option with no absolute ("Only...", "Never...") | 9 | 9 (100.0%) | 25.0% | **certain where it fires** |
| Correct option echoes the stem most | 40 | 27 (67.5%) | 25.0% | no signal of its own -- see below |
| Near-duplicate option pair contains the answer | 22 | 12 (54.5%) | 50.0% | noise, not a tell |
| "All / none of the above" | 0 | - | - | clean: none present |
| a/an agreement with the stem | 0 | - | - | clean: none present |
| Option count | 0 | - | - | clean: every item offers exactly 4 |

**On the stem-echo row.** Taken alone it looks like a second serious leak: it
fires on 40 items and is right on 27, 67.5% against 25.0%. It is not one. On the
10 items where it and the length tell point at DIFFERENT options, length is
right 8 times and the echo 1. A longer option overlaps the question more
because it has more words in it, so this is the length tell wearing a second
costume. Fixing the lengths fixes it; nothing needs rewriting for it separately.

## The rewrite list

Ordered by **give-away**: the correct option's length as a multiple of the
longest distractor offered against it. 1.0 would mean the answer is no longer
than its best distractor and the tell is dead. Items whose answer is not the
longest are not listed -- there are 45 of those, and they are not the problem.

**The fix is to lengthen the distractors, not to shorten the answer.** A correct
option trimmed until it matches is usually a correct option that stopped being
clearly correct.

| # | Bank | Item | x | Answer (chars) | Longest distractor (chars) |
|---|---|---|---|---|---|
| 1 | F1 | `qf1-07` | **4.69** | Many people in many roles, like design, build, code, strategy, and scouting (75) | Only the drivers (16) |
| 2 | MDM-10 | `m10-14` | **3.69** | The part is slightly larger than the bore and is pressed in (59) | Gravity holds it (16) |
| 3 | F5 | `qf5-07` | **3.35** | So the team remembers the reason and does not re-argue it (57) | To confuse judges (17) |
| 4 | MDM-10 | `m10-06` | **3.27** | A geometric control, a tolerance zone, and datums (49) | Only a diameter (15) |
| 5 | MDM-10 | `m10-07` | **3.24** | The reference features everything else is measured from (55) | Title-block notes (17) |
| 6 | F5 | `qf5-06` | **3.21** | Could someone else continue your work from it (45) | Is it colorful (14) |
| 7 | MDM-3 | `m3-02` | **3.17** | The number 10 sizes (19) | 3/8-16 (6) |
| 8 | F5 | `qf5-01` | **3.00** | The team's written record of what it did, why, and what it learned (66) | A list of team members (22) |
| 9 | MDM-10 | `m10-09` | **2.83** | Tight tolerances waste shop time, so tolerance only what needs it (65) | It is against the rules (23) |
| 10 | MDM-10 | `m10-11` | **2.71** | About 0.01 inch, to absorb part-width and manufacturing variation (65) | 1 inch, to save material (24) |
| 11 | F3 | `qf3-02` | **2.71** | Any time tools are running, even when watching (46) | Only for painting (17) |
| 12 | F5 | `qf5-03` | **2.68** | What you did, why, results, the date, and your name (51) | Only what went well (19) |
| 13 | F5 | `qf5-02` | **2.68** | New members can pick up work and the team avoids repeating mistakes (67) | It is required to be long (25) |
| 14 | F2 | `qf2-07` | **2.56** | Elimination rounds that decide the winner (41) | Practice matches (16) |
| 15 | MDM-1 | `m1-031` | **2.50** | They commit to an unproven idea and may waste manufacturing time on a design that does not work (95) | The robot will automatically be better (38) |
| 16 | F2 | `qf2-08` | **2.48** | Learning skills, training new members, and preparing (52) | Taking apart the shop (21) |
| 17 | F2 | `qf2-10` | **2.33** | A sprint where everyone has a part to play (42) | A slow, quiet year (18) |
| 18 | MDM-10 | `m10-12` | **2.31** | On precision interfaces like bearing bores and bolt patterns (60) | Only on the drawing border (26) |
| 19 | MDM-1 | `m1-026` | **2.24** | A prototype should be fast and crude to answer a question, so polishing before proving the concept wastes time (110) | They should have manufactured the real part first (49) |
| 20 | F1 | `qf1-01` | **2.21** | A contest where high school teams build a robot to play a game (62) | A class about writing essays (28) |
| 21 | MDM-1 | `m1-022` | **2.18** | It records design intent and stops the team from re-arguing the decision (72) | It is required by the game manual (33) |
| 22 | MDM-2 | `m2-13` | **2.18** | They line up, so front and top share width and front and side share height (74) | They are drawn at random positions (34) |
| 23 | MDM-1 | `m1-019` | **2.17** | Constraints shrink the design space so the geometry has something to satisfy (76) | To slow the process down on purpose (35) |
| 24 | MDM-2 | `m2-03` | **2.16** | Its position is undefined and cannot be made correctly (54) | The diameter is too small (25) |
| 25 | MDM-1 | `m1-028` | **2.14** | Tighten the dimension and reprint, since iteration is expected (62) | Blame the printer and move on (29) |
| 26 | MDM-9 | `m9-12` | **2.14** | To prevent the edge from tearing out under load (47) | To make it look better (22) |
| 27 | MDM-2 | `m2-12` | **2.11** | A size callout and locating dimensions (38) | A hidden line only (18) |
| 28 | MDM-1 | `m1-020` | **2.11** | The part may not fit, mount, or meet weight because nothing bounded the design (78) | Nothing, this is the correct approach (37) |
| 29 | MDM-1 | `m1-007` | **2.10** | Demands are pass or fail while goals only decide between options that already pass (82) | Demands can be ignored if goals are met (39) |
| 30 | F4 | `qf4-06` | **2.07** | Learn what to fix and try again (31) | Blame the tools (15) |
| 31 | F2 | `qf2-02` | **2.06** | Understand the game and its rules (33) | Pick a team name (16) |
| 32 | MDM-1 | `m1-029` | **2.00** | Expect to test, learn, and improve rather than treating version one as final (76) | You should only ever build one version (38) |
| 33 | F3 | `qf3-03` | **2.00** | Tie back hair and remove loose sleeves (38) | Nothing, it is fine (19) |
| 34 | MDM-10 | `m10-01` | **2.00** | The allowed variation on a dimension (36) | A type of fastener (18) |
| 35 | MDM-2 | `m2-14` | **1.96** | The hole goes completely through the material (45) | The hole is countersunk (23) |
| 36 | MDM-9 | `m9-10` | **1.95** | A 10-24 clearance hole through the part (39) | A tapped 1/4-20 hole (20) |
| 37 | F5 | `qf5-05` | **1.94** | Everyone who works on the robot (31) | Only the captain (16) |
| 38 | MDM-10 | `m10-13` | **1.94** | Form, orientation, and position (31) | Color and finish (16) |
| 39 | MDM-1 | `m1-032` | **1.88** | A prototype reveals a flaw, the design is changed, and the next version is better (81) | A concept is chosen with no reason recorded (43) |
| 40 | MDM-10 | `m10-03` | **1.87** | An interference or press fit (28) | A clearance fit (15) |
| 41 | MDM-9 | `m9-14` | **1.86** | Pass through freely to a nut or the far part's threads (54) | Thread directly into the part (29) |
| 42 | F5 | `qf5-08` | **1.86** | Someone repeating it later (26) | A better robot (14) |
| 43 | MDM-9 | `m9-05` | **1.76** | Sizes the hole for the screw and carries the callout to the drawing (67) | Adds threads to any part automatically (38) |
| 44 | MDM-1 | `m1-021` | **1.76** | The space available and the tube it bolts to (44) | The team's favorite color (25) |
| 45 | MDM-10 | `m10-05` | **1.75** | Open the slot about 0.005 and shrink the tab about 0.005 (56) | Shrink the slot and grow the tab (32) |
| 46 | MDM-3 | `m3-14` | **1.70** | Fewer spares and tools, and faster pit repairs (46) | It is required by the rules (27) |
| 47 | F2 | `qf2-06` | **1.70** | The top-ranked teams pick partners (34) | The robot is weighed (20) |
| 48 | F5 | `qf5-09` | **1.69** | Understand your team's work (27) | Pick the drivers (16) |
| 49 | MDM-1 | `m1-013` | **1.68** | Define, generate concepts, prototype, select, detail, make, test (64) | Prototype, define, manufacture, select (38) |
| 50 | F4 | `qf4-05` | **1.68** | Shows what works and what to fix (32) | Proves you are done (19) |
| 51 | F1 | `qf1-03` | **1.67** | Three (5) | One (3) |
| 52 | F5 | `qf5-04` | **1.67** | Yes, the team learns from them (30) | No, only successes (18) |
| 53 | MDM-3 | `m3-08` | **1.67** | A hex or ThunderHex shaft (25) | A tapered shaft (15) |
| 54 | MDM-3 | `m3-10` | **1.63** | Tooth count and diametral pitch (31) | Voltage and current (19) |
| 55 | MDM-1 | `m1-025` | **1.63** | To answer a specific question and test an assumption (52) | To be the final competition part (32) |
| 56 | F3 | `qf3-05` | **1.62** | Stop and ask a mentor (21) | Keep guessing (13) |
| 57 | MDM-2 | `m2-09` | **1.61** | To define the part unambiguously for manufacturing (50) | Drawings look more professional (31) |
| 58 | F4 | `qf4-03` | **1.61** | A better chance of finding a good one (37) | It is required by rules (23) |
| 59 | MDM-10 | `m10-10` | **1.59** | Between a clearance and an interference fit (43) | The same as a clearance fit (27) |
| 60 | MDM-1 | `m1-015` | **1.57** | Select that concept, record why, then detail it (47) | Skip straight to manufacturing (30) |
| 61 | F2 | `qf2-05` | **1.56** | Your ranking at the event (25) | The final winner (16) |
| 62 | MDM-3 | `m3-03` | **1.56** | Most current COTS parts are threaded 10-32 (42) | It is the largest available (27) |
| 63 | F4 | `qf4-04` | **1.55** | To learn whether the idea works (31) | To be the final part (20) |
| 64 | MDM-2 | `m2-02` | **1.54** | A 0.266 inch hole all the way through (37) | A counterbore 0.266 deep (24) |
| 65 | MDM-1 | `m1-017` | **1.54** | Detail the design into a clean CAD model (40) | Prototype a different idea (26) |
| 66 | MDM-1 | `m1-030` | **1.53** | Analyze what failed, improve the design, and iterate (52) | Keep the design unchanged and hope (34) |
| 67 | F3 | `qf3-08` | **1.50** | So no one trips or slips (24) | It is not needed (16) |
| 68 | MDM-10 | `m10-02` | **1.48** | It falls back to the title-block default (40) | It becomes a reference only (27) |
| 69 | F4 | `qf4-09` | **1.48** | You test it again and repeat the loop (37) | You are finished for good (25) |
| 70 | MDM-1 | `m1-018` | **1.48** | Manufacture it and then test it (31) | Generate new concepts (21) |
| 71 | F3 | `qf3-04` | **1.43** | Get trained or ask a mentor before using it (43) | Use it while no one is looking (30) |
| 72 | MDM-10 | `m10-08` | **1.43** | Position, flatness, and perpendicularity (40) | Steel, aluminum, and plastic (28) |
| 73 | MDM-3 | `m3-01` | **1.42** | A spacer with a through-bolt, since the bolt is preloaded in tension (68) | A threaded standoff, since threads add stiffness (48) |
| 74 | MDM-9 | `m9-07` | **1.41** | A built-in biting washer (24) | Left-hand threads (17) |
| 75 | MDM-9 | `m9-09` | **1.39** | For the highest structural loads (32) | For the lightest panels (23) |
| 76 | F4 | `qf4-10` | **1.36** | You build the wrong thing well (30) | The robot gets lighter (22) |
| 77 | MDM-1 | `m1-001` | **1.36** | A demand, because it must be true or the design fails (53) | Neither, because it depends on the game (39) |
| 78 | MDM-9 | `m9-11` | **1.34** | A through-bolt with a spacer in compression (43) | A short screw into thin material (32) |
| 79 | MDM-1 | `m1-027` | **1.33** | Fast, crude, and focused on one question (40) | Polished, final, and permanent (30) |
| 80 | F2 | `qf2-01` | **1.33** | The new game is revealed (24) | Drivers are chosen (18) |
| 81 | F1 | `qf1-11` | **1.32** | To practice and get ready before the quiz (41) | To prove you already learned it (31) |
| 82 | F4 | `qf4-07` | **1.27** | Expect to improve and repeat (28) | Failure is not allowed (22) |
| 83 | MDM-2 | `m2-05` | **1.23** | Edges hidden from that view (27) | The cutting plane only (22) |
| 84 | F1 | `qf1-05` | **1.20** | The new game is revealed (24) | The robot is shipped (20) |
| 85 | F2 | `qf2-04` | **1.19** | Design, build, test, and fix, over and over (43) | Building it perfectly the first time (36) |
| 86 | MDM-1 | `m1-014` | **1.19** | Build a quick prototype to test the concepts (44) | Pick one at random and manufacture it (37) |
| 87 | MDM-1 | `m1-005` | **1.17** | It would be nice if the mechanism were under four ounces (56) | The gearbox must bolt to the existing frame rail (48) |
| 88 | F1 | `qf1-04` | **1.17** | The part where the robot drives itself using code (49) | The part where a driver controls the robot (42) |
| 89 | MDM-3 | `m3-06` | **1.17** | The Kraken X60 (14) | The Mini CIM (12) |
| 90 | F1 | `qf1-02` | **1.10** | Two and a half minutes (22) | Two and a half hours (20) |
| 91 | MDM-3 | `m3-13` | **1.09** | The Vivid-Hosting VH-109 (24) | The old OpenMesh radio (22) |
| 92 | F4 | `qf4-08` | **1.08** | No, it works for any problem (28) | Yes, only mechanical parts (26) |
| 93 | MDM-1 | `m1-010` | **1.05** | Testing and iterating (21) | Defining the problem (20) |
| 94 | MDM-9 | `m9-03` | **1.05** | Smaller than the screw (22) | Larger than the screw (21) |
| 95 | MDM-2 | `m2-08` | **1.03** | To the right of the front view (30) | To the left of the front view (29) |

## The nine absolute-qualifier items

Three of the four options are written as absolutes and the answer is not, so
the answer is identifiable without reading the question. All nine, listed in
full because the fix is per item.

- **MDM-1 `m1-005`** -- Which of these is a goal rather than a demand?
  - (distractor) The gearbox must bolt to the existing frame rail
  - (distractor) The mechanism must fit in the allowed volume
  - **(answer)** It would be nice if the mechanism were under four ounces
  - (distractor) The part must not break under match loads
- **MDM-1 `m1-006`** -- A demand is usually written with the word must. Goals are often signaled by which kind of wording?
  - **(answer)** Prefer, ideally, or would like
  - (distractor) Must, shall, or required
  - (distractor) Never or always
  - (distractor) None, goals are not written down
- **F1 `qf1-07`** -- Who does the work on an FRC team?
  - (distractor) Only the drivers
  - **(answer)** Many people in many roles, like design, build, code, strategy, and scouting
  - (distractor) Only the coach
  - (distractor) Only one student
- **F3 `qf3-02`** -- When do you wear safety glasses?
  - **(answer)** Any time tools are running, even when watching
  - (distractor) Only on Fridays
  - (distractor) Only for painting
  - (distractor) Never
- **F4 `qf4-08`** -- Does this process only work for robot parts?
  - **(answer)** No, it works for any problem
  - (distractor) Yes, only mechanical parts
  - (distractor) Only for code
  - (distractor) Only for strategy
- **F5 `qf5-04`** -- Should you record failures?
  - **(answer)** Yes, the team learns from them
  - (distractor) No, only successes
  - (distractor) Only big ones
  - (distractor) Never
- **F5 `qf5-05`** -- Who contributes to the notebook?
  - **(answer)** Everyone who works on the robot
  - (distractor) Only the captain
  - (distractor) Only mentors
  - (distractor) Only drivers
- **MDM-2 `m2-12`** -- To confirm a hole is fully defined on a drawing, you check that it has what?
  - (distractor) Only a diameter
  - **(answer)** A size callout and locating dimensions
  - (distractor) A hidden line only
  - (distractor) A center line only
- **MDM-9 `m9-08`** -- Rivets are used to join parts how?
  - **(answer)** Quickly from one side
  - (distractor) Only with a nut on the back
  - (distractor) Only in tapped holes
  - (distractor) Only for pivots
