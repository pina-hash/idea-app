---
# MDM CONTENT SEED - CAD and Mechanical Design track
# Ten units, each delimited by a line of ===, with YAML frontmatter followed by
# four sections: ## Brief, ## Drill, ## Gate, ## Apply.
# Units MDM-11 through MDM-16 are authored later.
---

id: MDM-1
title: The Mechanical Design Process
domain: CAD and Mechanical Design
order: 1
prerequisite: none
gate: quiz
gatePass: 90

## Brief

Mechanical design in FRC is not modeling for its own sake. You design a part or a mechanism to do one scoped job, under hard constraints, and you get there by iterating. The eight steps from Foundation still apply. Here is what each one means when the thing you are making is a bracket or a gearbox.

Define the problem. State the job in one sentence, then split demands from goals. "The mount must hold the intake roller and bolt to the frame" is a demand, pass or fail. "Keep it under four ounces" is a goal, used to choose between options that already pass.

Set constraints before geometry. Space available, weight budget, what it bolts to, which COTS parts it must accept. Constraints shrink the design space so you are not staring at a blank sketch.

Concept, then prototype cheaply. Sketch two or three options. Build the fastest crude version you can, cardboard or a rough print, to answer one specific question, not to be final.

Select with a reason. Weigh the options against your demands and goals, and write down why you chose one. That written why is what the notebook captures and what stops the team from re-arguing the decision next week.

Detail, make, test, iterate. Only now does it become a clean CAD model, then a real part, then a tested part, then a better part.

The mindset that separates a mechanical designer from someone who can push buttons in CAD: constraints first, purpose always, and the first version is never the last.

Worked example, an intake roller mount. Define: hold a one-half inch hex roller shaft on flanged bearings and bolt to a one inch tube. Constrain: fit inside a two inch by three inch footprint, use the bearings already in the parts bin, stay under four ounces. Concept: an L bracket, a two-plate cage, or bent sheet. Prototype: print the L bracket. Select: the two-plate cage wins on stiffness. Detail, print, and test, and when the bearing bore comes out loose, tighten that dimension and reprint. That reprint is the process working, not the process failing.

## Drill

1. Put these design-process steps in the correct order: manufacture, define the problem, prototype, select a concept, generate concepts, test, detail the design, research.
2. A teammate says the arm should reach six feet and ideally weigh under three pounds. Which part is a demand and which is a goal?
3. You just built a cardboard mockup and it works. What is the correct next step?
4. Why set constraints before sketching geometry?
5. Two bracket concepts both meet every demand. What decides between them?

Answers: 1. define, research, concept, prototype, select, detail, manufacture, test. 2. reach six feet is a demand, under three pounds is a goal. 3. select the concept and record why; it is not yet time to build a clean CAD model. 4. constraints shrink the design space so the geometry has something to satisfy. 5. the goals.

## Gate

Ten scenario multiple choice items. Each presents a design situation and asks for the correct next process step, or a correct classification such as demand versus goal or prototype versus detail. Auto-graded, pass at 90 percent, test-out allowed.

## Apply

Pick one subsystem on the practice robot. Write a short define-the-problem statement for it: the one-sentence job, the demands, and the goals. Submit as a notebook entry. AI-graded against a rubric that checks for a clear job statement and a correct demand versus goal split, with instructor spot-audit.

===

id: MDM-2
title: Reading Technical Drawings
domain: CAD and Mechanical Design
order: 2
prerequisite: MDM-1
gate: gauntlet:drawing-reading
gatePass: 90

## Brief

A 3D model shows intent. A drawing removes all doubt about how to actually make the part. A machinist should be able to fabricate from the drawing alone without asking a single question. To read one, you need four things.

Views. Most FRC parts are drawn in orthographic views, usually front, top, and right, each looking straight at one face. A feature that is a circle in one view and a pair of hidden lines in another is the same hole seen from two directions. Learning to hold the part in your head across views is the core skill.

