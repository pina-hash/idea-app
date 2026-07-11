using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.swcommands;
// The sldworks interop has its own Environment type; keep the BCL one.
using Environment = System.Environment;

namespace IdeaFspPawn
{
    /// <summary>
    /// The PAWN BUILD task pane: a five-phase wizard that walks an FSP freshman
    /// (no CAD experience assumed) through copying the classroom template,
    /// drawing a pawn profile, revolving it, and emailing the STEP export to
    /// the teacher. The pane does as much as the API permits FOR the student
    /// and advances automatically wherever completion is detectable.
    /// All SOLIDWORKS COM access happens on the pane's owning (main) thread;
    /// the polling uses System.Windows.Forms.Timer, which ticks on that thread.
    /// </summary>
    public partial class PawnWizardPanel : UserControl
    {
        // ==================================================================
        // CLASSROOM CONFIGURATION
        // These are the defaults. Every one of them can ALSO be overridden
        // WITHOUT a recompile by dropping a plain-text file named
        // "pawn-wizard-config.txt" next to FspPawnAddin.dll, one KEY=VALUE
        // per line (see README-install.md). Keys: FspFolderName,
        // ProfileSketchName, TeacherEmail, EmailSubject, EmailBody.
        // ==================================================================
        private const string DefaultFspFolderName = "IDEA_FSP";
        private const string DefaultProfileSketchName = "Pawn_Profile";
        private const string DefaultTeacherEmail = "apina@boscotech.edu";
        private const string DefaultEmailSubject = "pawn";
        private const string DefaultEmailBody = "Hi Mr. Pina, here is my pawn file.";
        private const string ConfigFileName = "pawn-wizard-config.txt";

        // DOGTAG mode classroom config (also overridable via the same config file;
        // keys dogtag_email_to and dogtag_email_subject; see README-install.md).
        private const string DefaultDogtagEmailTo = "apina@boscotech.edu";
        private const string DefaultDogtagEmailSubject = "dogtag";
        private const string DogtagEmailBody = "Hi Mr. Pina, here is my dogtag file.";

        // Starting-sketch geometry (SI meters, since the sketch API is metric
        // regardless of the document's IPS display units).
        // A finished pawn should read like a real chess pawn, so the revolve
        // axis is ~2 in tall and the base guide ~0.75 in wide.
        private const double PawnHeightMeters = 0.0508;   // 2 in
        private const double BaseGuideMeters = 0.01905;   // 0.75 in
        private const double CloseTolMeters = 1e-4;        // 0.1 mm endpoint snap tolerance

        // DOGTAG geometry (US military standard, IPS; the sketch API is metric so
        // every inch value is converted to meters via InchToM).
        private const double InchToM = 0.0254;
        private const double DogBodyHalfW = 0.5625 * InchToM;  // 1.125 in wide  -> half
        private const double DogBodyHalfH = 1.0 * InchToM;     // 2.0 in tall    -> half
        private const double DogCornerMil = 0.125 * InchToM;   // MILITARY corner radius
        private const double DogCornerRect = 0.0625 * InchToM; // RECT corner radius
        private const double DogRoundR = 0.6875 * InchToM;     // 1.375 in dia   -> radius
        private const double DogHoleR = 0.09375 * InchToM;     // 0.1875 in dia  -> radius
        private const double DogHoleFromTop = 0.15 * InchToM;  // hole center below top edge
        private const double DogDepth = 0.037 * InchToM;       // extrusion (part thickness)
        private const double DogNameH = 0.175 * InchToM;       // name text height
        private const double DogDateH = 0.1 * InchToM;         // "IDEA FSP <year>" text height
        private const double DogDateGap = 0.25 * InchToM;      // gap below the name

        private const string DogtagBodySketch = "Dogtag_Body";
        private const string DogtagEngraveSketch = "Dogtag_Engrave";

        // Dogtag shape choices.
        private const int ShapeMilitary = 0;
        private const int ShapeRound = 1;
        private const int ShapeRect = 2;
        private const int ShapeCustom = 3;

        // UI spec palette.
        private static readonly Color Bg = Color.FromArgb(0x1A, 0x1A, 0x1A);
        private static readonly Color BgPanel = Color.FromArgb(0x24, 0x24, 0x24);
        private static readonly Color Green = Color.FromArgb(0x00, 0xFF, 0x41);
        private static readonly Color GreenDone = Color.FromArgb(0x00, 0x7A, 0x1F);
        private static readonly Color ErrorRed = Color.FromArgb(0xFF, 0x33, 0x55);
        private static readonly Color Amber = Color.FromArgb(0xFF, 0xB0, 0x00);
        private static readonly Color TextPrimary = Color.White;
        private static readonly Color TextSecondary = Color.FromArgb(0x88, 0x88, 0x88);
        private static readonly Color BtnSecondaryBg = Color.FromArgb(0x33, 0x33, 0x33);
        private static readonly Color BtnDisabledBg = Color.FromArgb(0x2A, 0x2A, 0x2A);
        private static readonly Color BtnDisabledText = Color.FromArgb(0x55, 0x55, 0x55);
        private static readonly Color DotUpcoming = Color.FromArgb(0x33, 0x33, 0x33);

        // UI spec typography.
        private static readonly Font TitleFont = new Font("Segoe UI", 16f, FontStyle.Bold);
        private static readonly Font BodyFont = new Font("Segoe UI", 12f);
        private static readonly Font BodyBoldFont = new Font("Segoe UI", 12f, FontStyle.Bold);
        private static readonly Font ButtonFont = new Font("Segoe UI", 11f, FontStyle.Bold);
        private static readonly Font PathFont = new Font("Consolas", 10f);
        private static readonly Font SmallFont = new Font("Segoe UI", 9f);

        private const string StuckHelp =
            "Try connecting your last point back to your first point. Zoom out to check for gaps. " +
            "Ctrl+Z to undo and try again.";

        private readonly ISldWorks swApp;

        // Effective configuration (defaults, possibly overridden by the config file).
        private string cfgFolderName;
        private string cfgSketchName;
        private string cfgTeacherEmail;
        private string cfgEmailSubject;
        private string cfgEmailBody;
        private string cfgDogtagEmailTo;
        private string cfgDogtagEmailSubject;

        // Which activity is running: 0 = mode selector (the first screen), 1 = the
        // PAWN BUILD flow, 2 = the DOGTAG DESIGNER flow. Both flows share this
        // panel, the chrome (BACK / START OVER / progress dots), and the design
        // language; each has its own phases keyed off `phase`.
        private int mode;

        // Wizard state, filled by Phase 0.
        private int phase;
        private string studentName = "";
        private string fspFolder = "";
        private string partPath = "";
        private string stepPath = "";

        // Phase 0 controls.
        private TextBox txtFirstName;
        private Label lblNameError;

        // DOGTAG state + controls.
        private int dogtagShape = ShapeMilitary;
        private string dogtagImagePath = "";      // uploaded reference image (optional)
        private string dogtagImageDest = "";      // where it was copied on export
        private bool dogtagImageHasColor;
        private string dxfPath = "";
        private string dogtagStem = "";           // sanitized name stem for filenames
        private bool dogtagExportDone;
        private TextBox txtDogName;
        private Label lblDogNameError;
        private Button[] shapeButtons;
        private PictureBox imgThumb;
        private Bitmap imgThumbBmp;
        private Label lblImgName;
        private Label lblImgWarn;
        private TableLayoutPanel imgPreviewRow;
        private bool dogtagEditing;      // Phase 2 EDIT: watching for the sketch to close

        // Phase 2 controls + state.
        private Panel statusCircle;
        private Label lblSketchStatus;
        private Panel stuckPanel;
        private Panel advPanel;         // ADVANCED TOOLS (relations + trim) drawer
        private Button btnRevolve;
        private CheckBox chkTrace;      // "I traced along the dotted floor line"
        private int sketchState;        // 0 = grey (none), 1 = red (open), 2 = green (closed), 3 = amber (crosses axis)
        private bool revolveArmed;
        private bool traceConfirmed;

        // Phase 3 controls + state.
        private Label lblRevolveHint;
        private Panel waitCircle;
        private int baselineFeatureCount;

        // Timers (all UI-thread).
        private System.Windows.Forms.Timer sketchTimer;   // Phase 2: 2 s sketch poll
        private System.Windows.Forms.Timer revolveTimer;  // Phase 3: 1 s feature poll
        private System.Windows.Forms.Timer pulseTimer;    // indicator pulse animation
        private System.Windows.Forms.Timer bannerTimer;   // error banner slide-in
        private System.Windows.Forms.Timer emailMoveTimer; // one-shot: nudge the email window aside
        private bool pulseOn = true;
        private int pulseRemaining;                       // >0 finite half-toggles, -1 continuous
        private int bannerTargetHeight;

        private readonly List<Label> wrapLabels = new List<Label>();

        // The "what this step should look like" illustration for the current
        // phase, drawn at runtime by PawnStepArt and disposed on phase change.
        private Bitmap stepImage;
        private PictureBox stepPictureBox;

        public PawnWizardPanel(ISldWorks app)
        {
            swApp = app;
            LoadConfig();
            InitializeComponent();

            sketchTimer = new System.Windows.Forms.Timer();
            sketchTimer.Interval = 2000;
            sketchTimer.Tick += OnSketchPollTick;

            revolveTimer = new System.Windows.Forms.Timer();
            revolveTimer.Interval = 1000;
            revolveTimer.Tick += OnRevolvePollTick;

            pulseTimer = new System.Windows.Forms.Timer();
            pulseTimer.Interval = 140;
            pulseTimer.Tick += OnPulseTick;

            bannerTimer = new System.Windows.Forms.Timer();
            bannerTimer.Interval = 15;
            bannerTimer.Tick += OnBannerTick;

            emailMoveTimer = new System.Windows.Forms.Timer();
            emailMoveTimer.Interval = 1200;   // let the browser window appear first
            emailMoveTimer.Tick += OnEmailMoveTick;

            ShowModeSelect();
        }

        /// <summary>Called by the add-in on disconnect; stops all timers.</summary>
        public void ShutDown()
        {
            try { if (sketchTimer != null) { sketchTimer.Stop(); sketchTimer.Dispose(); sketchTimer = null; } } catch { }
            try { if (revolveTimer != null) { revolveTimer.Stop(); revolveTimer.Dispose(); revolveTimer = null; } } catch { }
            try { if (pulseTimer != null) { pulseTimer.Stop(); pulseTimer.Dispose(); pulseTimer = null; } } catch { }
            try { if (bannerTimer != null) { bannerTimer.Stop(); bannerTimer.Dispose(); bannerTimer = null; } } catch { }
            try { if (emailMoveTimer != null) { emailMoveTimer.Stop(); emailMoveTimer.Dispose(); emailMoveTimer = null; } } catch { }
        }

        // ------------------------------------------------------------------
        // Configuration file (optional, no-recompile overrides)
        // ------------------------------------------------------------------

        private void LoadConfig()
        {
            cfgFolderName = DefaultFspFolderName;
            cfgSketchName = DefaultProfileSketchName;
            cfgTeacherEmail = DefaultTeacherEmail;
            cfgEmailSubject = DefaultEmailSubject;
            cfgEmailBody = DefaultEmailBody;
            cfgDogtagEmailTo = DefaultDogtagEmailTo;
            cfgDogtagEmailSubject = DefaultDogtagEmailSubject;
            try
            {
                string dir = Path.GetDirectoryName(GetType().Assembly.Location);
                if (string.IsNullOrEmpty(dir)) return;
                string path = Path.Combine(dir, ConfigFileName);
                if (!File.Exists(path)) return;
                string[] lines = File.ReadAllLines(path);
                foreach (string raw in lines)
                {
                    string line = raw == null ? "" : raw.Trim();
                    if (line.Length == 0 || line.StartsWith("#")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = line.Substring(0, eq).Trim();
                    string value = line.Substring(eq + 1).Trim();
                    if (value.Length == 0) continue;
                    if (key.Equals("FspFolderName", StringComparison.OrdinalIgnoreCase)) cfgFolderName = value;
                    else if (key.Equals("ProfileSketchName", StringComparison.OrdinalIgnoreCase)) cfgSketchName = value;
                    else if (key.Equals("TeacherEmail", StringComparison.OrdinalIgnoreCase)) cfgTeacherEmail = value;
                    else if (key.Equals("EmailSubject", StringComparison.OrdinalIgnoreCase)) cfgEmailSubject = value;
                    else if (key.Equals("EmailBody", StringComparison.OrdinalIgnoreCase)) cfgEmailBody = value;
                    else if (key.Equals("dogtag_email_to", StringComparison.OrdinalIgnoreCase)) cfgDogtagEmailTo = value;
                    else if (key.Equals("dogtag_email_subject", StringComparison.OrdinalIgnoreCase)) cfgDogtagEmailSubject = value;
                }
            }
            catch
            {
                // Config trouble must never block the wizard; defaults stand.
            }
        }

        // ------------------------------------------------------------------
        // Phase switching
        // ------------------------------------------------------------------

        /// <summary>Shared teardown: stop timers, clear the content host, dispose
        /// the step image. Both ShowPhase and ShowModeSelect start here.</summary>
        private void PrepContent()
        {
            if (sketchTimer != null) sketchTimer.Stop();
            if (revolveTimer != null) revolveTimer.Stop();
            StopPulse();
            HideErrorBanner();
            wrapLabels.Clear();
            DisposeStepImage();
            DisposeDogtagThumb();

            contentHost.SuspendLayout();
            while (contentHost.Controls.Count > 0)
            {
                Control old = contentHost.Controls[0];
                contentHost.Controls.RemoveAt(0);
                old.Dispose();
            }
        }

        /// <summary>Shared finish: mount the table, refresh the chrome.</summary>
        private void FinishContent(TableLayoutPanel table)
        {
            contentHost.Controls.Add(table);
            contentHost.ResumeLayout();
            UpdateChrome();
            progressStrip.Invalidate();
            ApplyWrapWidths();
        }

        /// <summary>
        /// BACK and START OVER show once a mode is chosen (not on the selector).
        /// The dots are painted by OnProgressStripPaint using `mode` + `phase`.
        /// </summary>
        private void UpdateChrome()
        {
            bool inMode = mode != 0;
            if (restartButton != null) { restartButton.Visible = inMode; restartButton.BringToFront(); }
            if (backButton != null) { backButton.Visible = inMode; backButton.BringToFront(); }
        }

        /// <summary>
        /// The first screen: choose PAWN BUILD or DOGTAG DESIGNER. Both live in
        /// this same panel; picking one sets `mode` and enters its Phase 0.
        /// </summary>
        private void ShowModeSelect()
        {
            mode = 0;
            phase = 0;
            PrepContent();
            TableLayoutPanel t = NewPhaseTable();
            BuildModeSelect(t);
            FinishContent(t);
        }

        private void ShowPhase(int n)
        {
            phase = n;
            PrepContent();

            TableLayoutPanel table = NewPhaseTable();
            if (mode == 2)
            {
                switch (n)
                {
                    case 0: BuildDogtagPhase0(table); break;
                    case 1: BuildDogtagPhase1(table); break;
                    case 2: BuildDogtagPhase2(table); break;
                    case 3: BuildDogtagPhase3(table); break;
                }
            }
            else
            {
                switch (n)
                {
                    case 0: BuildPhase0(table); break;
                    case 1: BuildPhase1(table); break;
                    case 2: BuildPhase2(table); break;
                    case 3: BuildPhase3(table); break;
                    case 4: BuildPhase4(table); break;
                }
            }
            FinishContent(table);

            // Kick off the phase's automatic behavior.
            if (mode == 2)
            {
                if (n == 1)
                {
                    // Custom-outline drawing page: keep the body sketch open so the
                    // student can draw (and so BACK into this page works).
                    EnsureBodySketchOpen(DogtagBodySketch);
                    sketchState = -1;
                    PollSketchOnce();
                    sketchTimer.Start();
                }
                else if (n == 3)
                {
                    // Export runs automatically on entry (guarded so re-entry via
                    // BACK never re-opens Gmail or re-writes files needlessly).
                    RunDogtagExport();
                }
                return;
            }

            if (n == 2)
            {
                // Re-open the profile sketch if it is not already being edited
                // (this is what makes BACK into this page work: the drawing pad
                // is ready to keep editing).
                EnsureProfileSketchOpen();
                sketchState = -1;   // force the first poll to paint a state
                PollSketchOnce();
                sketchTimer.Start();
            }
            else if (n == 3)
            {
                // Phase 3 no longer auto-opens the Revolve tool; the student
                // chooses the one-click path or the do-it-yourself path. The
                // poll still watches so the manual path advances on its own.
                baselineFeatureCount = SafeFeatureCount();
                revolveTimer.Start();
            }
        }

        /// <summary>
        /// Steps back exactly one page. Works on every page (hidden only on the
        /// first). Navigation only; the drawing itself is never deleted, so a
        /// student can back up to fix something and move forward again.
        /// </summary>
        private void OnBackClick(object sender, EventArgs e)
        {
            // Close any half-open sketch so the previous page is clean (except the
            // drawing pages, which want to keep their sketch open).
            bool keepSketch = (mode == 1 && phase == 2) || (mode == 2 && phase == 1);
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model != null && model.GetActiveSketch2() != null && !keepSketch)
                    model.InsertSketch2(true);
            }
            catch { }

