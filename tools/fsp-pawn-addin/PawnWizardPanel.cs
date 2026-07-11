using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
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
        // TemplateFileName, ProfileSketchName, TeacherEmail, EmailSubject,
        // EmailBody.
        // ==================================================================
        private const string DefaultFspFolderName = "IDEA_FSP";
        private const string DefaultTemplateFileName = "COPY ME - CHESS PAWN TEMPLATE.sldprt";
        private const string DefaultProfileSketchName = "Pawn_Profile";
        private const string DefaultTeacherEmail = "apina@boscotech.edu";
        private const string DefaultEmailSubject = "pawn";
        private const string DefaultEmailBody = "Hi Mr. Pina, here is my pawn file.";
        private const string ConfigFileName = "pawn-wizard-config.txt";

        // UI spec palette.
        private static readonly Color Bg = Color.FromArgb(0x1A, 0x1A, 0x1A);
        private static readonly Color BgPanel = Color.FromArgb(0x24, 0x24, 0x24);
        private static readonly Color Green = Color.FromArgb(0x00, 0xFF, 0x41);
        private static readonly Color GreenDone = Color.FromArgb(0x00, 0x7A, 0x1F);
        private static readonly Color ErrorRed = Color.FromArgb(0xFF, 0x33, 0x55);
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

        private const string DrawInstructions =
            "Draw the side profile of your pawn using the sketch tools at the top of the screen.\r\n\r\n" +
            "- Line, Spline, or Arc: select a tool, then left-click to start drawing\r\n" +
            "- Ctrl+Z to undo a mistake\r\n" +
            "- Your line must connect back to where it started\r\n\r\n" +
            "The vertical orange line is your spin axis. Draw around it, not on top of it.";

        private const string StuckHelp =
            "Try connecting your last point back to your first point. Zoom out to check for gaps. " +
            "Ctrl+Z to undo and try again.";

        private readonly ISldWorks swApp;

        // Effective configuration (defaults, possibly overridden by the config file).
        private string cfgFolderName;
        private string cfgTemplateName;
        private string cfgSketchName;
        private string cfgTeacherEmail;
        private string cfgEmailSubject;
        private string cfgEmailBody;

        // Wizard state, filled by Phase 0.
        private int phase;
        private string studentName = "";
        private string fspFolder = "";
        private string partPath = "";
        private string stepPath = "";

        // Phase 0 controls.
        private TextBox txtFirstName;
        private Label lblNameError;

        // Phase 2 controls + state.
        private Panel statusCircle;
        private Label lblSketchStatus;
        private Panel stuckPanel;
        private Button btnRevolve;
        private int sketchState;        // 0 = grey (no sketch), 1 = red (open), 2 = green (closed)
        private bool revolveArmed;

        // Phase 3 controls + state.
        private Label lblRevolveHint;
        private Panel waitCircle;
        private int baselineFeatureCount;

        // Timers (all UI-thread).
        private System.Windows.Forms.Timer sketchTimer;   // Phase 2: 2 s sketch poll
        private System.Windows.Forms.Timer revolveTimer;  // Phase 3: 1 s feature poll
        private System.Windows.Forms.Timer pulseTimer;    // indicator pulse animation
        private System.Windows.Forms.Timer bannerTimer;   // error banner slide-in
        private bool pulseOn = true;
        private int pulseRemaining;                       // >0 finite half-toggles, -1 continuous
        private int bannerTargetHeight;

        private readonly List<Label> wrapLabels = new List<Label>();

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

            ShowPhase(0);
        }

        /// <summary>Called by the add-in on disconnect; stops all timers.</summary>
        public void ShutDown()
        {
            try { if (sketchTimer != null) { sketchTimer.Stop(); sketchTimer.Dispose(); sketchTimer = null; } } catch { }
            try { if (revolveTimer != null) { revolveTimer.Stop(); revolveTimer.Dispose(); revolveTimer = null; } } catch { }
            try { if (pulseTimer != null) { pulseTimer.Stop(); pulseTimer.Dispose(); pulseTimer = null; } } catch { }
            try { if (bannerTimer != null) { bannerTimer.Stop(); bannerTimer.Dispose(); bannerTimer = null; } } catch { }
        }

        // ------------------------------------------------------------------
        // Configuration file (optional, no-recompile overrides)
        // ------------------------------------------------------------------

        private void LoadConfig()
        {
            cfgFolderName = DefaultFspFolderName;
            cfgTemplateName = DefaultTemplateFileName;
            cfgSketchName = DefaultProfileSketchName;
            cfgTeacherEmail = DefaultTeacherEmail;
            cfgEmailSubject = DefaultEmailSubject;
            cfgEmailBody = DefaultEmailBody;
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
                    else if (key.Equals("TemplateFileName", StringComparison.OrdinalIgnoreCase)) cfgTemplateName = value;
                    else if (key.Equals("ProfileSketchName", StringComparison.OrdinalIgnoreCase)) cfgSketchName = value;
                    else if (key.Equals("TeacherEmail", StringComparison.OrdinalIgnoreCase)) cfgTeacherEmail = value;
                    else if (key.Equals("EmailSubject", StringComparison.OrdinalIgnoreCase)) cfgEmailSubject = value;
                    else if (key.Equals("EmailBody", StringComparison.OrdinalIgnoreCase)) cfgEmailBody = value;
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

        private void ShowPhase(int n)
        {
            phase = n;
            if (sketchTimer != null) sketchTimer.Stop();
            if (revolveTimer != null) revolveTimer.Stop();
            StopPulse();
            HideErrorBanner();
            wrapLabels.Clear();

            contentHost.SuspendLayout();
            while (contentHost.Controls.Count > 0)
            {
                Control old = contentHost.Controls[0];
                contentHost.Controls.RemoveAt(0);
                old.Dispose();
            }

            TableLayoutPanel table = NewPhaseTable();
            switch (n)
            {
                case 0: BuildPhase0(table); break;
                case 1: BuildPhase1(table); break;
                case 2: BuildPhase2(table); break;
                case 3: BuildPhase3(table); break;
                case 4: BuildPhase4(table); break;
            }
            contentHost.Controls.Add(table);
            contentHost.ResumeLayout();
            progressStrip.Invalidate();
            ApplyWrapWidths();

            // Kick off the phase's automatic behavior.
            if (n == 2)
            {
                sketchState = -1;   // force the first poll to paint a state
                PollSketchOnce();
                sketchTimer.Start();
            }
            else if (n == 3)
            {
                baselineFeatureCount = SafeFeatureCount();
                StartRevolveCommand();
                StartContinuousPulse();
                revolveTimer.Start();
            }
        }

        // ------------------------------------------------------------------
        // PHASE 0 - SETUP
        // ------------------------------------------------------------------

        private void BuildPhase0(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel("IDEA FSP // PAWN BUILD", Green, TitleFont), 4);
            AddRow(t, MakeLabel("Let's build your pawn.", TextSecondary, BodyFont), 20);

            AddRow(t, MakeLabel("First Name", TextSecondary, SmallFont), 4);
            txtFirstName = MakeTextBox(BodyFont);
            AddRow(t, txtFirstName, 4);
            lblNameError = MakeLabel("", ErrorRed, SmallFont);
            lblNameError.Visible = false;
            AddRow(t, lblNameError, 14);

            Button begin = MakePrimaryButton("BEGIN", 48);
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

                // Locate the classroom folder on the Desktop.
                string folder = Path.Combine(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Desktop"),
                    cfgFolderName);
                if (!Directory.Exists(folder))
                {
                    // OneDrive-redirected desktops keep the real Desktop elsewhere.
                    string alt = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), cfgFolderName);
                    if (Directory.Exists(alt)) folder = alt;
                    else
                    {
                        ShowError(folder + " not found on Desktop. Raise your hand.");
                        return;
                    }
                }

                string template = Path.Combine(folder, cfgTemplateName);
                if (!File.Exists(template))
                {
                    ShowError("Template file not found. Raise your hand.");
                    return;
                }

                // First free [name]_pawnN.sldprt in the same folder.
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

                File.Copy(template, outPath);

                int errs = 0;
                int warns = 0;
                IModelDoc2 doc = swApp.OpenDoc6(outPath, (int)swDocumentTypes_e.swDocPART,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref errs, ref warns) as IModelDoc2;
                if (doc == null)
                {
                    ShowError("Could not open your pawn file. Error: "
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

        // ------------------------------------------------------------------
        // PHASE 1 - OPEN SKETCH
        // ------------------------------------------------------------------

        private void BuildPhase1(TableLayoutPanel t)
        {
            AddRow(t, MakeLabel(studentName + "'s file is open.", Green, TitleFont), 10);
            AddRow(t, MakeLabel("Click the button below to open your sketch.", TextPrimary, BodyFont), 18);

            Button open = MakePrimaryButton("OPEN SKETCH", 48);
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
            AddRow(t, MakeLabel("DESIGN YOUR PAWN", Green, TitleFont), 10);
            AddRow(t, MakeLabel(DrawInstructions, TextPrimary, BodyFont), 14);

            // Live status: 32 px circle + label.
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
            AddRow(t, statusRow, 14);

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
            AddRow(t, stuckPanel, 14);

            btnRevolve = MakePrimaryButton("REVOLVE MY PAWN", 48);
            revolveArmed = false;
            StyleGatedButton(btnRevolve, false);
            btnRevolve.Click += OnRevolveClick;
            AddRow(t, btnRevolve, 0);
        }

        private void OnStuckToggleClick(object sender, EventArgs e)
        {
            if (stuckPanel != null) stuckPanel.Visible = !stuckPanel.Visible;
        }

        private void OnSketchPollTick(object sender, EventArgs e)
        {
            if (phase == 2) PollSketchOnce();
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
                    // GetSketchContours returns only CLOSED contours, so any
                    // result at all means the profile forms a closed loop.
                    object[] contours = sketch.GetSketchContours() as object[];
                    next = (contours != null && contours.Length > 0) ? 2 : 1;
                }
            }
            catch
            {
                // Mid-command reads can fail; keep the last state this cycle.
                return;
            }
            ApplySketchState(next);
        }

        private void ApplySketchState(int next)
        {
            if (next == sketchState) return;
            sketchState = next;
            if (next == 2)
            {
                lblSketchStatus.Text = "Closed loop - ready to revolve!";
                lblSketchStatus.ForeColor = Green;
                if (!revolveArmed)
                {
                    revolveArmed = true;
                    StyleGatedButton(btnRevolve, true);
                }
                StartPulse(6);  // 3 brightness pulses, then hold
            }
            else if (next == 1)
            {
                lblSketchStatus.Text = "Keep drawing - profile is not closed yet";
                lblSketchStatus.ForeColor = ErrorRed;
                // A previously-closed profile was broken open again; disarm so
                // the revolve cannot be launched on a profile that will fail.
                if (revolveArmed)
                {
                    revolveArmed = false;
                    StyleGatedButton(btnRevolve, false);
                }
                StopPulse();
            }
            else
            {
                // No active sketch. If the loop was already confirmed the
                // student may simply have exited the sketch; stay armed.
                lblSketchStatus.Text = "Waiting for sketch...";
                lblSketchStatus.ForeColor = TextSecondary;
                StopPulse();
            }
            if (statusCircle != null) statusCircle.Invalidate();
        }

        private void OnStatusCirclePaint(object sender, PaintEventArgs e)
        {
            Color c = sketchState == 2 ? Green : (sketchState == 1 ? ErrorRed : TextSecondary);
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
            AddRow(t, MakeLabel("REVOLVE YOUR PAWN", Green, TitleFont), 10);
            lblRevolveHint = MakeLabel("", TextPrimary, BodyFont);
            AddRow(t, lblRevolveHint, 14);

            TableLayoutPanel waitRow = NewInnerRow();
            waitCircle = new Panel();
            waitCircle.Size = new Size(40, 40);
            waitCircle.Margin = new Padding(0);
            waitCircle.BackColor = Bg;
            waitCircle.Paint += OnWaitCirclePaint;
            waitRow.Controls.Add(waitCircle, 0, 0);
            Label waiting = MakeLabel("Waiting for revolve to complete...", Green, BodyBoldFont);
            waiting.Margin = new Padding(8, 9, 0, 0);
            waitRow.Controls.Add(waiting, 1, 0);
            AddRow(t, waitRow, 16);

            Button retry = MakeSecondaryButton("RE-OPEN THE REVOLVE TOOL", 38);
            retry.Click += OnRetryRevolveClick;
            AddRow(t, retry, 0);
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

        private void OnRetryRevolveClick(object sender, EventArgs e)
        {
            StartRevolveCommand();
        }

        /// <summary>
        /// Pre-selects the profile sketch's construction centerline (the spin
        /// axis) when possible, then launches the Revolved Boss/Base command.
        /// Sets the contextual instruction either way.
        /// </summary>
        private void StartRevolveCommand()
        {
            bool axisSelected = false;
            try
            {
                IModelDoc2 model = ActiveModel();
                if (model != null)
                {
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
                    ? "The axis is already selected. Click the green checkmark in the panel on the left to finish."
                    : "Click the vertical orange line in your sketch. Then click the green checkmark.";
            }
        }

        private bool TryPreselectCenterline(IModelDoc2 model)
        {
            try
            {
                IFeature feat = FindFeature(model, cfgSketchName);
                if (feat == null) return false;
                ISketch sketch = feat.GetSpecificFeature2() as ISketch;
                if (sketch == null) return false;
                object[] segs = sketch.GetSketchSegments() as object[];
                if (segs == null) return false;

                ISketchSegment best = null;
                foreach (object o in segs)
                {
                    ISketchSegment seg = o as ISketchSegment;
                    if (seg == null) continue;
                    bool construction = false;
                    try { construction = seg.ConstructionGeometry; } catch { }
                    if (!construction) continue;
                    // Prefer a construction LINE (the template's centerline);
                    // fall back to any construction segment.
                    if (seg.GetType() == (int)swSketchSegments_e.swSketchLINE) { best = seg; break; }
                    if (best == null) best = seg;
                }
                if (best == null) return false;

                model.ClearSelection2(true);
                return best.Select4(false, null);
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
            AddRow(t, MakeLabel("PAWN COMPLETE!", Green, TitleFont), 8);
            AddRow(t, MakeLabel(studentName + ", your pawn is done. Let's send it to Mr. Pina.",
                TextPrimary, BodyFont), 18);

            Button save = MakePrimaryButton("SAVE + EXPORT", 48);
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

                // 4. Open Gmail compose in the default browser.
                try
                {
                    Process.Start(GmailComposeUrl());
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
            contentHost.SuspendLayout();
            while (contentHost.Controls.Count > 0)
            {
                Control old = contentHost.Controls[0];
                contentHost.Controls.RemoveAt(0);
                old.Dispose();
            }

            TableLayoutPanel t = NewPhaseTable();
            AddRow(t, MakeLabel("PAWN COMPLETE!", Green, TitleFont), 8);
            AddRow(t, MakeLabel("Your file has been saved and exported.", TextPrimary, BodyFont), 8);
            AddRow(t, MakeLabel("Gmail just opened. Drag your file into the email and click Send.",
                TextPrimary, BodyFont), 14);

            TextBox pathBox = MakeTextBox(PathFont);
            pathBox.ReadOnly = true;
            pathBox.Text = stepPath;
            AddRow(t, pathBox, 14);

            Button openFolder = MakeSecondaryButton("OPEN FILE FOLDER", 38);
            openFolder.Click += OnOpenFolderClick;
            AddRow(t, openFolder, 20);

            AddRow(t, MakeLabel(studentName + "'s pawn is ready. See you tomorrow.", Green, BodyBoldFont), 0);

            contentHost.Controls.Add(t);
            contentHost.ResumeLayout();
            ApplyWrapWidths();
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
            return "https://mail.google.com/mail/?view=cm&to=" + Uri.EscapeDataString(cfgTeacherEmail)
                + "&su=" + Uri.EscapeDataString(cfgEmailSubject)
                + "&body=" + Uri.EscapeDataString(cfgEmailBody);
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
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            int d = 12;
            int gap = 12;
            int total = 5 * d + 4 * gap;
            int x = (progressStrip.ClientSize.Width - total) / 2;
            if (x < 8) x = 8;
            int y = (progressStrip.ClientSize.Height - d) / 2;
            for (int i = 0; i < 5; i++)
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
        /// The gated (REVOLVE) button keeps Enabled=true so the custom disabled
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
}