Dimensions. Linear dimensions give distances, a diameter is marked with the diameter symbol, and a radius is marked with R. Every dimension either sizes a feature or locates it from an edge or another feature. If a hole has no locating dimensions, its position is undefined, which is a real error, not a detail.

Callouts. A hole callout packs the manufacturing information into one note. A note reading 0.172 diameter THRU means a 0.172 inch hole all the way through. That number is the standard clearance for an 8-32 screw, which is why reading callouts and knowing hardware go together.

Title block. The corner block carries material, scale, units, and the default tolerance that applies to any dimension without its own tolerance. Miss the title block and you can machine a correct shape out of the wrong material.

Worked example, a simple bracket. Read the front view for overall length and height, read the right view for thickness, then find each hole and confirm it has both a size callout and two locating dimensions. If all of that is present, the part is fully defined and you could cut it.

## Drill

1. A circle appears in the top view and two dashed lines in the front view. What is it?
2. What does a callout of 0.266 diameter THRU tell a machinist?
3. A hole has a diameter callout but no dimensions to any edge. What is missing and why does it matter?
4. Where do you find the material and the default tolerance?
5. How do you decide which 3D part matches a given set of front, top, and side views?

Answers: 1. A hole, a circle from the top and hidden lines from the front. 2. Drill a 0.266 inch hole all the way through, the 1/4-20 clearance size. 3. Its locating dimensions; without them the hole position is undefined and the part cannot be made correctly. 4. The title block. 5. The part whose front, top, and side profiles match all three views.

## Gate

GAUNTLET Drawing Reading mode, already built. Students answer interpretation questions against real full-sheet drawings. Threshold set in the mode. Auto-graded.

## Apply

Open a real FRC part drawing from a vendor, such as a gearbox plate or a bearing block. Identify its overall size, its material, and what the part is for. Submit the three answers. Auto-checked against the known values for that drawing.

===

id: MDM-3
title: FRC Hardware Vocabulary
domain: CAD and Mechanical Design
order: 3
prerequisite: MDM-2
gate: quiz
gatePass: 90

## Brief

You cannot design a mechanism if you cannot name its pieces. FRC runs on a shared library of commercial parts, and a designer who knows that library builds faster and orders correctly. Here is the current vocabulary, grouped by what the parts do.

Where parts come from. The competitive vendors today are West Coast Products, REV Robotics, CTRE, AndyMark, and The Thrifty Bot for robot-specific parts, plus McMaster-Carr for raw hardware, fasteners, and bearings. VEXpro, once a default, is gone and is not a source for new designs.

Structure. Robots are built from aluminum box tube, usually 1 by 1 and 2 by 1, joined with gusset plates, plus flat plate for custom parts. Two plates are held apart by standoffs or spacers. A standoff is threaded and takes a bolt from each end. A spacer is a plain tube that a single long bolt passes through, which puts the bolt in tension and the spacer in compression and makes the joint stiffer. That preload difference is why the choice matters.

Fasteners. Sizes run from tiny 4-40 up to 1/4-20. The number 10 sizes are the structural workhorse. The 10-32 fine thread is especially common because most current COTS parts, including swerve modules and gearboxes, are threaded 10-32, so many teams standardize on it. 1/4-20 handles the highest loads. A clearance hole lets a screw pass through and is slightly larger than the screw, so 8-32 clearance is 0.172 inch. A tapped hole has threads cut into the part so no nut is needed, and its drill is smaller than the screw. Nuts: nyloc has a nylon insert that resists vibration and belongs on pivots, keps has a built-in biting washer, and a pem nut presses into material too thin to tap. Rivets join parts fast from one side.

Rotating hardware. Torque travels through shafts, usually half-inch hex, ThunderHex, or round where a bearing rides. Bearings support the shaft, flanged or plain radial. Gears mesh to change speed and torque, described by tooth count and diametral pitch, the teeth per inch of pitch diameter, and two meshing gears sit at a center distance of the tooth counts added and divided by twice the pitch. Sprockets with chain and pulleys with belt do the same across a distance.