            if (mode == 2)
            {
                // Dogtag: Phase 1 (custom outline) is skipped for the built-in
                // shapes, so BACK from Phase 2 lands on Phase 0 for those.
                if (phase == 2 && dogtagShape != ShapeCustom) { ShowPhase(0); return; }
                if (phase <= 0) { ShowModeSelect(); return; }
                ShowPhase(phase - 1);
                return;
            }

            if (phase <= 0) { ShowModeSelect(); return; }
            ShowPhase(phase - 1);
        }

        /// <summary>Opens the pawn profile sketch for editing if needed.</summary>
        private void EnsureProfileSketchOpen()
        {
            EnsureBodySketchOpen(cfgSketchName);
        }

        /// <summary>Opens the named sketch for editing if it is not already the
        /// active sketch. Safe to call repeatedly.</summary>
        private void EnsureBodySketchOpen(string sketchName)
        {
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null) return;
                if (model.GetActiveSketch2() != null) return;   // already editing a sketch
                IFeature feat = FindFeature(model, sketchName);
                if (feat == null) return;
                feat.Select2(false, 0);
                model.EditSketch();
            }
            catch { }
        }

        /// <summary>
        /// Full reset from anywhere: clears the per-file state and returns to the
        /// mode selector so a new design (or a new student) can start clean.
        /// Confirmed first so an accidental tap does not throw away work.
        /// </summary>
        private void OnRestartClick(object sender, EventArgs e)
        {
            DialogResult r = MessageBox.Show(
                "Start over from the beginning?\r\n\r\n"
                + "Anything you already saved and exported stays safe on the Desktop.",
                "Start over",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (r != DialogResult.Yes) return;
            partPath = "";
            stepPath = "";
            dxfPath = "";
            fspFolder = "";
            dogtagExportDone = false;
            ShowModeSelect();
        }

        // ------------------------------------------------------------------
        // PHASE 0 - SETUP
        // ------------------------------------------------------------------

        private void BuildPhase0(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("IDEA FSP // PAWN BUILD", Green, TitleFont), 4);
            AddRow(t, MakeLabel("Design and build your own 3D chess pawn, "
                + "step by step. No CAD experience needed.", TextPrimary, BodyFont), 12);

            AddStepImage(t, 0, 14);

            AddRow(t, MakeLabel("First Name", TextSecondary, SmallFont), 4);
            txtFirstName = MakeTextBox(BodyFont);
            AddRow(t, txtFirstName, 4);
            lblNameError = MakeLabel("", ErrorRed, SmallFont);
            lblNameError.Visible = false;
            AddRow(t, lblNameError, 14);

            Button begin = MakePrimaryButton("LET'S GO", 48);
            begin.Click += OnBeginClick;
            AddRow(t, begin, 0);
        }

        private void OnBeginClick(object sender, EventArgs e)
        {
            try
            {
                string name = txtFirstName.Text == null ? "" : txtFirstName.Text.Trim();
                if (name.Length == 0)
                {
                    ShowNameError("Type your first name first.");
                    return;
                }
                string safe = SanitizeForFileName(name);
                if (safe.Length == 0)
                {
                    ShowNameError("That name cannot go in a file name. Try letters only.");
                    return;
                }
                lblNameError.Visible = false;

                // Output folder on the Desktop. No classroom template is needed
                // anymore: the wizard BUILDS the starting part itself, so it also
                // creates the IDEA_FSP folder if it is missing (removing the
                // "folder not found" / "template missing" failures entirely).
                string folder = FindOrCreateFspFolder();

                // First free [name]_pawnN.sldprt in that folder (the file does not
                // exist yet; it is written by the SaveAs below).
                string outPath = null;
                for (int i = 1; i < 1000; i++)
                {
                    string candidate = Path.Combine(folder,
                        safe + "_pawn" + i.ToString(CultureInfo.InvariantCulture) + ".sldprt");
                    if (!File.Exists(candidate)) { outPath = candidate; break; }
                }
                if (outPath == null)
                {
                    ShowError("Could not find a free file name in " + folder + ". Raise your hand.");
                    return;
                }

                // Create a fresh IPS part carrying the Pawn_Profile sketch (with
                // its Y-axis construction centerline) the rest of the wizard drives.
                string buildError;
                IModelDoc2 doc = CreatePawnPart(out buildError);
                if (doc == null)
                {
                    ShowError(buildError + " Raise your hand.");
                    return;
                }

                // Save it to the target name so Phase 4's in-place save is silent
                // and the student sees a titled document from the start.
                int errs = 0;
                int warns = 0;
                bool saved = doc.Extension.SaveAs(outPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errs, ref warns);
                if (!saved)
                {
                    ShowError("Could not save your new pawn file. Error: "
                        + errs.ToString(CultureInfo.InvariantCulture) + ". Raise your hand.");
                    return;
                }

                studentName = name;
                fspFolder = folder;
                partPath = outPath;
                stepPath = Path.ChangeExtension(outPath, ".stp");
                ShowPhase(1);
            }
            catch (Exception ex)
            {
                ShowError(ex.Message + " Raise your hand.");
            }
        }

        private void ShowNameError(string text)
        {
            lblNameError.Text = text;
            lblNameError.Visible = true;
        }

        /// <summary>
        /// The IDEA_FSP output folder on the Desktop, created if it does not
        /// exist. Prefers an already-present folder (in case a teacher made one)
        /// at either the profile Desktop or the real, possibly OneDrive-redirected
        /// Desktop; otherwise creates it, CREATING THE DESKTOP FOLDER ITSELF if
        /// the profile somehow has none, and falling back through the profile
        /// Desktop and the user profile so the wizard never dead-ends.
        /// </summary>
        private string FindOrCreateFspFolder()
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string profileDesktop = string.IsNullOrEmpty(userProfile)
                ? "" : Path.Combine(userProfile, "Desktop");
            string realDesktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            // Reuse an FSP folder that already exists at either Desktop.
            if (!string.IsNullOrEmpty(profileDesktop))
            {
                string atProfile = Path.Combine(profileDesktop, cfgFolderName);
                if (Directory.Exists(atProfile)) return atProfile;
            }
            if (!string.IsNullOrEmpty(realDesktop))
            {
                string atReal = Path.Combine(realDesktop, cfgFolderName);
                if (Directory.Exists(atReal)) return atReal;
            }

            // None yet: choose a Desktop to build under, creating the Desktop
            // folder itself if it is missing.
            string baseDesktop = FirstUsableDir(realDesktop, profileDesktop, userProfile);
            string target = Path.Combine(baseDesktop, cfgFolderName);
            Directory.CreateDirectory(target); // creates any missing parent (Desktop) too
            return target;
        }

        /// <summary>
        /// Returns the first candidate directory that exists or can be created
        /// (creating it if needed), so the caller always gets a writable folder.
        /// </summary>
        private static string FirstUsableDir(params string[] candidates)
        {
            foreach (string c in candidates)
            {
                if (string.IsNullOrEmpty(c)) continue;
                try
                {
                    if (!Directory.Exists(c)) Directory.CreateDirectory(c);
                    return c;
                }
                catch { }
            }
            return Path.GetTempPath(); // always exists
        }

        /// <summary>
        /// Builds the starting part from scratch: a new part set to IPS units, a
        /// sketch on the front plane holding a single vertical Y-axis construction
        /// centerline (the revolve axis, the "vertical orange line" the student
        /// sees), with the sketch feature renamed to Pawn_Profile. Returns the
        /// open document, or null with a student-facing reason in <paramref
        /// name="error"/>. Everything downstream keys off the sketch NAME and the
        /// construction line, exactly as it did with the copied template.
        /// </summary>
        private IModelDoc2 CreatePawnPart(out string error)
        {
            error = "";
            IModelDoc2 model = NewPartDocument();
            if (model == null)
            {
                error = "Could not create a new SOLIDWORKS part.";
                return null;
            }

            try
            {
                // IPS units (inch / lb). Setting the canned IPS SYSTEM alone
                // cascades the linear unit to inches and leaves the system
                // reading as IPS; setting swUnitsLinear separately would instead
                // flip the system to "Custom" (verified against live SOLIDWORKS),
                // so it is deliberately not touched here.
                model.SetUserPreferenceIntegerValue(
                    (int)swUserPreferenceIntegerValue_e.swUnitSystem, (int)swUnitSystem_e.swUnitSystem_IPS);
            }
            catch { /* unit set is best-effort; the sketch still builds */ }

            try
            {
                IFeature plane = FirstPlane(model); // the front plane (first default plane)
                if (plane == null)
                {
                    error = "Could not find the front plane to start the sketch on.";
                    return null;
                }
                plane.Select2(false, 0);

                ISketchManager sm = model.SketchManager;
                sm.InsertSketch(true);                       // enter sketch mode on the plane

                // Vertical revolve axis (construction) up the Y axis from the
                // origin. This is the pawn's full height and the "vertical orange
                // line" the student draws beside. ~2 in so the finished pawn is
                // the size of a real chess pawn. CreateCenterLine yields
                // construction geometry by definition.
                ISketchSegment axis = sm.CreateCenterLine(
                    0.0, 0.0, 0.0, 0.0, PawnHeightMeters, 0.0) as ISketchSegment;

                // Horizontal base guide (construction) from the origin to the
                // right, so the student rests the bottom of the profile on it and
                // the finished pawn sits flat on a level base.
                sm.CreateCenterLine(0.0, 0.0, 0.0, BaseGuideMeters, 0.0, 0.0);

                // Dimension the axis so its 2 in height reads on the drawing.
                // Suppress the on-create Modify dialog so nothing blocks the pane,
                // then restore the student's setting.
                bool restoreInputDim = false;
                bool prevInputDim = false;
                try
                {
                    prevInputDim = swApp.GetUserPreferenceToggle(
                        (int)swUserPreferenceToggle_e.swInputDimValOnCreate);
                    swApp.SetUserPreferenceToggle(
                        (int)swUserPreferenceToggle_e.swInputDimValOnCreate, false);
                    restoreInputDim = true;
                }
                catch { }
                try
                {
                    if (axis != null)
                    {
                        model.ClearSelection2(true);
                        axis.Select4(false, null);
                        model.AddDimension2(-0.012, PawnHeightMeters / 2.0, 0.0);
                        model.ClearSelection2(true);
                    }
                }
                catch { /* the dimension is a nicety; never fail the build over it */ }
                finally
                {
                    if (restoreInputDim)
                    {
                        try
                        {
                            swApp.SetUserPreferenceToggle(
                                (int)swUserPreferenceToggle_e.swInputDimValOnCreate, prevInputDim);
                        }
                        catch { }
                    }
                }

                sm.InsertSketch(true);                        // exit sketch mode, rebuild
                model.ClearSelection2(true);

                // Rename the just-created sketch feature to the name every later
                // phase looks up.
                IFeature sketchFeat = model.FeatureByPositionReverse(0) as IFeature;
                if (sketchFeat != null)
                {
                    try { sketchFeat.Name = cfgSketchName; } catch { }
                }
            }
            catch (Exception ex)
            {
                error = "Could not build the pawn sketch. Error: " + ex.Message + ".";
                return null;
            }

            return model;
        }

        /// <summary>
        /// Creates a new blank part. Uses the configured default part template
        /// when one is set, falls back to any part template SOLIDWORKS can find,
        /// and finally to the built-in NewPart so a machine with no default
        /// template still works.
        /// </summary>
        private IModelDoc2 NewPartDocument()
        {
            try
            {
                string tpl = swApp.GetUserPreferenceStringValue(
                    (int)swUserPreferenceStringValue_e.swDefaultTemplatePart);
                if (!string.IsNullOrEmpty(tpl) && File.Exists(tpl))
                {
                    IModelDoc2 m = swApp.NewDocument(tpl, 0, 0.0, 0.0) as IModelDoc2;
                    if (m != null) return m;
                }
            }
            catch { }

            try
            {
                string tpl = swApp.GetDocumentTemplate(
                    (int)swDocTemplateTypes_e.swDocTemplateTypePART, "", 0, 0.0, 0.0);
                if (!string.IsNullOrEmpty(tpl) && File.Exists(tpl))
                {
                    IModelDoc2 m = swApp.NewDocument(tpl, 0, 0.0, 0.0) as IModelDoc2;
                    if (m != null) return m;
                }
            }
            catch { }

            try { return swApp.NewPart() as IModelDoc2; }
            catch { return null; }
        }

        /// <summary>The first reference-plane feature (the front plane), found by
        /// type so it works regardless of the UI language.</summary>
        private static IFeature FirstPlane(IModelDoc2 model)
        {
            try
            {
                IFeature f = model.FirstFeature() as IFeature;
                while (f != null)
                {
                    string tn = "";
                    try { tn = f.GetTypeName2(); } catch { }
                    if (string.Equals(tn, "RefPlane", StringComparison.OrdinalIgnoreCase)) return f;
                    f = f.GetNextFeature() as IFeature;
                }
            }
            catch { }
            return null;
        }

        // ------------------------------------------------------------------
        // PHASE 1 - OPEN SKETCH
        // ------------------------------------------------------------------

        private void BuildPhase1(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("STEP 1: OPEN YOUR SKETCH", Green, TitleFont), 6);
            AddRow(t, MakeLabel(studentName + ", your file is ready.", Green, BodyBoldFont), 12);

            AddStepImage(t, 1, 12);

            AddRow(t, MakeLabel("A sketch is your flat drawing pad. Your file already has two "
                + "amber DOTTED guide lines waiting for you:", TextPrimary, BodyFont), 8);
            AddRow(t, MakeLabel("  •  a tall SPIN line (up-and-down)", Amber, BodyBoldFont), 2);
            AddRow(t, MakeLabel("  •  a short FLOOR line (side-to-side)", Amber, BodyBoldFont), 12);
            AddRow(t, MakeLabel("Tap the button to open the pad and start drawing.", TextPrimary, BodyFont), 16);

            Button open = MakePrimaryButton("OPEN MY SKETCH", 48);
            open.Click += OnOpenSketchClick;
            AddRow(t, open, 0);
        }

        private void OnOpenSketchClick(object sender, EventArgs e)
        {
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null)
                {
                    ShowError("Your pawn file is not open in SOLIDWORKS. Raise your hand.");
                    return;
                }
                IFeature feat = FindFeature(model, cfgSketchName);
                if (feat == null)
                {
                    ShowError(cfgSketchName + " sketch not found. Raise your hand.");
                    return;
                }
                feat.Select2(false, 0);
                model.EditSketch();
                if (model.GetActiveSketch2() == null)
                {
                    ShowError("Could not open sketch. Error: sketch did not enter edit mode. Raise your hand.");
                    return;
                }
                ShowPhase(2);
            }
            catch (Exception ex)
            {
                ShowError("Could not open sketch. Error: " + ex.Message + ". Raise your hand.");
            }
        }

        // ------------------------------------------------------------------
        // PHASE 2 - DRAW YOUR PAWN
        // ------------------------------------------------------------------

        private void BuildPhase2(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("STEP 2: DRAW YOUR SHAPE", Green, TitleFont), 6);

            AddStepImage(t, 2, 10);

            // The big idea, up front and encouraging.
            AddRow(t, MakeLabel("Design it however you want! It does NOT have to look "
                + "like a pawn. Make any cool shape you can dream up.", Green, BodyBoldFont), 12);

            // Color-coded, one rule per line, in the order they do them.
            AddRow(t, MakeLabel("How to draw it:", TextPrimary, BodyBoldFont), 4);
            AddRow(t, MakeLabel("1.  Pick a tool below (Line, Arc, or Spline).", TextPrimary, BodyFont), 2);
            AddRow(t, MakeLabel("2.  Left-click in the drawing to place points.", TextPrimary, BodyFont), 2);
            AddRow(t, MakeLabel("3.  Stay to the RIGHT of the tall dotted spin line.", Amber, BodyBoldFont), 2);
            AddRow(t, MakeLabel("4.  Start on the dotted FLOOR line so it sits flat.", Amber, BodyBoldFont), 2);
            AddRow(t, MakeLabel("5.  Connect your last point back to your FIRST point.", Green, BodyBoldFont), 2);
            AddRow(t, MakeLabel("Do NOT draw on top of the dotted spin line. Ctrl+Z undoes a mistake.",
                ErrorRed, SmallFont), 12);

            // One-tap sketch tools (they still click in the drawing to place points).
            AddRow(t, MakeLabel("Drawing tools:", TextSecondary, SmallFont), 4);
            TableLayoutPanel tools = new TableLayoutPanel();
            tools.ColumnCount = 3;
            for (int i = 0; i < 3; i++) tools.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
            tools.RowCount = 1;
            tools.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            tools.Dock = DockStyle.Fill;
            tools.AutoSize = true;
            tools.Margin = new Padding(0);
            tools.BackColor = Bg;
            tools.Controls.Add(MakeToolButton("LINE",
                (int)swCommands_e.swCommands_Line), 0, 0);
            tools.Controls.Add(MakeToolButton("ARC",
                (int)swCommands_e.swCommands_3PointArc), 1, 0);
            tools.Controls.Add(MakeToolButton("SPLINE",
                (int)swCommands_e.swCommands_Spline), 2, 0);
            AddRow(t, tools, 14);

            // Live status: circle + label.
            TableLayoutPanel statusRow = NewInnerRow();
            statusCircle = new Panel();
            statusCircle.Size = new Size(40, 40);
            statusCircle.Margin = new Padding(0);
            statusCircle.BackColor = Bg;
            statusCircle.Paint += OnStatusCirclePaint;
            statusRow.Controls.Add(statusCircle, 0, 0);
            lblSketchStatus = MakeLabel("Waiting for sketch...", TextSecondary, BodyBoldFont);
            lblSketchStatus.Margin = new Padding(8, 9, 0, 0);
            statusRow.Controls.Add(lblSketchStatus, 1, 0);
            AddRow(t, statusRow, 12);

            // Required confirmation: they must trace the floor line for a flat base.
            chkTrace = new CheckBox();
            chkTrace.Text = "I traced the bottom of my shape along the dotted FLOOR line "
                + "so my pawn sits flat.";
            chkTrace.ForeColor = TextPrimary;
            chkTrace.BackColor = Color.Transparent;
            chkTrace.Font = SmallFont;
            chkTrace.AutoSize = false;
            chkTrace.Dock = DockStyle.Fill;
            chkTrace.Height = 44;
            chkTrace.Margin = new Padding(0);
            chkTrace.Checked = false;
            traceConfirmed = false;
            chkTrace.CheckedChanged += OnTraceConfirmChanged;
            AddRow(t, chkTrace, 12);

            // STUCK? collapsible help.
            Button stuck = MakeSecondaryButton("STUCK?", 34);
            stuck.Click += OnStuckToggleClick;
            AddRow(t, stuck, 4);
            stuckPanel = new Panel();
            stuckPanel.BackColor = BgPanel;
            stuckPanel.Padding = new Padding(10);
            stuckPanel.AutoSize = true;
            stuckPanel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            stuckPanel.Dock = DockStyle.Fill;
            stuckPanel.Margin = new Padding(0);
            stuckPanel.Visible = false;
            Label help = MakeLabel(StuckHelp, TextPrimary, SmallFont);
            help.Dock = DockStyle.Top;
            stuckPanel.Controls.Add(help);
            AddRow(t, stuckPanel, 10);

            // ADVANCED (optional): fine-edit tools with full explanations.
            Button adv = MakeSecondaryButton("ADVANCED TOOLS (optional)", 34);
            adv.Click += OnAdvancedToggleClick;
            AddRow(t, adv, 4);
            advPanel = BuildAdvancedDrawer();
            AddRow(t, advPanel, 14);

            btnRevolve = MakePrimaryButton("SPIN MY SHAPE INTO 3D", 48);
            revolveArmed = false;
            StyleGatedButton(btnRevolve, false);
            btnRevolve.Click += OnRevolveClick;
            AddRow(t, btnRevolve, 0);

            // Re-evaluate the gate now that the checkbox exists.
            RefreshRevolveGate();
        }

        private void OnTraceConfirmChanged(object sender, EventArgs e)
        {
            traceConfirmed = chkTrace != null && chkTrace.Checked;
            RefreshRevolveGate();
        }

        /// <summary>
        /// The SPIN button arms only when the profile is a clean closed loop AND
        /// the student has confirmed they traced the floor line.
        /// </summary>
        private void RefreshRevolveGate()
        {
            bool ready = (sketchState == 2) && traceConfirmed;
            if (ready == revolveArmed) return;
            revolveArmed = ready;
            if (btnRevolve != null) StyleGatedButton(btnRevolve, ready);
        }

        private void OnStuckToggleClick(object sender, EventArgs e)
        {
            if (stuckPanel != null) stuckPanel.Visible = !stuckPanel.Visible;
        }

        private void OnAdvancedToggleClick(object sender, EventArgs e)
        {
            if (advPanel != null) advPanel.Visible = !advPanel.Visible;
        }

        /// <summary>
        /// The collapsible ADVANCED drawer: the two fine-edit tools (Add Relation
        /// and Trim) with everything a student needs to use them, so no outside
        /// help is required. Hidden until opened.
        /// </summary>
        private Panel BuildAdvancedDrawer()
        {
            Panel panel = new Panel();
            panel.BackColor = BgPanel;
            panel.Padding = new Padding(10);
            panel.AutoSize = true;
            panel.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            panel.Dock = DockStyle.Fill;
            panel.Margin = new Padding(0);
            panel.Visible = false;

            TableLayoutPanel a = new TableLayoutPanel();
            a.ColumnCount = 1;
            a.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            a.Dock = DockStyle.Top;
            a.AutoSize = true;
            a.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            a.BackColor = BgPanel;
            a.Margin = new Padding(0);

            AddRow(a, MakeLabel("These are optional power tools for cleaning up your "
                + "shape. You do not need them, but they help you make neat, exact edits.",
                TextSecondary, SmallFont), 12);

            // --- Add Relation ---
            AddRow(a, MakeLabel("ADD RELATION", Green, BodyBoldFont), 2);
            AddRow(a, MakeLabel("Lock two lines together so your shape stays neat: make "
                + "them the same length, parallel, equal, horizontal, or vertical.",
                TextPrimary, SmallFont), 4);
            AddRow(a, MakeLabel("How: tap ADD RELATION, click one line, click a second "
                + "line, then pick a relation (like Equal or Parallel) from the panel "
                + "on the left. Press Esc when done.", TextPrimary, SmallFont), 6);
            Button rel = MakeToolButton("ADD RELATION", (int)swCommands_e.swCommands_AddRelation);
            rel.Margin = new Padding(0);
            AddRow(a, rel, 12);

            // --- Trim ---
            AddRow(a, MakeLabel("TRIM", Green, BodyBoldFont), 2);
            AddRow(a, MakeLabel("Erase the leftover bits where two lines cross, so only "
                + "the outline you want is left.", TextPrimary, SmallFont), 4);
            AddRow(a, MakeLabel("How: tap TRIM, then click any line piece you want to "
                + "erase. Keep clicking to erase more. Press Esc when done.",
                TextPrimary, SmallFont), 6);
            Button trim = MakeToolButton("TRIM", (int)swCommands_e.swCommands_TrimEntities);
            trim.Margin = new Padding(0);
            AddRow(a, trim, 0);

            panel.Controls.Add(a);
            return panel;
        }

        private void OnSketchPollTick(object sender, EventArgs e)
        {
            // Dogtag Phase 2 EDIT: wait for the student to leave the sketch, then
            // refresh the review page.
            if (dogtagEditing)
            {
                try
                {
                    IModelDoc2 model = ActiveModel();
                    if (model != null && model.GetActiveSketch2() == null)
                    {
                        dogtagEditing = false;
                        sketchTimer.Stop();
                        if (mode == 2 && phase == 2) ShowPhase(2);
                    }
                }
                catch { }
                return;
            }
            // The drawing page is pawn Phase 2 and dogtag Phase 1.
            if ((mode == 1 && phase == 2) || (mode == 2 && phase == 1)) PollSketchOnce();
        }

        private void PollSketchOnce()
        {
            int next;
            try
            {
                IModelDoc2 model = ActiveModel();
                object sk = model == null ? null : model.GetActiveSketch2();
                if (sk == null)
                {
                    next = 0;
                }
                else
                {
                    ISketch sketch = (ISketch)sk;
                    int segCount;
                    bool closed, crossesAxis;
                    bool hasProfile = AnalyzeSketch(sketch, out segCount, out closed, out crossesAxis);
                    if (!hasProfile) next = 0;          // only construction geometry
                    else if (mode == 1 && crossesAxis) next = 3;  // pawn: straddles the spin axis
                    else if (closed) next = 2;          // a clean closed loop
                    else next = 1;                      // still open
                    // The dogtag outline is centered on the origin, so it legitimately
                    // spans both sides of x=0; the axis-cross state (3) is pawn-only.
                }
            }
            catch
            {
                // Mid-command reads can fail; keep the last state this cycle.
                return;
            }
            ApplySketchState(next);
        }

        /// <summary>
        /// Inspects the active sketch's NON-construction geometry (the student's
        /// profile; the axis and base guide are construction and are ignored).
        /// Reports whether any profile exists, whether every endpoint meets
        /// another one (a closed loop, the real fix for the old detector that
        /// called any single stray line "closed"), and whether the profile
        /// straddles the revolve axis at x = 0 (which makes the revolve fail).
        /// </summary>
        private bool AnalyzeSketch(ISketch sketch, out int segCount, out bool closed, out bool crossesAxis)
        {
            segCount = 0;
            closed = false;
            crossesAxis = false;

            object[] segs = sketch.GetSketchSegments() as object[];
            if (segs == null) return false;

            List<double[]> ends = new List<double[]>();
            double minX = double.MaxValue;
            double maxX = double.MinValue;
            bool anyUnknown = false;

            foreach (object o in segs)
            {
                ISketchSegment seg = o as ISketchSegment;
                if (seg == null) continue;
                bool construction = false;
                try { construction = seg.ConstructionGeometry; } catch { }
                if (construction) continue;              // skip the axis and base guide

                double[] a, b;
                if (!TryGetSegmentEnds(seg, out a, out b))
                {
                    anyUnknown = true;                   // present but endpoints unknown
                    segCount++;
                    continue;
                }
                segCount++;
                ends.Add(a);
                ends.Add(b);
                minX = Math.Min(minX, Math.Min(a[0], b[0]));
                maxX = Math.Max(maxX, Math.Max(a[0], b[0]));
            }

            if (segCount == 0) return false;             // nothing drawn yet

            crossesAxis = (minX < -CloseTolMeters && maxX > CloseTolMeters);

            // Closed when no endpoint is left dangling: every endpoint instance
            // must coincide with at least one other endpoint. A single open line
            // leaves two dangling ends; a finished loop leaves none.
            if (anyUnknown || ends.Count == 0)
            {
                closed = false;                          // cannot confirm; stay conservative
            }
            else
            {
                closed = true;
                for (int i = 0; i < ends.Count && closed; i++)
                {
                    bool met = false;
                    for (int j = 0; j < ends.Count; j++)
                    {
                        if (i == j) continue;
                        if (Near(ends[i], ends[j])) { met = true; break; }
                    }
                    if (!met) closed = false;
                }
            }
            return true;
        }

        private static bool Near(double[] p, double[] q)
        {
            return Math.Abs(p[0] - q[0]) < CloseTolMeters
                && Math.Abs(p[1] - q[1]) < CloseTolMeters;
        }

        /// <summary>
        /// The 2D endpoints of a sketch segment, handling the segment types a
        /// freshman actually draws (line, arc, ellipse via their start/end
        /// points; spline via its first and last through-points). Returns false
        /// for any type whose endpoints cannot be read, so the caller stays
        /// conservative rather than false-reporting a closed loop.
        /// </summary>
        private static bool TryGetSegmentEnds(ISketchSegment seg, out double[] a, out double[] b)
        {
            a = null;
            b = null;
            try
            {
                int type = seg.GetType();
                if (type == (int)swSketchSegments_e.swSketchLINE)
                {
                    ISketchLine ln = seg as ISketchLine;
                    if (ln == null) return false;
                    return PointXY(ln.GetStartPoint2(), out a) && PointXY(ln.GetEndPoint2(), out b);
                }
                if (type == (int)swSketchSegments_e.swSketchARC)
                {
                    ISketchArc ar = seg as ISketchArc;
                    if (ar == null) return false;
                    return PointXY(ar.GetStartPoint2(), out a) && PointXY(ar.GetEndPoint2(), out b);
                }
                if (type == (int)swSketchSegments_e.swSketchELLIPSE)
                {
                    ISketchEllipse el = seg as ISketchEllipse;
                    if (el == null) return false;
                    return PointXY(el.GetStartPoint2(), out a) && PointXY(el.GetEndPoint2(), out b);
                }
                if (type == (int)swSketchSegments_e.swSketchSPLINE)
                {
                    ISketchSpline sp = seg as ISketchSpline;
                    if (sp == null) return false;
                    double[] pts = sp.GetPoints() as double[];
                    if (pts == null || pts.Length < 6) return false;
                    a = new double[] { pts[0], pts[1] };
                    b = new double[] { pts[pts.Length - 3], pts[pts.Length - 2] };
                    return true;
                }
            }
            catch { }
            return false;
        }

        private static bool PointXY(object skPoint, out double[] xy)
        {
            xy = null;
            ISketchPoint p = skPoint as ISketchPoint;
            if (p == null) return false;
            xy = new double[] { p.X, p.Y };
            return true;
        }

        private void ApplySketchState(int next)
        {
            if (next == sketchState) return;
            sketchState = next;
            bool dog = mode == 2;
            if (next == 2)
            {
                if (dog)
                    lblSketchStatus.Text = traceConfirmed
                        ? "Closed shape detected! Ready when you are."
                        : "Closed shape detected! Now tick the box below.";
                else
                    lblSketchStatus.Text = traceConfirmed
                        ? "Closed shape - ready to spin!"
                        : "Closed shape! Now tick the box below.";
                lblSketchStatus.ForeColor = Green;
                StartPulse(6);  // 3 brightness pulses, then hold
            }
            else if (next == 3)
            {
                lblSketchStatus.Text = "Move your drawing to the RIGHT of the tall dotted line.";
                lblSketchStatus.ForeColor = Amber;
                StopPulse();
            }
            else if (next == 1)
            {
                lblSketchStatus.Text = dog
                    ? "Keep drawing - shape is not closed yet."
                    : "Keep going - connect your last point back to your first point.";
                lblSketchStatus.ForeColor = ErrorRed;
                StopPulse();
            }
            else
            {
                lblSketchStatus.Text = "Waiting for sketch...";
                lblSketchStatus.ForeColor = TextSecondary;
                StopPulse();
            }
            // Arming depends on BOTH the closed loop and the confirmation checkbox.
            RefreshRevolveGate();
            if (statusCircle != null) statusCircle.Invalidate();
        }

        private void OnStatusCirclePaint(object sender, PaintEventArgs e)
        {
            Color c = sketchState == 2 ? Green
                : sketchState == 3 ? Amber
                : sketchState == 1 ? ErrorRed
                : TextSecondary;
            if (!pulseOn) c = Dimmed(c);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (SolidBrush b = new SolidBrush(c))
            {
                e.Graphics.FillEllipse(b, 4, 4, 32, 32);
            }
        }

        private void OnRevolveClick(object sender, EventArgs e)
        {
            if (!revolveArmed) return;
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model != null && model.GetActiveSketch2() != null)
                {
                    // Exit sketch edit mode, keeping the geometry.
                    model.InsertSketch2(true);
                }
                ShowPhase(3);
            }
            catch (Exception ex)
            {
                ShowError("Could not leave the sketch. Error: " + ex.Message + ". Raise your hand.");
            }
        }

        // ------------------------------------------------------------------
        // PHASE 3 - REVOLVE
        // ------------------------------------------------------------------

        private void BuildPhase3(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("STEP 3: SPIN IT INTO 3D", Green, TitleFont), 6);

            AddStepImage(t, 3, 10);

            AddRow(t, MakeLabel("This is the magic step. It spins your flat drawing all "
                + "the way around the dotted spin line to make a solid 3D shape.",
                TextPrimary, BodyFont), 14);

            // The easy one-click path.
            Button spin = MakePrimaryButton("SPIN IT FOR ME", 48);
            spin.Click += OnSpinItForMeClick;
            AddRow(t, spin, 12);

            // The learn-it-yourself path.
            AddRow(t, MakeLabel("Or do it the real CAD way:", TextSecondary, SmallFont), 4);
            Button openTool = MakeSecondaryButton("OPEN THE REVOLVE TOOL", 40);
            openTool.Click += OnOpenRevolveToolClick;
            AddRow(t, openTool, 8);

            lblRevolveHint = MakeLabel(
                "After you open the tool, click the GREEN CHECKMARK in the panel on the "
                + "left side of the screen to finish.", Green, SmallFont);
            AddRow(t, lblRevolveHint, 12);

            TableLayoutPanel waitRow = NewInnerRow();
            waitCircle = new Panel();
            waitCircle.Size = new Size(40, 40);
            waitCircle.Margin = new Padding(0);
            waitCircle.BackColor = Bg;
            waitCircle.Paint += OnWaitCirclePaint;
            waitRow.Controls.Add(waitCircle, 0, 0);
            Label waiting = MakeLabel("Waiting... this jumps ahead automatically when your pawn is 3D.",
                TextSecondary, SmallFont);
            waiting.Margin = new Padding(8, 9, 0, 0);
            waitRow.Controls.Add(waiting, 1, 0);
            AddRow(t, waitRow, 0);
        }

        private void OnWaitCirclePaint(object sender, PaintEventArgs e)
        {
            Color c = pulseOn ? Green : Dimmed(Green);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (SolidBrush b = new SolidBrush(c))
            {
                e.Graphics.FillEllipse(b, 4, 4, 32, 32);
            }
        }

        /// <summary>
        /// The one-click path: builds the 360-degree revolve directly through the
        /// API (no PropertyManager, no green checkmark needed) from the profile
        /// sketch and its vertical spin axis. Falls back to a friendly message
        /// pointing at the manual tool if anything is not ready.
        /// </summary>
        private void OnSpinItForMeClick(object sender, EventArgs e)
        {
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null)
                {
                    ShowError("Your pawn file is not open in SOLIDWORKS. Raise your hand.");
                    return;
                }
                // Leave the sketch first; a revolve reads a closed, exited sketch.
                if (model.GetActiveSketch2() != null) model.InsertSketch2(true);

                // Already 3D (e.g. the student backed into this page)? Don't
                // revolve twice; just move on.
                if (HasRevolveFeature(model)) { revolveTimer.Stop(); ShowPhase(4); return; }

                if (!SelectProfileAndAxis(model))
                {
                    ShowError("Could not find your drawing to spin. Use OPEN THE REVOLVE TOOL instead.");
                    return;
                }

                object feat = model.FeatureManager.FeatureRevolve2(
                    true,   // SingleDir
                    true,   // IsSolid
                    false,  // IsThin
                    false,  // IsCut
                    false,  // ReverseDir
                    false,  // BothDirectionUpToSameEntity
                    (int)swEndConditions_e.swEndCondBlind, // Dir1Type
                    0,      // Dir2Type
                    2.0 * Math.PI, 0.0,   // full 360-degree revolve
                    false, false, 0.0, 0.0,
                    0, 0.0, 0.0,          // not a thin feature
                    true,   // Merge
                    true,   // UseFeatScope
                    false); // UseAutoSelect (we selected the profile + axis ourselves)

                model.ClearSelection2(true);
                if (feat == null)
                {
                    ShowError("The spin did not work. Make sure your shape is fully closed, "
                        + "then try OPEN THE REVOLVE TOOL.");
                    return;
                }
                try { model.ShowNamedView2("*Isometric", -1); model.ViewZoomtofit2(); } catch { }
                revolveTimer.Stop();
                ShowPhase(4);
            }
            catch (Exception ex)
            {
                ShowError("The spin did not work. Error: " + ex.Message
                    + ". Try OPEN THE REVOLVE TOOL.");
            }
        }

        private void OnOpenRevolveToolClick(object sender, EventArgs e)
        {
            StartRevolveCommand();
        }

        /// <summary>
        /// The manual path: pre-selects the vertical spin axis, launches the
        /// Revolved Boss/Base command, and points the student at the green
        /// checkmark. The poll advances the wizard once the feature exists.
        /// </summary>
        private void StartRevolveCommand()
        {
            bool axisSelected = false;
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model != null)
                {
                    if (model.GetActiveSketch2() != null) model.InsertSketch2(true);
                    // Already 3D? Skip straight ahead instead of revolving twice.
                    if (HasRevolveFeature(model)) { revolveTimer.Stop(); ShowPhase(4); return; }
                    axisSelected = TryPreselectCenterline(model);
                    swApp.RunCommand((int)swCommands_e.swCommands_RevolvedBossBase, "");
                }
            }
            catch
            {
                axisSelected = false;
            }
            if (lblRevolveHint != null)
            {
                lblRevolveHint.Text = axisSelected
                    ? "Almost done! Click the GREEN CHECKMARK in the panel on the left to finish."
                    : "Click the tall dotted line in your sketch, then click the GREEN CHECKMARK on the left.";
                lblRevolveHint.ForeColor = Green;
            }
            StartContinuousPulse();
        }

        private ISketchSegment FindVerticalConstructionLine(ISketch sketch)
        {
            if (sketch == null) return null;
            try
            {
                object[] segs = sketch.GetSketchSegments() as object[];
                if (segs == null) return null;
                ISketchSegment anyConstruction = null;
                foreach (object o in segs)
                {
                    ISketchSegment seg = o as ISketchSegment;
                    if (seg == null) continue;
                    bool construction = false;
                    try { construction = seg.ConstructionGeometry; } catch { }
                    if (!construction) continue;
                    if (anyConstruction == null) anyConstruction = seg;
                    // The spin axis is the VERTICAL construction line, never the
                    // horizontal floor guide.
                    if (seg.GetType() == (int)swSketchSegments_e.swSketchLINE)
                    {
                        double[] a, b;
                        if (TryGetSegmentEnds(seg, out a, out b))
                        {
                            double dx = Math.Abs(a[0] - b[0]);
                            double dy = Math.Abs(a[1] - b[1]);
                            if (dy > dx) return seg;
                        }
                    }
                }
                return anyConstruction;
            }
            catch { return null; }
        }

        private bool TryPreselectCenterline(IModelDoc2 model)
        {
            try
            {
                IFeature feat = FindFeature(model, cfgSketchName);
                if (feat == null) return false;
                ISketch sketch = feat.GetSpecificFeature2() as ISketch;
                ISketchSegment axis = FindVerticalConstructionLine(sketch);
                if (axis == null) return false;
                model.ClearSelection2(true);
                return axis.Select4(false, null);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Selects the profile sketch (mark 0) and its vertical spin axis
        /// (mark 4) for a programmatic FeatureRevolve2.
        /// </summary>
        private bool SelectProfileAndAxis(IModelDoc2 model)
        {
            try
            {
                IFeature feat = FindFeature(model, cfgSketchName);
                if (feat == null) return false;
                model.ClearSelection2(true);
                bool okSketch = feat.Select2(false, 0);

                ISketch sketch = feat.GetSpecificFeature2() as ISketch;
                ISketchSegment axis = FindVerticalConstructionLine(sketch);
                ISelectionMgr selmgr = model.SelectionManager as ISelectionMgr;
                if (axis != null && selmgr != null)
                {
                    SelectData sd = selmgr.CreateSelectData();
                    sd.Mark = 4;
                    axis.Select4(true, sd);
                }
                return okSketch;
            }
            catch
            {
                return false;
            }
        }

        private void OnRevolvePollTick(object sender, EventArgs e)
        {
            if (phase != 3) return;
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null) return;
                int count = model.GetFeatureCount();
                if (count <= baselineFeatureCount) return;
                IFeature newest = model.FeatureByPositionReverse(0) as IFeature;
                if (newest == null) return;
                string name = newest.Name;
                if (name == null) name = "";
                string typeName = "";
                try { typeName = newest.GetTypeName2(); } catch { }
                string lower = name.ToLowerInvariant();
                if (lower.IndexOf("revolve") >= 0 || lower.IndexOf("boss") >= 0
                    || string.Equals(typeName, "Revolution", StringComparison.OrdinalIgnoreCase))
                {
                    revolveTimer.Stop();
                    ShowPhase(4);
                }
            }
            catch
            {
                // Mid-command reads can fail; try again next tick.
            }
        }

        // ------------------------------------------------------------------
        // PHASE 4 - SAVE AND SUBMIT
        // ------------------------------------------------------------------

        private void BuildPhase4(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("STEP 4: SAVE + SEND", Green, TitleFont), 6);
            AddRow(t, MakeLabel("Nice work, " + studentName + "! Your 3D pawn is done.",
                Green, BodyBoldFont), 10);

            AddStepImage(t, 4, 12);

            AddRow(t, MakeLabel("Last step: tap the button to save your pawn and open "
                + "an email to Mr. Pina.", TextPrimary, BodyFont), 16);

            Button save = MakePrimaryButton("SAVE + SEND TO MR. PINA", 48);
            save.Click += OnSaveExportClick;
            AddRow(t, save, 0);
        }

        private void OnSaveExportClick(object sender, EventArgs e)
        {
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null)
                {
                    ShowError("Your pawn file is not open in SOLIDWORKS. Raise your hand.");
                    return;
                }

                // 1. Save the .sldprt.
                int errs = 0;
                int warns = 0;
                bool saved = model.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref errs, ref warns);
                if (!saved)
                {
                    ShowError("Could not save your pawn file. Error: "
                        + errs.ToString(CultureInfo.InvariantCulture) + ". Raise your hand.");
                    return;
                }

                // 2 + 3. Export STEP AP214. The shipped interops expose no
                // IExportStepData (swExportDataFileType_e holds only the PDF
                // member), so AP214 is selected the documented way instead:
                // the swStepAP system preference (203 or 214) is what the STEP
                // translator reads at save time.
                try
                {
                    swApp.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swStepAP, 214);
                }
                catch { }

                errs = 0;
                warns = 0;
                bool exported;
                try
                {
                    exported = model.Extension.SaveAs(stepPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errs, ref warns);
                }
                catch
                {
                    exported = false;
                }
                if (!exported || !File.Exists(stepPath))
                {
                    ShowError("Export error " + errs.ToString(CultureInfo.InvariantCulture)
                        + ". Manually: File > Save As > STEP AP214.");
                    return;
                }

                // 4. Open Gmail compose in the default browser, then nudge that
                // window to the left so it does not cover the pane instructions.
                try
                {
                    Process.Start(GmailComposeUrl());
                    if (emailMoveTimer != null) { emailMoveTimer.Stop(); emailMoveTimer.Start(); }
                }
                catch
                {
                    ShowError("Could not open the browser. Open Gmail yourself and email the file to "
                        + cfgTeacherEmail + " with the subject \"" + cfgEmailSubject + "\".");
                    // The post-export panel below still shows the file path.
                }

                // 5. Post-export panel.
                BuildPostExportPanel();
            }
            catch (Exception ex)
            {
                ShowError(ex.Message + " Raise your hand.");
            }
        }

        private void BuildPostExportPanel()
        {
            wrapLabels.Clear();
            DisposeStepImage();
            contentHost.SuspendLayout();
            while (contentHost.Controls.Count > 0)
            {
                Control old = contentHost.Controls[0];
                contentHost.Controls.RemoveAt(0);
                old.Dispose();
            }

            string stepName = "";
            try { stepName = Path.GetFileName(stepPath); } catch { stepName = stepPath; }

            TableLayoutPanel t = NewPhaseTable();
            AddRow(t, MakeLabel("PAWN COMPLETE!", Green, TitleFont), 8);
            AddRow(t, MakeLabel("Your pawn is saved and an email to Mr. Pina just opened.",
                TextPrimary, BodyFont), 12);

            AddRow(t, MakeLabel("Finish in 4 steps:", TextPrimary, BodyBoldFont), 6);
            AddRow(t, MakeLabel("1.  Tap OPEN FILE FOLDER below.", TextPrimary, BodyFont), 3);
            AddRow(t, MakeLabel("2.  Find this exact file (it ends in .stp):", TextPrimary, BodyFont), 4);

            // The exact .stp file name, highlighted, so they drag the right one.
            TextBox nameBox = MakeTextBox(PathFont);
            nameBox.ReadOnly = true;
            nameBox.Text = stepName;
            nameBox.ForeColor = Green;
            AddRow(t, nameBox, 4);
            AddRow(t, MakeLabel("Do NOT drag the blue .SLDPRT file. It must be the "
                + ".stp (STEP) file shown above.", Amber, SmallFont), 8);

            AddRow(t, MakeLabel("3.  Drag that .stp file into the email window.", TextPrimary, BodyFont), 3);
            AddRow(t, MakeLabel("4.  Click Send.", TextPrimary, BodyFont), 12);

            Button openFolder = MakePrimaryButton("OPEN FILE FOLDER", 44);
            openFolder.Click += OnOpenFolderClick;
            AddRow(t, openFolder, 8);

            // Full path for reference / raising a hand.
            TextBox pathBox = MakeTextBox(PathFont);
            pathBox.ReadOnly = true;
            pathBox.Text = stepPath;
            AddRow(t, pathBox, 14);

            Button another = MakeSecondaryButton("BUILD ANOTHER PAWN", 40);
            another.Click += OnBuildAnotherClick;
            AddRow(t, another, 16);

            AddRow(t, MakeLabel(studentName + "'s pawn is ready. See you tomorrow.", Green, BodyBoldFont), 0);

            contentHost.Controls.Add(t);
            contentHost.ResumeLayout();
            ApplyWrapWidths();
        }

        /// <summary>
        /// Starts a fresh pawn from the completion screen: clears the per-file
        /// state and returns to Phase 0, pre-filling the name for convenience.
        /// Phase 0's BEGIN builds a brand-new part, so the finished pawn stays
        /// open and untouched.
        /// </summary>
        private void OnBuildAnotherClick(object sender, EventArgs e)
        {
            partPath = "";
            stepPath = "";
            fspFolder = "";
            ShowPhase(0);
            if (txtFirstName != null) txtFirstName.Text = studentName;
        }

        private void OnOpenFolderClick(object sender, EventArgs e)
        {
            try
            {
                Process.Start("explorer.exe", "\"" + fspFolder + "\"");
            }
            catch (Exception ex)
            {
                ShowError("Could not open the folder. " + ex.Message);
            }
        }

        private string GmailComposeUrl()
        {
            return ComposeUrl(cfgTeacherEmail, cfgEmailSubject, cfgEmailBody);
        }

        private static string ComposeUrl(string to, string subject, string body)
        {
            return "https://mail.google.com/mail/?view=cm&to=" + Uri.EscapeDataString(to ?? "")
                + "&su=" + Uri.EscapeDataString(subject ?? "")
                + "&body=" + Uri.EscapeDataString(body ?? "");
        }

        // ------------------------------------------------------------------
        // Email window nudge (best-effort; never fails the flow)
        // ------------------------------------------------------------------

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll")]
        private static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private void OnEmailMoveTick(object sender, EventArgs e)
        {
            if (emailMoveTimer != null) emailMoveTimer.Stop();   // one-shot
            TryMoveEmailWindowLeft();
        }

        /// <summary>
        /// Moves the just-opened browser (email) window to the LEFT half of the
        /// screen so it stops covering the pane. Only touches a window that
        /// really belongs to a known browser, so it can never grab SOLIDWORKS or
        /// anything else; any failure is swallowed.
        /// </summary>
        private static void TryMoveEmailWindowLeft()
        {
            try
            {
                IntPtr h = GetForegroundWindow();
                if (h == IntPtr.Zero) return;
                uint pid;
                GetWindowThreadProcessId(h, out pid);
                string pname = "";
                try { pname = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); }
                catch { return; }

                string[] browsers = { "chrome", "msedge", "firefox", "brave", "opera",
                    "vivaldi", "iexplore", "arc", "chromium" };
                bool isBrowser = false;
                foreach (string b in browsers) { if (pname == b) { isBrowser = true; break; } }
                if (!isBrowser) return;

                Rectangle wa = Screen.PrimaryScreen.WorkingArea;
                ShowWindow(h, 9);   // SW_RESTORE (un-maximize so a move takes effect)
                MoveWindow(h, wa.Left, wa.Top, wa.Width / 2, wa.Height, true);
            }
            catch { /* window nudge is a nicety; never let it matter */ }
        }

        // ==================================================================
        // MODE SELECTOR
        // ==================================================================

        private void BuildModeSelect(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("IDEA FSP", Green, TitleFont), 4);
            AddRow(t, MakeLabel("Pick what you want to make today.", TextPrimary, BodyFont), 18);

            Button pawnBtn = MakePrimaryButton("PAWN BUILD", 52);
            pawnBtn.Click += OnPickPawnMode;
            AddRow(t, pawnBtn, 2);
            AddRow(t, MakeLabel("Design and 3D-model your own chess pawn.", TextSecondary, SmallFont), 18);

            Button dogBtn = MakePrimaryButton("DOGTAG DESIGNER", 52);
            dogBtn.Click += OnPickDogtagMode;
            AddRow(t, dogBtn, 2);
            AddRow(t, MakeLabel("Design a custom dogtag. Gets laser cut tonight.",
                TextSecondary, SmallFont), 0);
        }

        private void OnPickPawnMode(object sender, EventArgs e)
        {
            mode = 1;
            ShowPhase(0);
            if (txtFirstName != null) txtFirstName.Text = studentName;
        }

        private void OnPickDogtagMode(object sender, EventArgs e)
        {
            mode = 2;
            ShowPhase(0);
        }

        // ==================================================================
        // DOGTAG // PHASE 0 - SETUP
        // ==================================================================

        private void BuildDogtagPhase0(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("DOGTAG DESIGNER", Green, TitleFont), 4);
            AddRow(t, MakeLabel("Design your own custom dogtag. Gets laser cut tonight.",
                TextPrimary, BodyFont), 12);

            AddDogtagStepImage(t, 0, 14);

            AddRow(t, MakeLabel("First Name", TextSecondary, SmallFont), 4);
            txtDogName = MakeTextBox(BodyFont);
            txtDogName.Text = studentName;
            AddRow(t, txtDogName, 4);
            lblDogNameError = MakeLabel("", ErrorRed, SmallFont);
            lblDogNameError.Visible = false;
            AddRow(t, lblDogNameError, 14);

            // Shape picker: 2x2 grid of toggle buttons, one selected at a time.
            AddRow(t, MakeLabel("Pick your shape:", TextPrimary, BodyBoldFont), 6);
            TableLayoutPanel grid = new TableLayoutPanel();
            grid.ColumnCount = 2;
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            grid.RowCount = 2;
            grid.Dock = DockStyle.Fill;
            grid.AutoSize = true;
            grid.Margin = new Padding(0);
            grid.BackColor = Bg;
            shapeButtons = new Button[4];
            shapeButtons[0] = MakeShapeButton("MILITARY", ShapeMilitary);
            shapeButtons[1] = MakeShapeButton("ROUND", ShapeRound);
            shapeButtons[2] = MakeShapeButton("RECT", ShapeRect);
            shapeButtons[3] = MakeShapeButton("CUSTOM", ShapeCustom);
            grid.Controls.Add(shapeButtons[0], 0, 0);
            grid.Controls.Add(shapeButtons[1], 1, 0);
            grid.Controls.Add(shapeButtons[2], 0, 1);
            grid.Controls.Add(shapeButtons[3], 1, 1);
            AddRow(t, grid, 4);
            AddRow(t, MakeLabel("MILITARY is the classic tag. CUSTOM lets you draw your "
                + "own outline.", TextSecondary, SmallFont), 14);
            RefreshShapeButtons();

            // Optional image upload.
            AddRow(t, MakeLabel("Add a picture (optional)", TextPrimary, BodyBoldFont), 4);
            Button upload = MakeSecondaryButton("UPLOAD IMAGE", 38);
            upload.Click += OnUploadImageClick;
            AddRow(t, upload, 6);

            // Thumbnail + filename + CLEAR (shown only once an image is picked).
            TableLayoutPanel imgRow = new TableLayoutPanel();
            imgRow.ColumnCount = 2;
            imgRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88f));
            imgRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            imgRow.RowCount = 1;
            imgRow.Dock = DockStyle.Fill;
            imgRow.AutoSize = true;
            imgRow.Margin = new Padding(0);
            imgRow.BackColor = Bg;
            imgThumb = new PictureBox();
            imgThumb.Size = new Size(80, 80);
            imgThumb.SizeMode = PictureBoxSizeMode.Zoom;
            imgThumb.BackColor = BgPanel;
            imgThumb.BorderStyle = BorderStyle.FixedSingle;
            imgThumb.Margin = new Padding(0, 0, 8, 0);
            imgRow.Controls.Add(imgThumb, 0, 0);
            TableLayoutPanel imgRight = new TableLayoutPanel();
            imgRight.ColumnCount = 1;
            imgRight.Dock = DockStyle.Fill;
            imgRight.AutoSize = true;
            imgRight.Margin = new Padding(0);
            imgRight.BackColor = Bg;
            lblImgName = MakeLabel("", TextPrimary, SmallFont);
            imgRight.Controls.Add(lblImgName, 0, 0);
            Button clearImg = MakeSecondaryButton("CLEAR", 28);
            clearImg.Click += OnClearImageClick;
            imgRight.Controls.Add(clearImg, 0, 1);
            imgRow.Controls.Add(imgRight, 1, 0);
            AddRow(t, imgRow, 4);
            lblImgWarn = MakeLabel("", Amber, SmallFont);
            lblImgWarn.Visible = false;
            AddRow(t, lblImgWarn, 14);
            imgPreviewRow = imgRow;
            RefreshImagePreview();

            Button create = MakePrimaryButton("CREATE MY DOGTAG", 48);
            create.Click += OnCreateDogtagClick;
            AddRow(t, create, 0);
        }

        private Button MakeShapeButton(string text, int shape)
        {
            Button b = MakeSecondaryButton(text, 40);
            b.Tag = shape;
            b.Margin = new Padding(0, 0, (shape % 2 == 0 ? 6 : 0), 6);
            b.Click += OnShapePick;
            return b;
        }

        private void OnShapePick(object sender, EventArgs e)
        {
            Button b = sender as Button;
            if (b == null || !(b.Tag is int)) return;
            dogtagShape = (int)b.Tag;
            RefreshShapeButtons();
        }

        /// <summary>Highlights the selected shape button in the program green.</summary>
        private void RefreshShapeButtons()
        {
            if (shapeButtons == null) return;
            foreach (Button b in shapeButtons)
            {
                if (b == null || !(b.Tag is int)) continue;
                bool sel = (int)b.Tag == dogtagShape;
                b.BackColor = sel ? Green : BtnSecondaryBg;
                b.ForeColor = sel ? Color.Black : TextPrimary;
                b.FlatAppearance.MouseOverBackColor = sel
                    ? Color.FromArgb(0x00, 0xDD, 0x38) : Color.FromArgb(0x3F, 0x3F, 0x3F);
            }
        }

        private void OnUploadImageClick(object sender, EventArgs e)
        {
            try
            {
                using (OpenFileDialog dlg = new OpenFileDialog())
                {
                    dlg.Title = "Pick a picture for your dogtag";
                    dlg.Filter = "Images (PNG, JPG, BMP)|*.png;*.jpg;*.jpeg;*.bmp";
                    if (dlg.ShowDialog() != DialogResult.OK) return;
                    dogtagImagePath = dlg.FileName;
                    dogtagImageHasColor = SampleHasColor(dogtagImagePath);
                    RefreshImagePreview();
                }
            }
            catch (Exception ex)
            {
                ShowError("Could not open that picture. " + ex.Message);
            }
        }

        private void OnClearImageClick(object sender, EventArgs e)
        {
            dogtagImagePath = "";
            dogtagImageHasColor = false;
            RefreshImagePreview();
        }

        /// <summary>Shows or hides the thumbnail row and the color warning to
        /// match the current image selection.</summary>
        private void RefreshImagePreview()
        {
            DisposeDogtagThumb();
            bool has = !string.IsNullOrEmpty(dogtagImagePath) && File.Exists(dogtagImagePath);
            if (imgPreviewRow != null) imgPreviewRow.Visible = has;
            if (has)
            {
                if (lblImgName != null) lblImgName.Text = Path.GetFileName(dogtagImagePath);
                try
                {
                    imgThumbBmp = LoadUnlockedBitmap(dogtagImagePath, 160);
                    if (imgThumb != null) imgThumb.Image = imgThumbBmp;
                }
                catch { }
                if (lblImgWarn != null)
                {
                    lblImgWarn.Visible = dogtagImageHasColor;
                    lblImgWarn.Text = dogtagImageHasColor
                        ? "Use a black-and-white image for the cleanest laser engrave."
                        : "";
                }
            }
            else if (lblImgWarn != null)
            {
                lblImgWarn.Visible = false;
            }
        }

        private void DisposeDogtagThumb()
        {
            if (imgThumb != null) imgThumb.Image = null;
            if (imgThumbBmp != null) { try { imgThumbBmp.Dispose(); } catch { } imgThumbBmp = null; }
        }

        /// <summary>Loads an image into memory (so the source file is NOT locked,
        /// which matters because it is copied later), downscaled to fit `max`.</summary>
        private static Bitmap LoadUnlockedBitmap(string path, int max)
        {
            using (Bitmap src = new Bitmap(path))
            {
                int w = src.Width, h = src.Height;
                double s = Math.Min(1.0, (double)max / Math.Max(w, h));
                int nw = Math.Max(1, (int)(w * s));
                int nh = Math.Max(1, (int)(h * s));
                return new Bitmap(src, new Size(nw, nh));
            }
        }

        /// <summary>True if the image has noticeable color (chroma), so the student
        /// can be nudged toward a cleaner black-and-white engrave.</summary>
        private static bool SampleHasColor(string path)
        {
            try
            {
                using (Bitmap src = new Bitmap(path))
                using (Bitmap small = new Bitmap(src, new Size(32, 32)))
                {
                    for (int y = 0; y < small.Height; y++)
                        for (int x = 0; x < small.Width; x++)
                        {
                            Color c = small.GetPixel(x, y);
                            int mx = Math.Max(c.R, Math.Max(c.G, c.B));
                            int mn = Math.Min(c.R, Math.Min(c.G, c.B));
                            if (mx - mn > 40) return true;   // chroma beyond a grey tolerance
                        }
                }
            }
            catch { }
            return false;
        }

        private void OnCreateDogtagClick(object sender, EventArgs e)
        {
            try
            {
                string name = txtDogName.Text == null ? "" : txtDogName.Text.Trim();
                if (name.Length == 0)
                {
                    lblDogNameError.Text = "Type your first name first.";
                    lblDogNameError.Visible = true;
                    return;
                }
                string safe = SanitizeForFileName(name);
                if (safe.Length == 0)
                {
                    lblDogNameError.Text = "That name cannot go in a file name. Try letters only.";
                    lblDogNameError.Visible = true;
                    return;
                }
                lblDogNameError.Visible = false;

                string folder = FindOrCreateFspFolder();
                string outPath = null;
                for (int i = 1; i < 1000; i++)
                {
                    string suffix = i == 1 ? "_dogtag" : "_dogtag" + i.ToString(CultureInfo.InvariantCulture);
                    string candidate = Path.Combine(folder, safe + suffix + ".sldprt");
                    if (!File.Exists(candidate)) { outPath = candidate; break; }
                }
                if (outPath == null)
                {
                    ShowError("Could not find a free file name in " + folder + ". Raise your hand.");
                    return;
                }

                studentName = name;
                dogtagStem = Path.GetFileNameWithoutExtension(outPath);

                string buildError;
                bool imageFailed;
                IModelDoc2 doc = NewDogtagPart(dogtagShape, out buildError, out imageFailed);
                if (doc == null)
                {
                    ShowError(buildError + " Raise your hand.");
                    return;
                }

                int errs = 0, warns = 0;
                bool saved = doc.Extension.SaveAs(outPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref errs, ref warns);
                if (!saved)
                {
                    ShowError("Could not save your new dogtag file. Error: "
                        + errs.ToString(CultureInfo.InvariantCulture) + ". Raise your hand.");
                    return;
                }

                fspFolder = folder;
                partPath = outPath;
                dxfPath = Path.ChangeExtension(outPath, ".dxf");
                dogtagExportDone = false;

                if (imageFailed)
                    ShowError("Image preview unavailable - your image file will still be submitted separately.");

                if (dogtagShape == ShapeCustom)
                {
                    // Leave the outer boundary to the student: keep the body sketch
                    // open and go to the custom-outline page.
                    EnsureBodySketchOpen(DogtagBodySketch);
                    ShowPhase(1);
                }
                else
                {
                    string exErr;
                    if (!ExtrudeDogtagBody(out exErr))
                        ShowError(exErr + " You can still review and export.");
                    ShowPhase(2);
                }
            }
            catch (Exception ex)
            {
                ShowError(ex.Message + " Raise your hand.");
            }
        }

        /// <summary>
        /// Builds a fresh IPS dogtag part: a Front-Plane body sketch (the outer
        /// shape for the built-in shapes, or just the chain hole for CUSTOM) plus
        /// a SEPARATE engrave sketch carrying the name/date text and optional
        /// image. The text lives in its own sketch, never extruded, so the body
        /// extrude can never fail on letter islands.
        /// </summary>
        private IModelDoc2 NewDogtagPart(int shape, out string error, out bool imageFailed)
        {
            error = "";
            imageFailed = false;
            IModelDoc2 model = NewPartDocument();
            if (model == null)
            {
                error = "Could not create a new SOLIDWORKS part.";
                return null;
            }
            try
            {
                model.SetUserPreferenceIntegerValue(
                    (int)swUserPreferenceIntegerValue_e.swUnitSystem, (int)swUnitSystem_e.swUnitSystem_IPS);
            }
            catch { }

            // Body sketch.
            try
            {
                IFeature plane = FirstPlane(model);
                if (plane == null) { error = "Could not find the front plane to start the sketch on."; return null; }
                plane.Select2(false, 0);

                ISketchManager sm = model.SketchManager;
                bool prevAdd = false;
                try { prevAdd = sm.AddToDB; sm.AddToDB = true; } catch { }
                sm.InsertSketch(true);

                double holeY;
                if (shape == ShapeMilitary || shape == ShapeRect)
                {
                    CreateRoundedRect(sm, DogBodyHalfW, DogBodyHalfH,
                        shape == ShapeRect ? DogCornerRect : DogCornerMil);
                    holeY = DogBodyHalfH - DogHoleFromTop;
                }
                else if (shape == ShapeRound)
                {
                    sm.CreateCircleByRadius(0.0, 0.0, 0.0, DogRoundR);
                    holeY = DogRoundR - DogHoleFromTop;
                }
                else
                {
                    holeY = DogBodyHalfH - DogHoleFromTop;   // CUSTOM: default hole placement
                }

                // Chain hole: CONSTRUCTION for now so the CUSTOM outline detector
                // ignores it; flipped to solid right before the extrude so it cuts
                // a real hole.
                ISketchSegment hole = sm.CreateCircleByRadius(0.0, holeY, 0.0, DogHoleR) as ISketchSegment;
                if (hole != null) { try { hole.ConstructionGeometry = true; } catch { } }

                sm.InsertSketch(true);
                try { sm.AddToDB = prevAdd; } catch { }
                model.ClearSelection2(true);
                IFeature bodyFeat = model.FeatureByPositionReverse(0) as IFeature;
                if (bodyFeat != null) { try { bodyFeat.Name = DogtagBodySketch; } catch { } }
            }
            catch (Exception ex)
            {
                error = "Could not build the dogtag shape. Error: " + ex.Message + ".";
                return null;
            }

            // Engrave sketch (reference only).
            try { BuildEngraveSketch(model, out imageFailed); }
            catch { imageFailed = imageFailed || !string.IsNullOrEmpty(dogtagImagePath); }

            return model;
        }

        /// <summary>Draws a rounded rectangle centered on the origin from four
        /// lines and four convex corner arcs (all swept clockwise around the
        /// perimeter, so the arc direction is a constant -1).</summary>
        private static void CreateRoundedRect(ISketchManager sm, double W, double H, double r)
        {
            const short cw = -1;   // clockwise minor arc (SolidWorks: +1 = CCW)
            sm.CreateLine(-W + r, H, 0, W - r, H, 0);                       // top
            sm.CreateArc(W - r, H - r, 0, W - r, H, 0, W, H - r, 0, cw);    // top-right
            sm.CreateLine(W, H - r, 0, W, -H + r, 0);                       // right
            sm.CreateArc(W - r, -H + r, 0, W, -H + r, 0, W - r, -H, 0, cw); // bottom-right
            sm.CreateLine(W - r, -H, 0, -W + r, -H, 0);                     // bottom
            sm.CreateArc(-W + r, -H + r, 0, -W + r, -H, 0, -W, -H + r, 0, cw); // bottom-left
            sm.CreateLine(-W, -H + r, 0, -W, H - r, 0);                     // left
            sm.CreateArc(-W + r, H - r, 0, -W, H - r, 0, -W + r, H, 0, cw); // top-left
        }

        private void BuildEngraveSketch(IModelDoc2 model, out bool imageFailed)
        {
            imageFailed = false;
            IFeature plane = FirstPlane(model);
            if (plane == null) return;
            plane.Select2(false, 0);
            ISketchManager sm = model.SketchManager;
            sm.InsertSketch(true);

            // Name, centered slightly above the middle; date a set gap below it.
            InsertCenteredText(model, studentName, 0.0, DogNameH * 0.2, DogNameH);
            int year = DateTime.Now.Year;
            InsertCenteredText(model, "IDEA FSP " + year.ToString(CultureInfo.InvariantCulture),
                0.0, -(DogNameH + DogDateGap), DogDateH);

            // Optional reference image, centered below the text. Best-effort.
            if (!string.IsNullOrEmpty(dogtagImagePath) && File.Exists(dogtagImagePath))
            {
                try
                {
                    ISketchPicture pic = sm.InsertSketchPicture(dogtagImagePath) as ISketchPicture;
                    if (pic == null) { imageFailed = true; }
                    else
                    {
                        double side = 0.5 * InchToM;
                        try { pic.SetSize(side, side, true); } catch { }
                        try { pic.SetOrigin(-side / 2.0, -(DogNameH + DogDateGap + side + 0.05 * InchToM)); } catch { }
                    }
                }
                catch { imageFailed = true; }
            }

            sm.InsertSketch(true);
            model.ClearSelection2(true);
            IFeature f = model.FeatureByPositionReverse(0) as IFeature;
            if (f != null) { try { f.Name = DogtagEngraveSketch; } catch { } }
        }

        /// <summary>Inserts centered sketch text at (x,y) with a set character
        /// height (meters). Height is applied through the text format.</summary>
        private void InsertCenteredText(IModelDoc2 model, string text, double x, double y, double height)
        {
            if (string.IsNullOrEmpty(text)) return;
            try
            {
                ISketchText st = model.IInsertSketchText(x, y, 0.0, text,
                    (int)swTextJustification_e.swTextJustificationCenter, 0, 0, 100, 100);
                if (st == null) return;
                ITextFormat tf = st.GetTextFormat() as ITextFormat;
                if (tf != null)
                {
                    tf.CharHeight = height;
                    st.SetTextFormat(false, tf);
                }
            }
            catch { /* text is reference-only; never fail the build over it */ }
        }

        /// <summary>Exits the body sketch (flipping its construction chain hole to
        /// solid first) and extrudes it 0.037 in into the dogtag body.</summary>
        private bool ExtrudeDogtagBody(out string error)
        {
            error = "";
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null) { error = "Your dogtag file is not open."; return false; }

                // Make sure we are in the body sketch, flip the hole to solid.
                EnsureBodySketchOpen(DogtagBodySketch);
                FlipConstructionToSolidInActiveSketch(model);
                if (model.GetActiveSketch2() != null) model.InsertSketch2(true);

                IFeature f = FindFeature(model, DogtagBodySketch);
                if (f == null) { error = "Could not find the dogtag sketch."; return false; }
                model.ClearSelection2(true);
                f.Select2(false, 0);

                object feat = model.FeatureManager.FeatureExtrusion3(
                    true, false, false,
                    (int)swEndConditions_e.swEndCondBlind, 0, DogDepth, 0.0,
                    false, false, false, false, 0.0, 0.0,
                    false, false, false, false,
                    true, true, true,
                    (int)swStartConditions_e.swStartSketchPlane, 0.0, false);
                model.ClearSelection2(true);
                if (feat == null) { error = "Could not make the dogtag 3D."; return false; }
                try { model.ShowNamedView2("*Trimetric", -1); model.ViewZoomtofit2(); } catch { }
                return true;
            }
            catch (Exception ex)
            {
                error = "Could not make the dogtag 3D. Error: " + ex.Message + ".";
                return false;
            }
        }

        private static void FlipConstructionToSolidInActiveSketch(IModelDoc2 model)
        {
            try
            {
                ISketch sk = model.GetActiveSketch2() as ISketch;
                if (sk == null) return;
                object[] segs = sk.GetSketchSegments() as object[];
                if (segs == null) return;
                foreach (object o in segs)
                {
                    ISketchSegment seg = o as ISketchSegment;
                    if (seg == null) continue;
                    bool c = false;
                    try { c = seg.ConstructionGeometry; } catch { }
                    if (c) { try { seg.ConstructionGeometry = false; } catch { } }
                }
            }
            catch { }
        }

        // ==================================================================
        // DOGTAG // PHASE 1 - CUSTOM OUTLINE
        // ==================================================================

        private void BuildDogtagPhase1(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("DRAW YOUR OUTLINE", Green, TitleFont), 6);

            AddDogtagStepImage(t, 1, 10);

            AddRow(t, MakeLabel("Draw your dogtag outline around the text and hole.",
                Green, BodyBoldFont), 6);
            AddRow(t, MakeLabel("Your line must form a CLOSED shape - connect back to "
                + "where you started.", Amber, BodyBoldFont), 6);
            AddRow(t, MakeLabel("Use LINE, ARC, or SPLINE. Ctrl+Z to undo.", TextPrimary, BodyFont), 12);

            // One-tap sketch tools.
            AddRow(t, MakeLabel("Drawing tools:", TextSecondary, SmallFont), 4);
            TableLayoutPanel tools = new TableLayoutPanel();
            tools.ColumnCount = 3;
            for (int i = 0; i < 3; i++) tools.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
            tools.RowCount = 1;
            tools.Dock = DockStyle.Fill;
            tools.AutoSize = true;
            tools.Margin = new Padding(0);
            tools.BackColor = Bg;
            tools.Controls.Add(MakeToolButton("LINE", (int)swCommands_e.swCommands_Line), 0, 0);
            tools.Controls.Add(MakeToolButton("ARC", (int)swCommands_e.swCommands_3PointArc), 1, 0);
            tools.Controls.Add(MakeToolButton("SPLINE", (int)swCommands_e.swCommands_Spline), 2, 0);
            AddRow(t, tools, 14);

            // Live status: circle + label.
            TableLayoutPanel statusRow = NewInnerRow();
            statusCircle = new Panel();
            statusCircle.Size = new Size(40, 40);
            statusCircle.Margin = new Padding(0);
            statusCircle.BackColor = Bg;
            statusCircle.Paint += OnStatusCirclePaint;
            statusRow.Controls.Add(statusCircle, 0, 0);
            lblSketchStatus = MakeLabel("Waiting for sketch...", TextSecondary, BodyBoldFont);
            lblSketchStatus.Margin = new Padding(8, 9, 0, 0);
            statusRow.Controls.Add(lblSketchStatus, 1, 0);
            AddRow(t, statusRow, 12);

            // Required confirmation before advancing.
            chkTrace = new CheckBox();
            chkTrace.Text = "My outline goes all the way around the text and the chain hole.";
            chkTrace.ForeColor = TextPrimary;
            chkTrace.BackColor = Color.Transparent;
            chkTrace.Font = SmallFont;
            chkTrace.AutoSize = false;
            chkTrace.Dock = DockStyle.Fill;
            chkTrace.Height = 44;
            chkTrace.Margin = new Padding(0);
            chkTrace.Checked = false;
            traceConfirmed = false;
            chkTrace.CheckedChanged += OnTraceConfirmChanged;
            AddRow(t, chkTrace, 12);

            btnRevolve = MakePrimaryButton("MY OUTLINE IS DONE", 48);
            revolveArmed = false;
            StyleGatedButton(btnRevolve, false);
            btnRevolve.Click += OnDogtagOutlineDoneClick;
            AddRow(t, btnRevolve, 0);

            RefreshRevolveGate();
        }

        private void OnDogtagOutlineDoneClick(object sender, EventArgs e)
        {
            if (!revolveArmed) return;
            string err;
            if (!ExtrudeDogtagBody(out err))
            {
                ShowError(err + " Raise your hand.");
                return;
            }
            ShowPhase(2);
        }

        // ==================================================================
        // DOGTAG // PHASE 2 - REVIEW
        // ==================================================================

        private void BuildDogtagPhase2(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("REVIEW YOUR DOGTAG", Green, TitleFont), 6);
            AddRow(t, MakeLabel("Your dogtag looks great. Ready to export?",
                TextPrimary, BodyFont), 12);

            AddDogtagStepImage(t, 2, 14);

            Button edit = MakeSecondaryButton("EDIT MY DESIGN", 44);
            edit.Click += OnDogtagEditClick;
            AddRow(t, edit, 10);

            Button export = MakePrimaryButton("EXPORT AND SUBMIT", 48);
            export.Click += OnDogtagExportClick;
            AddRow(t, export, 0);
        }

        private void OnDogtagEditClick(object sender, EventArgs e)
        {
            try
            {
                EnsureBodySketchOpen(DogtagBodySketch);
                dogtagEditing = true;
                sketchTimer.Start();   // watch for the student to exit the sketch
            }
            catch (Exception ex)
            {
                ShowError("Could not open your design to edit. " + ex.Message);
            }
        }

        private void OnDogtagExportClick(object sender, EventArgs e)
        {
            ShowPhase(3);
        }

        // ==================================================================
        // DOGTAG // PHASE 3 - EXPORT AND SUBMIT
        // ==================================================================

        private void BuildDogtagPhase3(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("EXPORT + SUBMIT", Green, TitleFont), 8);
            AddRow(t, MakeLabel("Saving your dogtag and getting your files ready...",
                TextPrimary, BodyFont), 0);
        }

        /// <summary>
        /// Runs the whole export on entering Phase 3: save the part, export the
        /// DXF of the front face, copy the image, open Gmail, then show the
        /// post-export panel. Guarded so a BACK/forward re-entry never re-opens
        /// Gmail or re-writes files.
        /// </summary>
        private void RunDogtagExport()
        {
            if (dogtagExportDone) { BuildDogtagPostExport(); return; }

            IModelDoc2 model = ActiveModel();
            if (model == null)
            {
                ShowError("Your dogtag file is not open in SOLIDWORKS. Raise your hand.");
                return;
            }

            // 1. Save the part.
            int e = 0, w = 0;
            try { model.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref e, ref w); }
            catch { }

            // 2. DXF export of the front face.
            int dxfErr;
            bool dxfOk = ExportDogtagDxf(out dxfErr);
            if (!dxfOk)
                ShowError("DXF export failed " + dxfErr.ToString(CultureInfo.InvariantCulture)
                    + ". Save manually: File > Save As > DXF, select the front face.");

            // 3. Copy the reference image into the folder for separate submission.
            dogtagImageDest = "";
            if (!string.IsNullOrEmpty(dogtagImagePath) && File.Exists(dogtagImagePath))
            {
                try
                {
                    string ext = Path.GetExtension(dogtagImagePath);
                    string dest = Path.Combine(fspFolder, dogtagStem + "_image" + ext);
                    File.Copy(dogtagImagePath, dest, true);
                    dogtagImageDest = dest;
                }
                catch { dogtagImageDest = ""; }
            }

            // 4. Open Gmail compose.
            bool hasImage = !string.IsNullOrEmpty(dogtagImageDest);
            string body = DogtagEmailBody + (hasImage ? " I also attached the image file." : "");
            try
            {
                Process.Start(ComposeUrl(cfgDogtagEmailTo, cfgDogtagEmailSubject, body));
                if (emailMoveTimer != null) { emailMoveTimer.Stop(); emailMoveTimer.Start(); }
            }
            catch
            {
                ShowError("Could not open the browser. Open Gmail yourself and email the file to "
                    + cfgDogtagEmailTo + " with the subject \"" + cfgDogtagEmailSubject + "\".");
            }

            dogtagExportDone = true;

            // 5. Post-export panel.
            BuildDogtagPostExport();
        }

        private bool ExportDogtagDxf(out int errCode)
        {
            errCode = 0;
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model == null) { errCode = -1; return false; }
                if (!SelectLargestPlanarFace(model)) { errCode = -2; return false; }
                int e = 0, w = 0;
                bool ok;
                try
                {
                    ok = model.Extension.SaveAs(dxfPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref e, ref w);
                }
                catch { ok = false; }
                model.ClearSelection2(true);
                errCode = e;
                return ok && File.Exists(dxfPath);
            }
            catch { return false; }
        }

        /// <summary>Selects the largest planar face of the part - the flat front
        /// face of the thin plate - so a face DXF gives the cut outline + hole.</summary>
        private bool SelectLargestPlanarFace(IModelDoc2 model)
        {
            try
            {
                IPartDoc part = model as IPartDoc;
                if (part == null) return false;
                object[] bodies = part.GetBodies2((int)swBodyType_e.swSolidBody, true) as object[];
                if (bodies == null || bodies.Length == 0) return false;
                IBody2 body = bodies[0] as IBody2;
                if (body == null) return false;
                object[] faces = body.GetFaces() as object[];
                if (faces == null) return false;

                IFace2 best = null;
                double bestArea = -1;
                foreach (object o in faces)
                {
                    IFace2 face = o as IFace2;
                    if (face == null) continue;
                    ISurface surf = face.GetSurface() as ISurface;
                    if (surf == null || !surf.IsPlane()) continue;
                    double area = 0;
                    try { area = face.GetArea(); } catch { }
                    if (area > bestArea) { bestArea = area; best = face; }
                }
                if (best == null) return false;
                model.ClearSelection2(true);
                IEntity ent = best as IEntity;
                if (ent == null) return false;
                return ent.Select4(false, null);
            }
            catch { return false; }
        }

        private void BuildDogtagPostExport()
        {
            wrapLabels.Clear();
            DisposeStepImage();
            contentHost.SuspendLayout();
            while (contentHost.Controls.Count > 0)
            {
                Control old = contentHost.Controls[0];
                contentHost.Controls.RemoveAt(0);
                old.Dispose();
            }

            TableLayoutPanel t = NewPhaseTable();
            AddRow(t, MakeLabel("DOGTAG COMPLETE!", Green, TitleFont), 8);
            AddRow(t, MakeLabel("Files saved. Drag them into the email and click Send.",
                TextPrimary, BodyFont), 12);

            AddRow(t, MakeLabel("Your dogtag cut file (.dxf):", TextPrimary, BodyBoldFont), 4);
            TextBox dxfBox = MakeTextBox(PathFont);
            dxfBox.ReadOnly = true;
            dxfBox.Text = dxfPath;
            dxfBox.ForeColor = Green;
            AddRow(t, dxfBox, 12);

            if (!string.IsNullOrEmpty(dogtagImageDest))
            {
                AddRow(t, MakeLabel("IMAGE (attach this too):", Amber, BodyBoldFont), 4);
                TextBox imgBox = MakeTextBox(PathFont);
                imgBox.ReadOnly = true;
                imgBox.Text = dogtagImageDest;
                AddRow(t, imgBox, 12);
            }

            Button openFolder = MakePrimaryButton("OPEN FILE FOLDER", 44);
            openFolder.Click += OnOpenFolderClick;
            AddRow(t, openFolder, 8);

            Button another = MakeSecondaryButton("BUILD ANOTHER DOGTAG", 40);
            another.Click += OnBuildAnotherDogtagClick;
            AddRow(t, another, 16);

            AddRow(t, MakeLabel(studentName + "'s dogtag is ready. It will be cut tonight.",
                Green, BodyBoldFont), 0);

            contentHost.Controls.Add(t);
            contentHost.ResumeLayout();
            ApplyWrapWidths();
        }

        private void OnBuildAnotherDogtagClick(object sender, EventArgs e)
        {
            partPath = "";
            stepPath = "";
            dxfPath = "";
            fspFolder = "";
            dogtagImagePath = "";
            dogtagImageDest = "";
            dogtagImageHasColor = false;
            dogtagExportDone = false;
            dogtagShape = ShapeMilitary;
            ShowPhase(0);
        }

        // ------------------------------------------------------------------
        // SOLIDWORKS helpers
        // ------------------------------------------------------------------

        private IModelDoc2 ActiveModel()
        {
            try { return swApp == null ? null : swApp.ActiveDoc as IModelDoc2; }
            catch { return null; }
        }

        /// <summary>
        /// Finds a feature by name: IPartDoc.FeatureByName first (IModelDoc2 has
        /// no such method in the interop), then a feature-tree walk as fallback.
        /// </summary>
        private static IFeature FindFeature(IModelDoc2 model, string name)
        {
            try
            {
                IPartDoc part = model as IPartDoc;
                if (part != null)
                {
                    IFeature byName = part.FeatureByName(name) as IFeature;
                    if (byName != null) return byName;
                }
            }
            catch { }
            try
            {
                IFeature f = model.FirstFeature() as IFeature;
                while (f != null)
                {
                    if (string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase)) return f;
                    f = f.GetNextFeature() as IFeature;
                }
            }
            catch { }
            return null;
        }

        private int SafeFeatureCount()
        {
            try
            {
                IModelDoc2 model = ActiveModel();
                return model == null ? 0 : model.GetFeatureCount();
            }
            catch
            {
                return 0;
            }
        }

        /// <summary>True if the part already has a revolve/boss feature, so the
        /// pawn is already 3D and should not be revolved again.</summary>
        private static bool HasRevolveFeature(IModelDoc2 model)
        {
            try
            {
                IFeature f = model.FirstFeature() as IFeature;
                while (f != null)
                {
                    string typeName = "";
                    try { typeName = f.GetTypeName2(); } catch { }
                    if (string.Equals(typeName, "Revolution", StringComparison.OrdinalIgnoreCase))
                        return true;
                    string name = (f.Name ?? "").ToLowerInvariant();
                    if (name.IndexOf("revolve") >= 0) return true;
                    f = f.GetNextFeature() as IFeature;
                }
            }
            catch { }
            return false;
        }

        private static string SanitizeForFileName(string name)
        {
            char[] invalid = Path.GetInvalidFileNameChars();
            StringBuilder sb = new StringBuilder(name.Length);
            foreach (char c in name)
            {
                if (Array.IndexOf(invalid, c) < 0) sb.Append(c);
            }
            return sb.ToString().Trim();
        }

        // ------------------------------------------------------------------
        // Pulse animation
        // ------------------------------------------------------------------

        private void StartPulse(int halfToggles)
        {
            pulseRemaining = halfToggles;
            pulseOn = true;
            pulseTimer.Interval = 140;
            pulseTimer.Start();
        }

        private void StartContinuousPulse()
        {
            pulseRemaining = -1;
            pulseOn = true;
            pulseTimer.Interval = 450;
            pulseTimer.Start();
        }

        private void StopPulse()
        {
            if (pulseTimer != null) pulseTimer.Stop();
            pulseOn = true;
        }

        private void OnPulseTick(object sender, EventArgs e)
        {
            pulseOn = !pulseOn;
            if (pulseRemaining > 0)
            {
                pulseRemaining--;
                if (pulseRemaining == 0)
                {
                    pulseTimer.Stop();
                    pulseOn = true;
                }
            }
            if (phase == 2 && statusCircle != null) statusCircle.Invalidate();
            if (phase == 3 && waitCircle != null) waitCircle.Invalidate();
        }

        private static Color Dimmed(Color c)
        {
            return Color.FromArgb(c.R * 35 / 100, c.G * 35 / 100, c.B * 35 / 100);
        }

        // ------------------------------------------------------------------
        // Error banner
        // ------------------------------------------------------------------

        private void ShowError(string message)
        {
            errorLabel.Text = message;
            errorBanner.Visible = true;
            int w = errorBanner.ClientSize.Width - errorDismissButton.Width - 24;
            if (w < 80) w = 80;
            Size pref = TextRenderer.MeasureText(message, errorLabel.Font,
                new Size(w, 0), TextFormatFlags.WordBreak);
            bannerTargetHeight = Math.Max(44, pref.Height + 20);
            bannerTimer.Start();
        }

        private void OnBannerTick(object sender, EventArgs e)
        {
            if (errorBanner.Height >= bannerTargetHeight)
            {
                errorBanner.Height = bannerTargetHeight;
                bannerTimer.Stop();
                return;
            }
            int step = Math.Max(4, bannerTargetHeight / 8);
            errorBanner.Height = Math.Min(bannerTargetHeight, errorBanner.Height + step);
        }

        private void OnErrorDismissClick(object sender, EventArgs e)
        {
            HideErrorBanner();
        }

        private void HideErrorBanner()
        {
            if (bannerTimer != null) bannerTimer.Stop();
            errorBanner.Height = 0;
            errorBanner.Visible = false;
        }

        // ------------------------------------------------------------------
        // Progress dots (5 phases)
        // ------------------------------------------------------------------

        private void OnProgressStripPaint(object sender, PaintEventArgs e)
        {
            // No dots on the mode selector; pawn has 5 phases, dogtag has 4.
            int dots = mode == 0 ? 0 : (mode == 2 ? 4 : 5);
            if (dots == 0) return;

            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            int d = 12;
            int gap = 12;
            int total = dots * d + (dots - 1) * gap;
            // Center the dots in the space between the BACK and START OVER buttons.
            int left = (backButton != null && backButton.Visible) ? backButton.Width : 0;
            int right = (restartButton != null && restartButton.Visible) ? restartButton.Width : 0;
            int avail = progressStrip.ClientSize.Width - left - right;
            int x = left + (avail - total) / 2;
            if (x < left + 6) x = left + 6;
            int y = (progressStrip.ClientSize.Height - d) / 2;
            for (int i = 0; i < dots; i++)
            {
                Color c = i == phase ? Green : (i < phase ? GreenDone : DotUpcoming);
                using (SolidBrush b = new SolidBrush(c))
                {
                    e.Graphics.FillEllipse(b, x + i * (d + gap), y, d, d);
                }
            }
        }

        private void OnProgressStripResize(object sender, EventArgs e)
        {
            progressStrip.Invalidate();
        }

        // ------------------------------------------------------------------
        // Layout + control factories
        // ------------------------------------------------------------------

        private TableLayoutPanel NewPhaseTable()
        {
            TableLayoutPanel t = new TableLayoutPanel();
            t.ColumnCount = 1;
            t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            t.Dock = DockStyle.Top;
            t.AutoSize = true;
            t.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            t.Padding = new Padding(16, 16, 16, 16);
            t.BackColor = Bg;
            return t;
        }

        /// <summary>Two-column inner row: a fixed 44 px cell + a fill cell.
        /// The row auto-sizes so a wrapped status label is never clipped.</summary>
        private TableLayoutPanel NewInnerRow()
        {
            TableLayoutPanel row = new TableLayoutPanel();
            row.ColumnCount = 2;
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 44f));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.RowCount = 1;
            row.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            row.Dock = DockStyle.Fill;
            row.AutoSize = true;
            row.Margin = new Padding(0);
            row.BackColor = Bg;
            return row;
        }

        private void AddRow(TableLayoutPanel t, Control control, int bottomGap)
        {
            int row = t.RowCount;
            t.RowCount = row + 1;
            t.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            if (bottomGap > 0)
            {
                Padding margin = control.Margin;
                control.Margin = new Padding(margin.Left, margin.Top, margin.Right, margin.Bottom + bottomGap);
            }
            t.Controls.Add(control, 0, row);
        }

        /// <summary>
        /// Adds the "what this step should look like" illustration for a phase,
        /// drawn at runtime so no image files ship in the repo.
        /// </summary>
        private void AddStepImage(TableLayoutPanel t, int phaseForArt, int bottomGap)
        {
            Bitmap bmp = null;
            try { bmp = PawnStepArt.Render(phaseForArt, Math.Max(240, WrapWidth()), 168); }
            catch { bmp = null; }
            MountStepImage(t, bmp, bottomGap);
        }

        private void AddDogtagStepImage(TableLayoutPanel t, int artKind, int bottomGap)
        {
            Bitmap bmp = null;
            try { bmp = DotagStepArt.Render(artKind, Math.Max(240, WrapWidth()), 168); }
            catch { bmp = null; }
            MountStepImage(t, bmp, bottomGap);
        }

        private void MountStepImage(TableLayoutPanel t, Bitmap bmp, int bottomGap)
        {
            if (bmp == null) return;
            stepImage = bmp;
            stepPictureBox = new PictureBox();
            stepPictureBox.Image = stepImage;
            stepPictureBox.SizeMode = PictureBoxSizeMode.Zoom;
            stepPictureBox.BackColor = BgPanel;
            stepPictureBox.Height = 168;
            stepPictureBox.Dock = DockStyle.Fill;
            stepPictureBox.Margin = new Padding(0);
            AddRow(t, stepPictureBox, bottomGap);
        }

        private void DisposeStepImage()
        {
            if (stepPictureBox != null) stepPictureBox.Image = null;   // don't let control dispose it
            stepPictureBox = null;                                      // disposed with contentHost
            if (stepImage != null)
            {
                try { stepImage.Dispose(); } catch { }
                stepImage = null;
            }
        }

        private Label MakeLabel(string text, Color color, Font font)
        {
            Label label = new Label();
            label.Text = text;
            label.ForeColor = color;
            label.BackColor = Color.Transparent;
            if (font != null) label.Font = font;
            label.AutoSize = true;
            label.Margin = new Padding(0);
            label.MaximumSize = new Size(WrapWidth(), 0);
            wrapLabels.Add(label);
            return label;
        }

        private TextBox MakeTextBox(Font font)
        {
            TextBox box = new TextBox();
            box.BorderStyle = BorderStyle.FixedSingle;
            box.BackColor = BgPanel;
            box.ForeColor = TextPrimary;
            box.Font = font;
            box.Dock = DockStyle.Fill;
            box.Margin = new Padding(0);
            return box;
        }

        private Button MakePrimaryButton(string text, int height)
        {
            Button b = new Button();
            b.Text = text;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(0x00, 0xDD, 0x38);
            b.BackColor = Green;
            b.ForeColor = Color.Black;
            b.Font = ButtonFont;
            b.Height = height;
            b.Dock = DockStyle.Fill;
            b.Margin = new Padding(0);
            b.Cursor = Cursors.Hand;
            return b;
        }

        private Button MakeSecondaryButton(string text, int height)
        {
            Button b = new Button();
            b.Text = text;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(0x3F, 0x3F, 0x3F);
            b.BackColor = BtnSecondaryBg;
            b.ForeColor = TextPrimary;
            b.Font = ButtonFont;
            b.Height = height;
            b.Dock = DockStyle.Fill;
            b.Margin = new Padding(0);
            b.Cursor = Cursors.Hand;
            return b;
        }

        /// <summary>
        /// A small outlined "drawing tool" button (Line / Arc / Spline). Clicking
        /// it activates the matching SOLIDWORKS sketch tool; the student then
        /// clicks in the drawing to place points.
        /// </summary>
        private Button MakeToolButton(string text, int commandId)
        {
            Button b = new Button();
            b.Text = text;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.BorderColor = GreenDone;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(0x00, 0x3A, 0x14);
            b.BackColor = BtnSecondaryBg;
            b.ForeColor = Green;
            b.Font = ButtonFont;
            b.Height = 40;
            b.Dock = DockStyle.Fill;
            b.Margin = new Padding(0, 0, 6, 0);
            b.Cursor = Cursors.Hand;
            b.Tag = commandId;
            b.Click += OnSketchToolClick;
            return b;
        }

        private void OnSketchToolClick(object sender, EventArgs e)
        {
            Button b = sender as Button;
            if (b == null || !(b.Tag is int)) return;
            try
            {
                IModelDoc2 model = ActiveModel();
                // Make sure the right drawing sketch is active so the tool draws in it.
                if (model != null && model.GetActiveSketch2() == null)
                {
                    string sketchName = mode == 2 ? DogtagBodySketch : cfgSketchName;
                    IFeature feat = FindFeature(model, sketchName);
                    if (feat != null) { feat.Select2(false, 0); model.EditSketch(); }
                }
                swApp.RunCommand((int)b.Tag, "");
            }
            catch { /* tool activation is best-effort */ }
        }

        /// <summary>
        /// The gated (SPIN) button keeps Enabled=true so the custom disabled
        /// palette renders exactly per spec; the Click handler checks the armed
        /// flag instead.
        /// </summary>
        private void StyleGatedButton(Button b, bool armed)
        {
            if (armed)
            {
                b.BackColor = Green;
                b.ForeColor = Color.Black;
                b.FlatAppearance.MouseOverBackColor = Color.FromArgb(0x00, 0xDD, 0x38);
                b.Cursor = Cursors.Hand;
            }
            else
            {
                b.BackColor = BtnDisabledBg;
                b.ForeColor = BtnDisabledText;
                b.FlatAppearance.MouseOverBackColor = BtnDisabledBg;
                b.Cursor = Cursors.Default;
            }
        }

        private int WrapWidth()
        {
            int width = contentHost == null ? 320 : contentHost.ClientSize.Width - 40;
            return width < 160 ? 160 : width;
        }

        private void ApplyWrapWidths()
        {
            int width = WrapWidth();
            foreach (Label label in wrapLabels)
            {
                label.MaximumSize = new Size(width, 0);
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (wrapLabels != null) ApplyWrapWidths();
        }
    }

    /// <summary>
    /// Draws the per-step "this is what it should look like" illustrations at
    /// runtime (no image files in the repo). Everything is schematic and
    /// color-coded to the pane: amber DOTTED lines are the guides, bright GREEN
    /// is the student's own drawing / finished pawn, cyan is motion.
    /// </summary>
    internal static class PawnStepArt
    {
        private static readonly Color Bg = Color.FromArgb(0x24, 0x24, 0x24);
        private static readonly Color Frame = Color.FromArgb(0x3A, 0x3A, 0x3A);
        private static readonly Color Amber = Color.FromArgb(0xFF, 0xB0, 0x00);
        private static readonly Color Green = Color.FromArgb(0x00, 0xFF, 0x41);
        private static readonly Color GreenSoft = Color.FromArgb(0x60, 0x00, 0xFF, 0x41);
        private static readonly Color GreenFill = Color.FromArgb(0x33, 0x00, 0xFF, 0x41);
        private static readonly Color Cyan = Color.FromArgb(0x35, 0xE0, 0xFF);
        private static readonly Color Ink = Color.FromArgb(0xC8, 0xC8, 0xC8);
        private static readonly Color Dim = Color.FromArgb(0x88, 0x88, 0x88);

        public static Bitmap Render(int phase, int w, int h)
        {
            Bitmap bmp = new Bitmap(w, h);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                using (SolidBrush bg = new SolidBrush(Bg)) g.FillRectangle(bg, 0, 0, w, h);
                using (Pen fp = new Pen(Frame, 1f)) g.DrawRectangle(fp, 0, 0, w - 1, h - 1);

                switch (phase)
                {
                    case 1: DrawGuidesStep(g, w, h); break;
                    case 2: DrawProfileStep(g, w, h); break;
                    case 3: DrawRevolveStep(g, w, h); break;
                    default: DrawFinishedStep(g, w, h); break;   // 0 and 4
                }
            }
            return bmp;
        }

        // Phase 1: the two dotted guide lines the student starts with.
        private static void DrawGuidesStep(Graphics g, int w, int h)
        {
            float ox = w * 0.34f, by = h * 0.78f, top = h * 0.16f, right = w * 0.66f;
            DrawGuides(g, ox, by, top, right);
            Caption(g, w, h, "Your two dotted guide lines");
            using (Font f = new Font("Segoe UI", 8f, FontStyle.Bold))
            {
                Label(g, "spin line", Amber, f, ox - 62f, (top + by) / 2f - 8f);
                Label(g, "floor line", Amber, f, right + 4f, by - 6f);
            }
        }

        // Phase 2: a green profile traced onto the guides (only half a pawn).
        private static void DrawProfileStep(Graphics g, int w, int h)
        {
            float ox = w * 0.34f, by = h * 0.78f, top = h * 0.16f, right = w * 0.66f;
            DrawGuides(g, ox, by, top, right);
            using (GraphicsPath p = HalfProfile(ox, by, top))
            {
                using (SolidBrush fill = new SolidBrush(GreenFill)) g.FillPath(fill, p);
                using (Pen pen = new Pen(Green, 2.4f)) g.DrawPath(pen, p);
            }
            Caption(g, w, h, "Trace ANY shape you want");
        }

        // Phase 3: flat profile spins into a 3D solid.
        private static void DrawRevolveStep(Graphics g, int w, int h)
        {
            float leftCx = w * 0.24f, by = h * 0.74f, top = h * 0.20f;
            using (GraphicsPath p = HalfProfile(leftCx - w * 0.06f, by, top))
            {
                using (Pen pen = new Pen(Green, 2.2f)) g.DrawPath(pen, p);
            }
            // Spin arrow.
            using (Pen ap = new Pen(Cyan, 2.4f))
            {
                ap.CustomEndCap = new AdjustableArrowCap(4f, 4f);
                g.DrawArc(ap, w * 0.40f, h * 0.34f, w * 0.16f, h * 0.30f, 120, 300);
            }
            DrawPawn3D(g, w * 0.74f, by, (by - top));
            Caption(g, w, h, "Spin it into a 3D pawn");
        }

        // Phase 0 / 4: the finished 3D pawn.
        private static void DrawFinishedStep(Graphics g, int w, int h)
        {
            float by = h * 0.80f, top = h * 0.16f;
            DrawPawn3D(g, w * 0.5f, by, (by - top));
            // A friendly done-check.
            using (Pen cp = new Pen(Green, 3.5f))
            {
                cp.StartCap = LineCap.Round; cp.EndCap = LineCap.Round;
                float cx = w * 0.74f, cy = h * 0.30f;
                g.DrawLine(cp, cx - 10f, cy, cx - 3f, cy + 8f);
                g.DrawLine(cp, cx - 3f, cy + 8f, cx + 11f, cy - 9f);
            }
            Caption(g, w, h, "Your finished pawn");
        }

        // ---- shared pieces ------------------------------------------------

        private static void DrawGuides(Graphics g, float ox, float by, float top, float right)
        {
            using (Pen pen = new Pen(Amber, 2f))
            {
                pen.DashStyle = DashStyle.Dash;
                pen.DashPattern = new float[] { 4f, 3f };
                g.DrawLine(pen, ox, by, ox, top);       // vertical spin line
                g.DrawLine(pen, ox, by, right, by);     // horizontal floor line
            }
            // origin dot
            using (SolidBrush b = new SolidBrush(Amber)) g.FillEllipse(b, ox - 3f, by - 3f, 6f, 6f);
        }

        // A half pawn silhouette: left edge ON the spin line, bottom ON the
        // floor line, curvy right side. This is what a student actually draws.
        private static GraphicsPath HalfProfile(float ox, float by, float top)
        {
            float hgt = by - top;
            GraphicsPath p = new GraphicsPath();
            PointF pBaseIn = new PointF(ox, by);
            PointF pBaseOut = new PointF(ox + hgt * 0.42f, by);
            PointF pRingTop = new PointF(ox + hgt * 0.30f, by - hgt * 0.16f);
            PointF pNeck = new PointF(ox + hgt * 0.12f, by - hgt * 0.48f);
            PointF pCollar = new PointF(ox + hgt * 0.24f, by - hgt * 0.60f);
            PointF pHeadTop = new PointF(ox, top);
            p.AddLine(pBaseIn, pBaseOut);                                   // along the floor
            p.AddLine(pBaseOut, pRingTop);                                  // up the base ring
            p.AddBezier(pRingTop, new PointF(ox + hgt * 0.02f, by - hgt * 0.30f),
                        new PointF(ox + hgt * 0.02f, by - hgt * 0.40f), pNeck);   // waist in
            p.AddBezier(pNeck, new PointF(ox + hgt * 0.30f, by - hgt * 0.54f),
                        new PointF(ox + hgt * 0.30f, by - hgt * 0.58f), pCollar); // collar out
            p.AddBezier(pCollar, new PointF(ox + hgt * 0.22f, top + hgt * 0.02f),
                        new PointF(ox + hgt * 0.16f, top), pHeadTop);            // head bump to axis
            p.AddLine(pHeadTop, pBaseIn);                                   // down the spin line
            p.CloseFigure();
            return p;
        }

        // A simple shaded 3D pawn (stacked ellipses) to suggest the solid.
        private static void DrawPawn3D(Graphics g, float cx, float by, float hgt)
        {
            float r = hgt * 0.30f;
            using (SolidBrush body = new SolidBrush(Color.FromArgb(0x1E, 0x7A, 0x33)))
            using (SolidBrush lite = new SolidBrush(Color.FromArgb(0x2E, 0xC0, 0x50)))
            using (Pen edge = new Pen(Green, 1.6f))
            {
                // base disc
                g.FillEllipse(body, cx - r, by - hgt * 0.10f, r * 2f, hgt * 0.16f);
                g.DrawEllipse(edge, cx - r, by - hgt * 0.10f, r * 2f, hgt * 0.16f);
                // tapered body
                using (GraphicsPath bp = new GraphicsPath())
                {
                    bp.AddBezier(new PointF(cx - r * 0.9f, by - hgt * 0.04f),
                                 new PointF(cx - r * 0.35f, by - hgt * 0.45f),
                                 new PointF(cx - r * 0.30f, by - hgt * 0.52f),
                                 new PointF(cx - r * 0.42f, by - hgt * 0.60f));
                    bp.AddLine(new PointF(cx - r * 0.42f, by - hgt * 0.60f),
                               new PointF(cx + r * 0.42f, by - hgt * 0.60f));
                    bp.AddBezier(new PointF(cx + r * 0.42f, by - hgt * 0.60f),
                                 new PointF(cx + r * 0.30f, by - hgt * 0.52f),
                                 new PointF(cx + r * 0.35f, by - hgt * 0.45f),
                                 new PointF(cx + r * 0.9f, by - hgt * 0.04f));
                    bp.CloseFigure();
                    g.FillPath(body, bp);
                    g.DrawPath(edge, bp);
                }
                // collar
                g.FillEllipse(body, cx - r * 0.5f, by - hgt * 0.66f, r, hgt * 0.10f);
                g.DrawEllipse(edge, cx - r * 0.5f, by - hgt * 0.66f, r, hgt * 0.10f);
                // head
                float hr = hgt * 0.20f;
                g.FillEllipse(body, cx - hr, by - hgt * 0.94f, hr * 2f, hr * 2f);
                g.DrawEllipse(edge, cx - hr, by - hgt * 0.94f, hr * 2f, hr * 2f);
                // highlight
                g.FillEllipse(lite, cx - hr * 0.5f, by - hgt * 0.90f, hr * 0.6f, hr * 0.7f);
            }
        }

        private static void Caption(Graphics g, int w, int h, string text)
        {
            using (Font f = new Font("Segoe UI", 8.5f, FontStyle.Bold))
            using (SolidBrush b = new SolidBrush(Dim))
            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                g.DrawString(text, f, b, new RectangleF(4, h - 20, w - 8, 16), sf);
            }
        }

        private static void Label(Graphics g, string text, Color c, Font f, float x, float y)
        {
            using (SolidBrush b = new SolidBrush(c)) g.DrawString(text, f, b, x, y);
        }
    }

    /// <summary>
    /// Runtime "this is what it should look like" illustrations for the DOGTAG
    /// flow, matching PawnStepArt's approach. kind 0 = the starting tag, 1 = an
    /// outline being drawn around the text + hole, 2 = the finished dogtag.
    /// </summary>
    internal static class DotagStepArt
    {
        private static readonly Color Bg = Color.FromArgb(0x24, 0x24, 0x24);
        private static readonly Color Frame = Color.FromArgb(0x3A, 0x3A, 0x3A);
        private static readonly Color Amber = Color.FromArgb(0xFF, 0xB0, 0x00);
        private static readonly Color Green = Color.FromArgb(0x00, 0xFF, 0x41);
        private static readonly Color GreenFill = Color.FromArgb(0x22, 0x00, 0xFF, 0x41);
        private static readonly Color Ink = Color.FromArgb(0xC8, 0xC8, 0xC8);
        private static readonly Color Dim = Color.FromArgb(0x88, 0x88, 0x88);

        public static Bitmap Render(int kind, int w, int h)
        {
            Bitmap bmp = new Bitmap(w, h);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                using (SolidBrush bg = new SolidBrush(Bg)) g.FillRectangle(bg, 0, 0, w, h);
                using (Pen fp = new Pen(Frame, 1f)) g.DrawRectangle(fp, 0, 0, w - 1, h - 1);

                float cx = w * 0.5f, cy = h * 0.45f;
                float tagH = h * 0.60f;
                float tagW = tagH * (1.125f / 2.0f);
                float corner = tagW * 0.16f;

                // The text + chain hole live on the tag in every state.
                DrawHole(g, cx, cy, tagW, tagH);
                DrawTextLines(g, cx, cy, tagW, tagH, kind);

                if (kind == 1)
                {
                    // Outline being drawn: dashed, three-quarters closed.
                    DrawOutline(g, cx, cy, tagW, tagH, corner, true, false);
                    Caption(g, w, h, "Draw your outline around it");
                }
                else
                {
                    DrawOutline(g, cx, cy, tagW, tagH, corner, false, true);
                    Caption(g, w, h, kind == 0 ? "Your dogtag starts here" : "Your finished dogtag");
                }
            }
            return bmp;
        }

        private static GraphicsPath RoundedRect(float cx, float cy, float tw, float th, float r)
        {
            RectangleF rc = new RectangleF(cx - tw / 2f, cy - th / 2f, tw, th);
            float d = r * 2f;
            GraphicsPath p = new GraphicsPath();
            p.AddArc(rc.Left, rc.Top, d, d, 180, 90);
            p.AddArc(rc.Right - d, rc.Top, d, d, 270, 90);
            p.AddArc(rc.Right - d, rc.Bottom - d, d, d, 0, 90);
            p.AddArc(rc.Left, rc.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        private static void DrawOutline(Graphics g, float cx, float cy, float tw, float th,
            float r, bool dashed, bool fill)
        {
            using (GraphicsPath p = RoundedRect(cx, cy, tw, th, r))
            {
                if (fill) using (SolidBrush b = new SolidBrush(GreenFill)) g.FillPath(b, p);
                using (Pen pen = new Pen(Green, 2.4f))
                {
                    if (dashed) { pen.DashStyle = DashStyle.Dash; pen.DashPattern = new float[] { 4f, 3f }; }
                    g.DrawPath(pen, p);
                }
            }
        }

        private static void DrawHole(Graphics g, float cx, float cy, float tw, float th)
        {
            float hr = tw * 0.09f;
            float hy = cy - th / 2f + th * 0.11f;
            using (Pen pen = new Pen(Ink, 2f)) g.DrawEllipse(pen, cx - hr, hy - hr, hr * 2f, hr * 2f);
        }

        private static void DrawTextLines(Graphics g, float cx, float cy, float tw, float th, int kind)
        {
            string name = kind == 0 ? "NAME" : "ALEX";
            using (Font nf = new Font("Segoe UI", th * 0.09f, FontStyle.Bold))
            using (Font df = new Font("Segoe UI", th * 0.055f, FontStyle.Bold))
            using (SolidBrush nb = new SolidBrush(Ink))
            using (SolidBrush db = new SolidBrush(Dim))
            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                g.DrawString(name, nf, nb, new RectangleF(cx - tw / 2f, cy - th * 0.06f, tw, th * 0.2f), sf);
                g.DrawString("IDEA FSP", df, db, new RectangleF(cx - tw / 2f, cy + th * 0.14f, tw, th * 0.12f), sf);
            }
        }

        private static void Caption(Graphics g, int w, int h, string text)
        {
            using (Font f = new Font("Segoe UI", 8.5f, FontStyle.Bold))
            using (SolidBrush b = new SolidBrush(Dim))
            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                g.DrawString(text, f, b, new RectangleF(4, h - 20, w - 8, 16), sf);
            }
        }
    }
}