Motors and control. Brushless is the standard. The high-performance choices are the Kraken X60 and X44 from West Coast Products, with the controller built into the motor, and the REV NEO family including the NEO Vortex. Legacy brushed motors like the CIM are obsolete and are not used on new designs. Power runs through a REV PDH or CTRE PDP 2.0, and the robot talks to the field through the Vivid-Hosting VH-109 radio. Swerve is the drivetrain standard, led by the SDS MK5i and MK5n.

Why standardize. A team that limits itself to a few screw sizes and one shaft standard carries fewer spares, needs fewer tools, and repairs faster in the pit. Variety is a cost, not a feature.

Worked example, name the stackup. In a gearbox section a hex shaft rides in a flanged bearing pressed into a plate, a gear sits on the hex, spacers set its position, and a retaining ring holds it axially. Being able to say that sentence about a real assembly is the target for this unit.

## Drill

1. You need to hold two plates apart and want the stiffest joint. Standoff or spacer, and why?
2. Which fastener family is the structural workhorse, and why has 10-32 become so common?
3. A joint is on a pivot that vibrates every match. Which nut type?
4. Two meshing 20 diametral pitch gears have 24 and 60 teeth. What is their center distance? (Answer: (24 plus 60) divided by (2 times 20), which is 2.1 inches.)
5. Name the current high-performance brushless motor options, and name one obsolete motor you would not design around.

Answers: 1. A spacer with a through-bolt, because the bolt goes into tension and the spacer into compression for a stiffer preloaded joint. 2. The number 10 sizes; 10-32 is common because most current COTS parts are threaded 10-32. 3. Nyloc. 4. (24 plus 60) divided by (2 times 20), which is 2.1 inches. 5. Current: Kraken X60 or X44 and the REV NEO family including NEO Vortex. Obsolete: the CIM.

## Gate

Identification and matching quiz, roughly 15 items, image-based where useful. Covers vendor to part, fastener selection, structure terms, rotating hardware, and current versus obsolete motors. Auto-graded, pass at 90 percent, test-out allowed.

## Apply

Inventory one section of the practice robot. Photograph it and label the COTS hardware you can name: the structure, the fasteners, and any rotating parts. Peer-reviewed against a checklist, with instructor spot-audit.

===

id: MDM-4
title: Sketching and the First Solid
domain: CAD and Mechanical Design
order: 4
prerequisite: MDM-3
gate: gauntlet:speedrun
gatePass: 90

## Brief

Every SolidWorks part starts as a sketch, so this is where mechanical CAD begins. A sketch is 2D geometry drawn on a plane, and the goal is to fully define it. SolidWorks shows an under-defined sketch in blue and a fully defined one in black. You reach black by adding relations, such as horizontal, vertical, equal, or coincident, and dimensions until nothing can move. A fully defined sketch is a part that behaves predictably when you edit it, which is the whole point.

The three default planes, Front, Top, and Right, are where sketches live. Pick the plane that matches how the part sits in the real world so later features and assemblies line up.

Features turn a sketch into a solid. Extrude Boss adds material by pushing a sketch through a depth. Extrude Cut removes material the same way. Almost every simple FRC part is a few boss and cut features on well-chosen sketches.

Design intent means dimensioning so the part updates the way you want. If a plate should always be a quarter inch thick regardless of its length, the thickness is one dimension and the length is another, and changing one does not disturb the other.

Machinability rule from day one. Dimension to clean fractions of an inch, since 1/8 inch is 0.125 and 3/8 inch is 0.375, so parts are easy to make in the shop.

Worked example, a simple plate. Sketch a rectangle on the Front plane, add a horizontal relation and two dimensions until it turns black, then Extrude Boss 0.125 inch. That is a finished 1/8 inch aluminum plate, and it is the foundation every other part builds on.

## Drill

1. Your sketch is blue. What does that mean and how do you fix it?
2. Which feature adds material and which removes it?
3. You want a plate that stays 0.25 inch thick no matter how long it gets. How do you dimension it so length and thickness do not interfere?
4. Why choose the plane a part is sketched on deliberately rather than at random?
5. Convert 3/8 inch and 5/8 inch to the decimals you would type into a dimension.

Answers: 1. It is under-defined; add relations and dimensions until it turns black. 2. Extrude Boss adds material, Extrude Cut removes it. 3. Make thickness one dimension and length a separate dimension so changing one does not affect the other. 4. So the part sits in the right orientation and later features and assemblies line up. 5. 0.375 and 0.625.

## Gate

GAUNTLET Speedrun, easy tier. Model a simple part to a target mass, verified by volume. Passes on a correct model within tolerance.

## Apply

Model a real simple FRC part, such as a gusset or a spacer, to given dimensions, and match the target mass. Verified in GAUNTLET.

===

id: MDM-5
title: Building Real Parts
domain: CAD and Mechanical Design
order: 5
prerequisite: MDM-4
gate: gauntlet:feature-golf
gatePass: 90

## Brief

Real parts are more than one extrude, and the skill is adding features cleanly. A few well-chosen features beat a pile of messy ones, because a clean part is one anyone can edit later without it falling apart.

Holes come from the Hole Wizard, not a sketched circle, whenever the hole is a real fastener hole. The Hole Wizard places a correctly sized clearance or tapped hole and carries the callout information into the drawing automatically, which is why it saves time downstream. A sketched circle is only for a plain round opening that is not a fastener.

Patterns repeat a feature so you do not draw it many times. A linear pattern makes a row of lightening holes, and a circular pattern makes a bolt circle. Editing the pattern edits every copy at once, which is design intent working for you.

Fillets round edges and chamfers bevel them, for strength, clearance, or finish. Reference geometry, such as an added plane or axis, gives features something to locate against when the default planes are not enough.

Feature order matters. Features build in a tree, and later features depend on earlier ones, so a change high in the tree ripples down. Building in a sensible order keeps edits predictable. The target is a part with a short, readable tree that a teammate could pick up and modify.

Worked example, a box-tube segment. Start from a tube profile, cut a row of lightening holes with a linear pattern, then place mounting holes with the Hole Wizard. Two features carry all the repetition, and the whole part stays easy to change.

## Drill

1. You need a tapped 10-32 hole that will show a correct callout on the drawing. Hole Wizard or sketched circle, and why?
2. You need eight identical holes in a row. What tool, and what is the advantage over drawing eight circles?
3. Why does the order of features in the tree matter when you edit a part later?
4. What is the difference between a fillet and a chamfer, and give one reason to use each?
5. Your part has thirty scattered features doing simple work. Why is that a problem?

Answers: 1. The Hole Wizard, because it sizes the hole for the screw and carries the callout onto the drawing. 2. A linear pattern; editing the pattern edits every hole at once. 3. Later features depend on earlier ones, so a change ripples down; a sensible order keeps edits predictable. 4. A fillet rounds an edge for strength or finish, a chamfer bevels it for clearance or a lead-in. 5. A messy tree is hard to read and edit; a clean part uses a few well-chosen features.

## Gate

GAUNTLET Feature Golf. Model a target part in an efficient feature tree, scored on feature count and correctness. Passes on a correct model within the feature budget.

## Apply

Model a box-tube segment with a mounting-hole pattern to spec, using a pattern and the Hole Wizard. Verified in GAUNTLET.

===

id: MDM-6
title: Assemblies, Mates, and Modifying Existing CAD
domain: CAD and Mechanical Design
order: 6
prerequisite: MDM-5
gate: gauntlet:reverse-engineer
gatePass: 90

## Brief

An assembly brings parts together and defines how they relate, and this unit closes the gap where a student can model a part but cannot change an existing design.

The first part inserted into an assembly is fixed, or grounded, which gives everything else a stable reference. Every other part is located by mates. A concentric mate lines up a shaft with a bore, a coincident mate seats one face against another, and together they constrain a component. Mechanical mates go further, and a gear mate makes two gears turn together at their tooth ratio so the assembly moves like the real mechanism.

The core FRC skill here is modifying existing CAD. Much of real robot work is opening someone else's part or assembly and making a controlled change without breaking it. That means editing the sketch or feature that drives the geometry, not remodeling from scratch. To move a hole, you edit the dimension in its sketch. To resize a plate, you change the length dimension. To swap a part, you replace the component and repair any broken mates. Done well, the change flows through the whole assembly and everything updates.

The habit that makes this safe is understanding what drives what before you touch anything. Find the dimension or feature that controls the thing you want to change, edit that, and let the model rebuild. Guessing and dragging geometry is how models break.

Worked example, move a hole. Open a bracket, find the sketch dimension that locates the mounting hole, change it by half an inch, and rebuild. The hole moves, the assembly updates, and nothing else is disturbed. That controlled edit is the target skill.

## Drill

1. What is special about the first part inserted into an assembly?
2. A shaft needs to sit in a bore and seat against a face. Which two mates do that?
3. You need to move a hole in an existing part. What do you edit, and what do you not do?
4. What does a gear mate add that concentric and coincident mates do not?
5. You changed a driving dimension and three other features broke. What does that tell you about the part, and how would you avoid it next time?

Answers: 1. It is fixed, or grounded, giving everything else a stable reference. 2. Concentric for the shaft in the bore, coincident for the face. 3. Edit the sketch dimension that locates the hole; do not remodel from scratch or drag geometry. 4. It makes two gears turn together at their tooth ratio so the assembly moves like the real mechanism. 5. The part depends on that dimension fragilely; build with clean deliberate design intent so edits rebuild predictably.

## Gate

GAUNTLET Reverse Engineer, rebuild a target part from a reference, plus a modify-existing challenge where you are given a part and must make a specified change, verified by the resulting mass. Passes on a correct result within tolerance.

## Apply

Take an existing robot bracket and make a specified modification, such as adding half an inch to a length or relocating a hole, by editing the driving dimension. Verified in GAUNTLET.

===

id: MDM-7
title: COTS Integration
domain: CAD and Mechanical Design
order: 7
prerequisite: MDM-6
gate: gauntlet:modeling
gatePass: 90

## Brief

The fastest way to lose a season is to hand-design something you could have bought. The COTS strategy is to build proven systems, like the drivetrain, from reliable off-the-shelf parts, so the team spends its limited engineering hours on the game-specific mechanism that actually wins the event. A designer who integrates COTS well is worth more than one who models everything from scratch.

Getting the CAD. Vendors publish 3D models, usually as a universal STEP file or a native SolidWorks part. Download every part you need into one organized project folder. A disorganized folder is how assemblies break and work gets lost, so this habit matters more than it looks.

The current ecosystem. A modern drivetrain is a purchased swerve module, such as an SDS MK5i or a REV MAXSwerve, driven by a Kraken X60 or a NEO Vortex. A mechanism often uses a cartridge gearbox like the REV MAXPlanetary sized for NEO-class motors. Wheels, bearings, and gears come from WCP, REV, and AndyMark. You rarely build these, you integrate them.

The workflow. Identify the COTS parts, download their CAD, insert them into an assembly, then design your custom parts, the plates and brackets, around them. Your custom geometry should be driven by the COTS part's real features, its bolt pattern and bore sizes, so the parts actually line up when built.

When you do design around gears. Two meshing gears sit at a center distance of the tooth counts added and divided by twice the diametral pitch, with 20 DP standard. Add a small center-add of about 0.002 inch so the gears do not bind under load.

Live versus dead axle. A live axle spins to carry torque to the wheel and is simpler. A dead axle stays still while the wheel spins around it and can double as a structural member. Pick based on whether you need simplicity or rigidity.

Worked example. To mount a Kraken-powered MAXPlanetary gearbox to a 2 by 1 tube, insert the gearbox CAD, then model a plate whose bolt holes are located directly from the gearbox's mounting pattern, so it bolts up with no rework.

## Drill

1. Why build the drivetrain from COTS instead of designing it custom?
2. Two 20 DP gears have 18 and 54 teeth. What is their center distance, and why add a small center-add? (Answer: (18 plus 54) divided by (2 times 20), which is 1.8 inches.)
3. Live axle versus dead axle: which one spins, and give one benefit of each.
4. You are modeling a plate to mount a COTS gearbox. What should drive your hole positions?
5. Why does folder organization matter for a COTS assembly?

Answers: 1. To spend limited engineering hours on the game-specific mechanism that wins, not on reinventing reliable systems. 2. (18 plus 54) divided by (2 times 20), which is 1.8 inches; add about 0.002 inch so the gears do not bind. 3. The live axle spins and is simpler; the dead axle stays still with the wheel spinning around it and can be structural. 4. The gearbox's real mounting bolt pattern. 5. Disorganized files break assemblies and lose references and work.

## Gate

GAUNTLET modeling. Model a custom mounting plate to spec that locates its holes from a given COTS bolt pattern, verified by volume. Passes on a correct model within tolerance.

## Apply

Download a current COTS part's CAD, such as a gearbox or swerve module, insert it into an assembly, and model a custom bracket that mounts it to a tube. Verified in GAUNTLET or by submitted assembly.

===

id: MDM-8
title: Shafts, Bearings, and Stackups
domain: CAD and Mechanical Design
order: 8
prerequisite: MDM-7
gate: gauntlet:modeling
gatePass: 90

## Brief

A stackup is the sequence of parts along a shaft between two support plates, arranged so everything is located, spins freely, and cannot slide off. Getting a stackup right is a signature mechanical skill, and it is where a lot of first robots fail.

Two kinds of constraint. Bearings support the shaft radially, carrying the side loads. Something must also stop the shaft and its parts from sliding along the axis. You need both, and confusing them is a common mistake.

Shaft profiles. A hex or ThunderHex profile transmits torque, because a gear with a matching hex bore locks to it and turns with it. A bearing, though, needs a round surface to ride on. So a torque-carrying shaft is often hex through the gear and turned down to round where it passes through the bearings.

Retention is a design decision, not one default. There are three common methods, and a strong designer picks the right one for the job. Retaining rings and E-clips clip into a machined groove and are the lightest and most compact option, so for weight and size nothing beats them; the cost is that you must cut a groove in the exact location on a lathe, and the part cannot be repositioned. Clamping shaft collars slide on and clamp with bolts, spreading force evenly around the shaft; they are close to bulletproof and adjustable with no shaft machining, but bulkier and pricier, and you must use the clamping type, not a set-screw type that digs a burr into the shaft. A tapped shaft end with a bolt and a washer retains a component from the end; it is clean and needs no external groove, and many current COTS hex shafts ship with tapped ends, but it relies on threadlocker so the bolt does not vibrate loose.

The judgment underneath all three: an engineered solution that cannot be assembled wrong beats one that depends on an operator following a procedure. A retaining ring or a clamping collar is hard to get wrong. A tapped end depends on someone remembering the threadlocker, so if you use it, treat that step as non-negotiable.

Spacing and a pro detail. To center a gear between plates set 2.500 inches apart, the widths of the bearings, the gear, and the spacers must add up correctly along the shaft. Put a shim or washer between the retaining feature and the bearing so it only touches the bearing's inner race; if it rubs the outer race, the bearing fights itself and wastes energy. Make torque-carrying sections slightly long, adding about 0.01 inch, so part-width variation never leaves the shaft too short.

Plate separation. Standoffs are threaded and bolt from each end. Spacers are plain tubes that a single long bolt runs through, putting the bolt in tension and the spacer in compression, which with steel bolts gives a stiffer, preloaded joint.

Worked example. A half-inch ThunderHex shaft crosses two 1/8 inch plates 2.500 inches apart, riding in a radial bearing in each plate, with a gear centered by spacers and retained by the method you judge best for the load and the shop.

## Drill

1. A bearing constrains the shaft in which direction, and what job does retention do?
2. Why is a torque-carrying shaft turned down to round where it passes through a bearing?
3. Given a light, space-constrained mechanism where you can machine grooves, which retention method fits, and why?
4. Why use a clamping collar rather than a set-screw collar?
5. You retain a wheel with a bolt into a tapped shaft end. What single step is non-negotiable, and why?
6. Why put a washer between the retainer and the bearing's inner race?

Answers: 1. The bearing constrains it radially; retention constrains it axially so it cannot slide. 2. Bearings need a round surface to ride on, while the hex carries torque through the gear. 3. Retaining rings or E-clips, because they are the lightest and most compact. 4. A clamping collar spreads force evenly and does not mar the shaft, while a set screw digs a burr that ruins it for reuse. 5. Threadlocker, so the bolt does not vibrate loose. 6. So it only pushes on the bearing's inner race; rubbing the outer race makes the bearing fight itself and waste energy.

## Gate

GAUNTLET modeling. Model a custom shaft with hex and turned-down round sections to spec, designed for one of the three retention methods, verified by volume. Passes on correct geometry.

## Apply

Model a complete shaft stackup for a real mechanism, two plates, bearings, a centered gear, spacers, and a retention method you justify. Verified in GAUNTLET or by submitted assembly.

===

id: MDM-9
title: Fasteners and Joints in CAD
domain: CAD and Mechanical Design
order: 9
prerequisite: MDM-8
gate: gauntlet:modeling
gatePass: 90

## Brief

A robot is held together by its fasteners, and a single wrong hole causes rework under time pressure. This unit is about putting the right hole in the right place in SolidWorks.

Clearance versus tapped. A clearance hole lets a screw pass through freely and is slightly larger than the screw, used when a nut or the far part takes the thread. A tapped hole has threads cut into the part so the screw fastens directly into it, and its drill is smaller than the screw. Choose tapped when you are fastening into a thick part with no room for a nut.

The Hole Wizard. In SolidWorks, place fastener holes with the Hole Wizard, never a sketched circle. It sizes the clearance or tapped hole for the exact screw and carries the callout into the drawing automatically, which saves time and prevents errors downstream. A sketched circle is only for a plain round opening that is not a fastener.

Sizes worth knowing. An 8-32 clearance hole is 0.172 inch, a 10-24 is 0.203 inch, and a 1/4-20 is 0.266 inch. Tapped holes use a smaller tap drill, and McMaster-Carr lists the exact values.

Nut selection. Nyloc has a nylon insert that resists vibration and belongs on pivots and anything that shakes. Keps has a built-in biting washer. A pem nut presses into material too thin to tap. Rivets join parts fast from one side.

Joint quality. A good joint puts the fastener where the load is, keeps enough material around the hole for edge distance, and matches the retention to the vibration. A through-bolt with a spacer makes a stiffer, preloaded joint.

Drawing communication. The Hole Callout tool annotates each hole so a machinist reads the size and depth without asking, for example a note of 0.203 diameter THRU.

Worked example. A bracket bolts to a tube through two 10-32 clearance holes and taps a 1/4-20 hole for a mount, all placed with the Hole Wizard so every callout appears on the drawing automatically.

## Drill

1. You are fastening into a 1/2 inch aluminum block with no room for a nut. Clearance or tapped, and why?
2. What does the Hole Wizard do that a sketched circle does not?
3. What diameter is an 8-32 clearance hole?
4. A pivot vibrates every match. Which nut type?
5. What does a callout of 0.203 diameter THRU tell a machinist?

Answers: 1. Tapped, so the screw threads directly into the part. 2. It sizes the hole for the exact screw and carries the callout onto the drawing automatically. 3. 0.172 inch. 4. Nyloc. 5. Drill a 0.203 inch hole all the way through, the 10-24 clearance size.

## Gate

GAUNTLET modeling with a hole check. Model a plate with correctly sized clearance and tapped holes placed by the Hole Wizard, verified by hole geometry and position, plus a 90 percent knowledge quiz on fastener and nut selection. Passes on a correct model and a passing quiz.

## Apply

Model a real bracket that fastens to the robot frame, using the Hole Wizard for every fastener hole, and generate the drawing with callouts. Verified in GAUNTLET or by submitted files.

===

id: MDM-10
title: Tolerancing and GD and T Basics
domain: CAD and Mechanical Design
order: 10
prerequisite: MDM-9
gate: gauntlet:gd-t
gatePass: 90

## Brief

No part is made perfectly, so a tolerance is the allowed variation on a dimension. Tolerancing is what lets parts fit and function in the real world, and knowing where to apply it, and where not to, separates a designer from a modeler.

Why it matters. A dimension without a stated tolerance falls back to the title-block default, so leaving it off does not mean perfect, it means whatever the shop default is. Tolerances let mating parts work despite manufacturing variation.

Fits. A clearance fit makes the hole larger than the shaft so it slides, used where a shaft turns inside a bearing. An interference or press fit makes the feature slightly larger so it must be pressed in, used where a bearing seats into a plate bore. A transition fit sits between the two. Choosing the fit sets the tolerances.

Practical FRC numbers. Make torque-carrying shaft sections about 0.01 inch long for tolerance. For a laser-cut or waterjet slot-and-tab joint, open the slot by about 0.005 inch and shrink the tab by about 0.005 inch so the parts actually assemble.

GD and T basics. Geometric Dimensioning and Tolerancing controls not just size but form, orientation, and position. A feature control frame specifies a geometric control such as position, flatness, or perpendicularity, a tolerance zone, and the datums it references. Common controls are position, where a hole must sit, flatness, how flat a face must be, and perpendicularity, how square a feature is to a datum. GD and T removes ambiguity that plus-or-minus size alone cannot.

Datums. Datums are the reference features everything else is measured from. Good datums match how the part is actually located and used.

Where it belongs in FRC. Precision interfaces earn tight tolerances and GD and T, like bearing bores, gear center distances, and mating patterns. Over-toleranced parts waste shop time and under-toleranced parts fit badly, so tolerance only what needs it.

Worked example. A bearing bore carries a tight tolerance for a press fit and a position control on its bolt pattern so the part mates correctly, while the outer edges keep the loose default tolerance.

## Drill

1. What is a tolerance, and what actually happens to a dimension that does not have one?
2. A bearing presses into a plate bore, and a shaft slides through the bearing. Which fit is each?
3. For a laser-cut slot-and-tab joint, how do you adjust the slot and the tab for a good fit?
4. What does a feature control frame specify beyond a plus-or-minus size?
5. Why not put a tight tolerance on every dimension?

Answers: 1. The allowed variation on a dimension; without one it falls back to the title-block default. 2. The bearing into the bore is an interference or press fit; the shaft through the bearing is a clearance fit. 3. Open the slot about 0.005 inch and shrink the tab about 0.005 inch. 4. A geometric control such as position, flatness, or perpendicularity, a tolerance zone, and the datums it references. 5. Tight tolerances waste shop time, so tolerance only what needs it.

## Gate

GAUNTLET GD and T mode, the existing question bank with feature-control-frame illustrations, at 90 percent. Reads and interprets GD and T callouts.

## Apply

Take a real part and identify the one or two dimensions that genuinely need a tolerance or a GD and T control, such as a bearing bore or a bolt pattern, specify them, and leave the rest at default. Reviewed.
