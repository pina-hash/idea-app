using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Windows.Forms;
using SolidWorks.Interop.sldworks;
// The sldworks interop has its own Environment type; keep the BCL one.
using Environment = System.Environment;

namespace IdeaGauntlet
{
    /// <summary>
    /// The persistent GAUNTLET task pane. Verification is GEOMETRY (volume) ONLY:
    /// the pane reads the part's canonical volume on an SI basis and the server
    /// ranks it against the level's stored volume. Mass is first-class but
    /// COMPUTED FROM THE LEVEL'S DENSITY (loaded by code via gauntlet_run_targets),
    /// never from the part's assigned material. It surfaces target vs computed
    /// mass, an unranked practice mass check, a reference-cube self-check, and an
    /// off-by-default, non-gating material advisory.
    /// All SOLIDWORKS COM access is on the pane's owning (main) thread; HTTP runs
    /// async and results are marshaled back with Invoke.
    /// </summary>
    public class TaskPaneControl : UserControl
    {
        private static readonly Color Bg = Color.FromArgb(246, 247, 248);
        private static readonly Color BgPanel = Color.White;
        private static readonly Color Green = Color.FromArgb(0, 122, 61);
        private static readonly Color GreenBright = Color.FromArgb(0, 145, 70);
        private static readonly Color Cyan = Color.FromArgb(0, 103, 122);
        private static readonly Color Amber = Color.FromArgb(158, 100, 0);
        private static readonly Color Crimson = Color.FromArgb(180, 42, 30);
        private static readonly Color Body = Color.FromArgb(33, 40, 38);
        private static readonly Color Dim = Color.FromArgb(108, 117, 113);
        private static readonly Color HoverTint = Color.FromArgb(232, 243, 237);

        private readonly ISldWorks swApp;

        private TableLayoutPanel table;
        private readonly List<Label> wrapLabels = new List<Label>();

        private Label lblDoc;
        private Label lblUnits;
        private Label lblVolumePrimary;
        private Label lblGeometry;
        private TextBox txtCode;
        private Button btnLoad;
        private Label lblLevel;
        private Label lblMass;
        private Label lblDelta;
        private CheckBox chkAdvisory;
        private Label lblAdvisory;
        private CheckBox chkLive;
        private Button btnRefresh;
        private Button btnStart;
        private Button btnSubmit;
        private Button btnPractice;
        private Button btnSelfCheck;
        private Label lblRun;
        private TextBox txtStatus;
        private Label lblVersion;
        private System.Windows.Forms.Timer timer;

        private PartSnapshot last;
        private LevelTargets level;      // the loaded level's constants (density, target mass, ...)
        private DateTime? runStartedUtc;
        private string sessionRunId;
        private bool busy;
        private int tick;

        public TaskPaneControl(ISldWorks app)
        {
            swApp = app;
            BuildUi();
            ShowSwVersion();
            FullRefreshQuiet();
            KickUpdateCheck();

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 1000;
            timer.Tick += OnTimerTick;
            timer.Start();
        }

        public void ShutDown()
        {
            try
            {
                if (timer != null)
                {
                    timer.Stop();
                    timer.Dispose();
                    timer = null;
                }
            }
            catch { }
        }

        // ---------------------------------------------------------------------
        // UI construction
        // ---------------------------------------------------------------------

        private void BuildUi()
        {
            SuspendLayout();
            BackColor = Bg;
            ForeColor = Body;
            Font = new Font("Segoe UI", 8.25f);
            AutoScroll = true;

            table = new TableLayoutPanel();
            table.ColumnCount = 1;
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            table.Dock = DockStyle.Top;
            table.AutoSize = true;
            table.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            table.Padding = new Padding(10, 10, 10, 10);
            table.BackColor = Bg;
            Controls.Add(table);

            Label title = MakeLabel("IDEA // GAUNTLET", GreenBright, new Font("Segoe UI", 13f, FontStyle.Bold));
            AddRow(title, 0);
            AddRow(MakeLabel("SPEEDRUN VERIFIER · TASK PANE", Cyan, new Font("Consolas", 7.5f)), 8);

            AddRow(MakeSection("ACTIVE PART"), 2);
            lblDoc = MakeLabel("-", Body, null);
            AddRow(lblDoc, 0);
            lblUnits = MakeLabel("Units: -", Dim, null);
            AddRow(lblUnits, 8);

            AddRow(MakeSection("GEOMETRY (what is verified)"), 2);
            lblVolumePrimary = MakeLabel("-", Body, new Font("Consolas", 14f, FontStyle.Bold));
            AddRow(lblVolumePrimary, 0);
            lblGeometry = MakeLabel("", Dim, new Font("Consolas", 8f));
            AddRow(lblGeometry, 8);

            AddRow(MakeSection("LEVEL (target from the challenge, not your material)"), 2);
            AddRow(MakeLabel("Code from the GAUNTLET Speedrun screen:", Dim, null), 2);
            TableLayoutPanel codeRow = new TableLayoutPanel();
            codeRow.ColumnCount = 2;
            codeRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62f));
            codeRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38f));
            codeRow.AutoSize = true;
            codeRow.Dock = DockStyle.Fill;
            codeRow.Margin = new Padding(0);
            txtCode = MakeTextBox();
            txtCode.CharacterCasing = CharacterCasing.Upper;
            txtCode.MaxLength = 8;
            txtCode.Font = new Font("Consolas", 12f, FontStyle.Bold);
            txtCode.TextAlign = HorizontalAlignment.Center;
            codeRow.Controls.Add(txtCode, 0, 0);
            btnLoad = MakeButton("LOAD LEVEL", Cyan);
            btnLoad.Click += OnLoadLevelClick;
            codeRow.Controls.Add(btnLoad, 1, 0);
            AddRow(codeRow, 4);
            lblLevel = MakeLabel("Enter your code and Load level to see the target mass.", Dim, new Font("Consolas", 8.25f));
            AddRow(lblLevel, 2);
            lblMass = MakeLabel("", Body, new Font("Consolas", 11f, FontStyle.Bold));
            AddRow(lblMass, 0);
            lblDelta = MakeLabel("", Dim, new Font("Consolas", 8.25f));
            AddRow(lblDelta, 6);

            chkAdvisory = new CheckBox();
            chkAdvisory.Text = "Material advisory (optional, never affects pass/fail)";
            chkAdvisory.Checked = false; // OFF by default
            chkAdvisory.AutoSize = true;
            chkAdvisory.ForeColor = Dim;
            chkAdvisory.Margin = new Padding(0);
            chkAdvisory.CheckedChanged += delegate { FullRefreshQuiet(); };
            AddRow(chkAdvisory, 2);
            lblAdvisory = MakeLabel("", Dim, new Font("Consolas", 8f));
            AddRow(lblAdvisory, 8);

            TableLayoutPanel liveRow = new TableLayoutPanel();
            liveRow.ColumnCount = 2;
            liveRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55f));
            liveRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45f));
            liveRow.AutoSize = true;
            liveRow.Dock = DockStyle.Fill;
            liveRow.Margin = new Padding(0);
            chkLive = new CheckBox();
            chkLive.Text = "Live (2 s)";
            chkLive.Checked = true;
            chkLive.AutoSize = true;
            chkLive.ForeColor = Dim;
            chkLive.Margin = new Padding(0, 4, 0, 0);
            liveRow.Controls.Add(chkLive, 0, 0);
            btnRefresh = MakeButton("REFRESH", Cyan);
            btnRefresh.Click += delegate { FullRefreshQuiet(); };
            liveRow.Controls.Add(btnRefresh, 1, 0);
            AddRow(liveRow, 10);

            AddRow(MakeSection("RUN"), 2);
            btnStart = MakeButton("&START RUN (blank part)", Green);
            btnStart.Click += OnStartClick;
            AddRow(btnStart, 4);
            btnSubmit = MakeButton("SUBMIT RUN (&DONE)", GreenBright);
            MakePrimary(btnSubmit);
            btnSubmit.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnSubmit.Click += OnSubmitClick;
            AddRow(btnSubmit, 6);

            btnPractice = MakeButton("PRACTICE MASS CHECK (unranked)", Cyan);
            btnPractice.Click += OnPracticeClick;
            AddRow(btnPractice, 4);
            btnSelfCheck = MakeButton("REFERENCE-CUBE SELF-CHECK", Cyan);
            btnSelfCheck.Click += OnSelfCheckClick;
            AddRow(btnSelfCheck, 6);

            lblRun = MakeLabel("No run started on this part.", Dim, new Font("Consolas", 8.25f));
            AddRow(lblRun, 8);

            AddRow(MakeSection("STATUS"), 2);
            txtStatus = new TextBox();
            txtStatus.Multiline = true;
            txtStatus.ReadOnly = true;
            txtStatus.WordWrap = true;
            txtStatus.ScrollBars = ScrollBars.Vertical;
            txtStatus.BorderStyle = BorderStyle.FixedSingle;
            txtStatus.BackColor = BgPanel;
            txtStatus.ForeColor = Dim;
            txtStatus.Font = new Font("Consolas", 8.25f);
            txtStatus.Height = 150;
            txtStatus.Dock = DockStyle.Fill;
            txtStatus.Margin = new Padding(0);
            txtStatus.Text = "Verification is on GEOMETRY (volume). You do not need a material." + Environment.NewLine +
                "1. On a blank part, START (server clock starts)." + Environment.NewLine +
                "2. Model to the target geometry." + Environment.NewLine +
                "3. SUBMIT. Mass shown is computed from the level's density.";
            AddRow(txtStatus, 8);

            lblVersion = MakeLabel("", Dim, new Font("Consolas", 7.5f));
            AddRow(lblVersion, 0);

            ResumeLayout();
        }

        private Label MakeSection(string text)
        {
            return MakeLabel(text, Cyan, new Font("Consolas", 7.5f, FontStyle.Bold));
        }

        private Label MakeLabel(string text, Color color, Font font)
        {
            Label label = new Label();
            label.Text = text;
            label.ForeColor = color;
            if (font != null) label.Font = font;
            label.AutoSize = true;
            label.Margin = new Padding(0);
            label.MaximumSize = new Size(WrapWidth(), 0);
            wrapLabels.Add(label);
            return label;
        }

        private TextBox MakeTextBox()
        {
            TextBox box = new TextBox();
            box.BorderStyle = BorderStyle.FixedSingle;
            box.BackColor = BgPanel;
            box.ForeColor = Body;
            box.Font = new Font("Consolas", 9.5f);
            box.Dock = DockStyle.Fill;
            box.Margin = new Padding(0);
            return box;
        }

        private Button MakeButton(string text, Color accent)
        {
            Button button = new Button();
            button.Text = text;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = accent;
            button.FlatAppearance.BorderSize = 1;
            button.FlatAppearance.MouseOverBackColor = HoverTint;
            button.BackColor = BgPanel;
            button.ForeColor = accent;
            button.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            button.Height = 30;
            button.Dock = DockStyle.Fill;
            button.Margin = new Padding(0);
            button.Cursor = Cursors.Hand;
            return button;
        }

        private void MakePrimary(Button button)
        {
            button.BackColor = Green;
            button.ForeColor = Color.White;
            button.FlatAppearance.BorderColor = Color.FromArgb(0, 92, 46);
            button.FlatAppearance.MouseOverBackColor = GreenBright;
        }

        private void AddRow(Control control, int bottomGap)
        {
            int row = table.RowCount;
            table.RowCount = row + 1;
            table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            if (bottomGap > 0)
            {
                Padding margin = control.Margin;
                control.Margin = new Padding(margin.Left, margin.Top, margin.Right, margin.Bottom + bottomGap);
            }
            table.Controls.Add(control, 0, row);
        }

        private int WrapWidth()
        {
            int width = ClientSize.Width - 28;
            return width < 140 ? 140 : width;
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (wrapLabels == null) return;
            int width = WrapWidth();
            foreach (Label label in wrapLabels)
            {
                label.MaximumSize = new Size(width, 0);
            }
        }

        // ---------------------------------------------------------------------
        // Refresh loop
        // ---------------------------------------------------------------------

        private void OnTimerTick(object sender, EventArgs e)
        {
            tick = tick + 1;
            if (busy) return;
            if (chkLive != null && chkLive.Checked && tick % 2 == 0)
            {
                FullRefreshQuiet();
            }
            else
            {
                UpdateRunLabel();
            }
        }

        private void FullRefreshQuiet()
        {
            try
            {
                // Read the material ONLY when the advisory is on, so the normal path
                // never touches the part's assigned material.
                PartSnapshot snap = PartReader.Read(swApp, chkAdvisory != null && chkAdvisory.Checked);
                ApplySnapshot(snap);
            }
            catch
            {
                // Mid-command reads can fail; skip this cycle rather than nag.
            }
        }

        private void ApplySnapshot(PartSnapshot snap)
        {
            last = snap;
            lblDoc.Text = snap.Title;
            lblUnits.Text = snap.IsPart ? "Units: " + snap.UnitSystemLabel + "  (display only)" : "Units: -";

            if (!snap.IsPart || !snap.HasVolume)
            {
                lblVolumePrimary.Text = "-";
                lblGeometry.Text = snap.IsPart ? "(empty part reads as zero volume)" : "";
            }
            else
            {
                lblVolumePrimary.Text = Inv("{0:0.00} mm3", snap.VolumeMm3);
                lblGeometry.Text = Inv("Area {0:0.00} mm2 · Features {1}", snap.SurfaceAreaMm2, snap.FeatureCount);
            }

            UpdateMass();
            UpdateAdvisory();
            UpdateRunLabel();
        }

        /// <summary>
        /// Computed mass = measured volume x the LEVEL's density (never the part's
        /// assigned material), shown in the level's unit with the delta to target.
        /// </summary>
        private void UpdateMass()
        {
            if (level == null || !level.ExpectedDensityGcm3.HasValue)
            {
                lblMass.Text = "";
                lblDelta.Text = "";
                return;
            }
            if (last == null || !last.IsPart || !last.HasVolume || last.VolumeMm3 <= 0.0)
            {
                lblMass.Text = "Model a solid body to see your mass.";
                lblMass.ForeColor = Dim;
                lblDelta.Text = "";
                return;
            }

            double density = level.ExpectedDensityGcm3.Value;      // g/cm3
            double massG = (last.VolumeMm3 / 1000.0) * density;     // cm3 x g/cm3 = g
            bool ips = string.Equals(level.UnitSystem, "IPS", StringComparison.OrdinalIgnoreCase);
            double massLevel = ips ? massG / GauntletMath.LbToG : massG;
            string unit = string.IsNullOrEmpty(level.MassUnit) ? (ips ? "lb" : "g") : level.MassUnit;

            lblMass.Text = ips
                ? Inv("Your mass: {0:0.0000} {1}", massLevel, unit)
                : Inv("Your mass: {0:0.00} {1}", massLevel, unit);
            lblMass.ForeColor = Body;

            if (level.TargetMassLevel.HasValue && level.TargetMassLevel.Value != 0)
            {
                double target = level.TargetMassLevel.Value;
                double devPct = (massLevel - target) / target * 100.0;
                double tol = level.TolerancePct.HasValue && level.TolerancePct.Value > 0
                    ? level.TolerancePct.Value : GauntletMath.VolumeTolPct;
                lblDelta.Text = Inv("Target {0} {1}  ·  {2}{3:0.000}% (tol {4:0.##}%)",
                    ips ? Inv("{0:0.0000}", target) : Inv("{0:0.00}", target), unit,
                    devPct >= 0 ? "+" : "-", Math.Abs(devPct), tol);
                lblDelta.ForeColor = Math.Abs(devPct) <= tol ? Green : Amber;
            }
            else
            {
                lblDelta.Text = "";
            }
        }

        private void UpdateAdvisory()
        {
            if (chkAdvisory == null || !chkAdvisory.Checked)
            {
                if (lblAdvisory != null) lblAdvisory.Text = "";
                return;
            }
            string applied = last != null ? (last.MaterialName ?? "") : "";
            string required = level != null ? (level.Material ?? "") : "";
            if (applied.Length == 0)
            {
                lblAdvisory.Text = "Advisory: no material name read (this never affects pass/fail).";
                lblAdvisory.ForeColor = Dim;
            }
            else if (required.Length == 0)
            {
                lblAdvisory.Text = "Advisory: applied \"" + applied + "\" (level has no named material).";
                lblAdvisory.ForeColor = Dim;
            }
            else if (string.Equals(applied, required, StringComparison.OrdinalIgnoreCase))
            {
                lblAdvisory.Text = "Advisory: material matches the level (\"" + required + "\").";
                lblAdvisory.ForeColor = Green;
            }
            else
            {
                lblAdvisory.Text = "Advisory: applied \"" + applied + "\" differs from the level's \"" + required + "\" (still fine to submit).";
                lblAdvisory.ForeColor = Amber;
            }
        }

        private void UpdateRunLabel()
        {
            string runId = last != null ? last.RunId : null;
            if (string.IsNullOrEmpty(runId) && sessionRunId != null) runId = sessionRunId;

            if (string.IsNullOrEmpty(runId))
            {
                lblRun.Text = "No run started on this part.";
                lblRun.ForeColor = Dim;
                return;
            }

            string text = "Run armed · id " + Shorten(runId);
            if (runStartedUtc.HasValue && string.Equals(runId, sessionRunId, StringComparison.OrdinalIgnoreCase))
            {
                TimeSpan elapsed = DateTime.UtcNow - runStartedUtc.Value;
                text = text + " · " + FormatElapsed(elapsed);
            }
            lblRun.Text = text;
            lblRun.ForeColor = Green;
        }

        // ---------------------------------------------------------------------
        // Load level (fetch the level's target constants for a code)
        // ---------------------------------------------------------------------

        private async void OnLoadLevelClick(object sender, EventArgs e)
        {
            if (busy) return;
            string code = CodeFromField();
            if (code == null) return;
            SetBusy(true);
            SetStatus("Loading the level target...", Dim);
            LevelTargets t = null;
            Exception error = null;
            try { t = await GauntletClient.GetTargetsAsync(code); }
            catch (Exception ex) { error = ex; }
            RunOnUi(delegate { FinishLoadLevel(t, error); });
        }

        private void FinishLoadLevel(LevelTargets t, Exception error)
        {
            try
            {
                if (error != null)
                {
                    SetStatus(FriendlyError(error), error is GauntletServerException ? Amber : Crimson);
                    return;
                }
                level = t;
                string name = string.IsNullOrEmpty(t.Title) ? "Level" : t.Title;
                if (t.TargetMassLevel.HasValue)
                {
                    lblLevel.Text = Inv("{0}: target {1} {2}  ·  units {3}",
                        name, FormatMass(t.TargetMassLevel.Value, t.UnitSystem), t.MassUnit ?? "", t.UnitSystem ?? "");
                }
                else
                {
                    lblLevel.Text = name + " loaded (no target mass stored).";
                }
                lblLevel.ForeColor = Body;
                SetStatus("Level loaded. Your mass is computed from the level's density.", Green);
            }
            finally
            {
                SetBusy(false);
                FullRefreshQuiet();
            }
        }

        // ---------------------------------------------------------------------
        // Start / Submit
        // ---------------------------------------------------------------------

        private async void OnStartClick(object sender, EventArgs e)
        {
            if (busy) return;
            string code = CodeFromField();
            if (code == null) return;

            PartSnapshot snap;
            try { snap = PartReader.Read(swApp); }
            catch (Exception ex)
            {
                SetStatus("Could not read the active document: " + ex.Message, Crimson);
                return;
            }
            ApplySnapshot(snap);

            if (!snap.IsPart)
            {
                SetStatus("Start a new, empty PART to begin your run (not an assembly or drawing).", Amber);
                return;
            }
            if (snap.VolumeMm3 > 0.0)
            {
                SetStatus("This part is not blank. Your run must start on a new, empty part so all modeling happens on the clock." +
                    Environment.NewLine + Environment.NewLine +
                    "Start a brand new part with nothing modeled yet, then press START again.", Amber);
                return;
            }

            SetBusy(true);
            SetStatus("Starting run, the server is stamping your start time...", Dim);
            StartResult result = null;
            Exception error = null;
            try
            {
                result = await GauntletClient.StartRunAsync(code, snap.VolumeMm3);
            }
            catch (Exception ex)
            {
                error = ex;
            }
            RunOnUi(delegate { FinishStart(result, error); });
        }

        private void FinishStart(StartResult result, Exception error)
        {
            try
            {
                if (error != null)
                {
                    SetStatus(FriendlyError(error), error is GauntletServerException ? Amber : Crimson);
                    return;
                }

                bool wrote = PartReader.WriteRunId(swApp, result.RunId);
                runStartedUtc = DateTime.UtcNow;
                sessionRunId = result.RunId;

                string message = "RUN STARTED. The clock is running." + Environment.NewLine +
                    "Build your part, then press SUBMIT RUN." + Environment.NewLine +
                    "Verification is on geometry (volume); no material is required.";
                if (!wrote)
                {
                    message = message + Environment.NewLine + Environment.NewLine +
                        "Note: the run id could not be written into the part, so it is held by this pane instead. Keep SOLIDWORKS open until you submit.";
                }
                SetStatus(message, Green);
            }
            finally
            {
                SetBusy(false);
                FullRefreshQuiet();
            }
        }

        private async void OnSubmitClick(object sender, EventArgs e)
        {
            if (busy) return;
            string code = CodeFromField();
            if (code == null) return;

            PartSnapshot snap;
            try { snap = PartReader.Read(swApp, chkAdvisory != null && chkAdvisory.Checked); }
            catch (Exception ex)
            {
                SetStatus("Could not read the active document: " + ex.Message, Crimson);
                return;
            }
            ApplySnapshot(snap);

            if (!snap.IsPart)
            {
                SetStatus("Open the PART you modeled (not an assembly or drawing).", Amber);
                return;
            }

            string runId = snap.RunId;
            if (string.IsNullOrEmpty(runId)) runId = sessionRunId;
            if (string.IsNullOrEmpty(runId))
            {
                SetStatus("No run has been started for this part. To run ranked:" + Environment.NewLine +
                    "1. Start a new, blank part." + Environment.NewLine +
                    "2. Press START RUN and enter your code." + Environment.NewLine +
                    "3. Build the part." + Environment.NewLine +
                    "4. Press SUBMIT RUN.", Amber);
                return;
            }
            if (!snap.HasVolume || snap.VolumeMm3 <= 0.0)
            {
                SetStatus("This part has no solid geometry to submit yet.", Amber);
                return;
            }

            // Material is sent ONLY as the non-gating advisory, and only when the
            // advisory is enabled.
            string advisoryMaterial = (chkAdvisory != null && chkAdvisory.Checked) ? snap.MaterialName : null;

            SetBusy(true);
            SetStatus("Submitting, the server is verifying your geometry...", Dim);
            SubmitResult result = null;
            Exception error = null;
            try
            {
                result = await GauntletClient.SubmitRunAsync(
                    code, runId, snap.VolumeMm3, snap.SurfaceAreaMm2, snap.FeatureCount,
                    snap.UnitSystemCode, advisoryMaterial);
            }
            catch (Exception ex)
            {
                error = ex;
            }
            PartSnapshot submitted = snap;
            RunOnUi(delegate { FinishSubmit(result, error, submitted); });
        }

        private void FinishSubmit(SubmitResult result, Exception error, PartSnapshot snap)
        {
            try
            {
                if (error != null)
                {
                    SetStatus(FriendlyError(error), error is GauntletServerException ? Amber : Crimson);
                    return;
                }

                double elapsedSeconds = result.ElapsedMs / 1000.0;
                string text;
                if (result.IsCorrect)
                {
                    text = Inv("PASS in {0:0.00} s", elapsedSeconds);
                    if (result.Rank.HasValue) text = text + Inv("  ·  rank #{0}", result.Rank.Value);
                }
                else
                {
                    text = Inv("OUTSIDE TOLERANCE in {0:0.00} s", elapsedSeconds) + Environment.NewLine +
                        "Recorded, but it does not rank. Fix your geometry and submit again with the same code (your time keeps counting), or re-reveal for a new run.";
                }

                if (result.TargetVolumeMm3.HasValue && result.TolerancePct.HasValue)
                {
                    text = text + Environment.NewLine + Environment.NewLine +
                        Inv("Volume {0:0.00} mm3 (target {1:0.00} within {2:0.##}%)",
                            snap.VolumeMm3, result.TargetVolumeMm3.Value, result.TolerancePct.Value);
                }
                else
                {
                    text = text + Environment.NewLine + Environment.NewLine + Inv("Volume {0:0.00} mm3", snap.VolumeMm3);
                }
                text = text + Inv("  ·  Features {0}", snap.FeatureCount);

                if (result.YourMassLevel.HasValue)
                {
                    string unit = result.MassUnit ?? "";
                    text = text + Environment.NewLine +
                        "Mass " + FormatMass(result.YourMassLevel.Value, result.UnitSystem) + " " + unit;
                    if (result.TargetMassLevel.HasValue)
                        text = text + " (target " + FormatMass(result.TargetMassLevel.Value, result.UnitSystem) + " " + unit + ")";
                    text = text + Environment.NewLine + "Mass is computed from the level's density, not your part's material.";
                }

                if (result.MaterialMatches.HasValue)
                {
                    text = text + Environment.NewLine + "Advisory: material " +
                        (result.MaterialMatches.Value ? "matches" : "differs from") + " the level (not graded).";
                }

                SetStatus(text, result.IsCorrect ? GreenBright : Amber);
            }
            finally
            {
                SetBusy(false);
                FullRefreshQuiet();
            }
        }

        // ---------------------------------------------------------------------
        // Practice mass check (unranked) + reference-cube self-check
        // ---------------------------------------------------------------------

        private async void OnPracticeClick(object sender, EventArgs e)
        {
            if (busy) return;
            PartSnapshot snap;
            try { snap = PartReader.Read(swApp); }
            catch (Exception ex) { SetStatus("Could not read the part: " + ex.Message, Crimson); return; }
            if (!snap.IsPart || !snap.HasVolume || snap.VolumeMm3 <= 0.0)
            {
                SetStatus("Model a solid body first, then run the practice check.", Amber);
                return;
            }

            // Ensure the level is loaded (practice needs the level's density).
            if (level == null || !level.ExpectedDensityGcm3.HasValue)
            {
                string code = CodeFromField();
                if (code == null) return;
                SetBusy(true);
                SetStatus("Loading the level target for the practice check...", Dim);
                LevelTargets t = null;
                Exception error = null;
                try { t = await GauntletClient.GetTargetsAsync(code); }
                catch (Exception ex) { error = ex; }
                RunOnUi(delegate
                {
                    if (error != null) { SetStatus(FriendlyError(error), error is GauntletServerException ? Amber : Crimson); SetBusy(false); return; }
                    level = t;
                    SetBusy(false);
                    RunPractice(snap);
                });
                return;
            }
            RunPractice(snap);
        }

        private void RunPractice(PartSnapshot snap)
        {
            if (level == null || !level.ExpectedDensityGcm3.HasValue)
            {
                SetStatus("This level has no stored density, so a mass check is not available. Ranked verification is volume-only, so you can still submit.", Dim);
                return;
            }
            double density = level.ExpectedDensityGcm3.Value;
            double massG = (snap.VolumeMm3 / 1000.0) * density;
            bool ips = string.Equals(level.UnitSystem, "IPS", StringComparison.OrdinalIgnoreCase);
            double massLevel = ips ? massG / GauntletMath.LbToG : massG;
            string unit = string.IsNullOrEmpty(level.MassUnit) ? (ips ? "lb" : "g") : level.MassUnit;
            double tol = level.TolerancePct.HasValue && level.TolerancePct.Value > 0 ? level.TolerancePct.Value : GauntletMath.VolumeTolPct;

            string text = "PRACTICE (unranked, nothing recorded)" + Environment.NewLine + Environment.NewLine +
                "Your mass:   " + FormatMass(massLevel, level.UnitSystem) + " " + unit + Environment.NewLine;
            if (level.TargetMassLevel.HasValue && level.TargetMassLevel.Value != 0)
            {
                double target = level.TargetMassLevel.Value;
                double devPct = Math.Abs(massLevel - target) / target * 100.0;
                text = text + "Target mass: " + FormatMass(target, level.UnitSystem) + " " + unit + Environment.NewLine +
                    Inv("Difference:  {0:0.000}%  (tolerance {1:0.##}%)", devPct, tol) + Environment.NewLine + Environment.NewLine +
                    (devPct <= tol ? "WITHIN TOLERANCE. Run a ranked submit when ready." : "OUTSIDE TOLERANCE. Adjust your geometry and check again.");
                SetStatus(text, devPct <= tol ? GreenBright : Amber);
            }
            else
            {
                text = text + "This level has no stored target mass.";
                SetStatus(text, Dim);
            }
        }

        private void OnSelfCheckClick(object sender, EventArgs e)
        {
            if (busy) return;
            PartSnapshot snap;
            try { snap = PartReader.Read(swApp); }
            catch (Exception ex) { SetStatus("Could not read the part: " + ex.Message, Crimson); return; }
            if (!snap.IsPart || !snap.HasVolume || snap.VolumeMm3 <= 0.0)
            {
                SetStatus("Open a 100 mm cube part, then run the self-check.", Amber);
                return;
            }

            const double expected = 1000000.0; // 100 mm cube = 1,000,000 canonical mm3
            double devPct = Math.Abs(snap.VolumeMm3 - expected) / expected * 100.0;
            bool pass = devPct <= GauntletMath.VolumeTolPct;
            string unit = string.IsNullOrEmpty(snap.UnitSystemCode) ? "(other)" : snap.UnitSystemCode;

            string text = "REFERENCE CUBE SELF-CHECK" + Environment.NewLine + Environment.NewLine +
                "Document units:  " + unit + Environment.NewLine +
                Inv("Measured volume: {0:0.00} canonical mm3", snap.VolumeMm3) + Environment.NewLine +
                "Expected:        1000000 mm3 (100 mm cube)" + Environment.NewLine +
                Inv("Deviation:       {0:0.000}%  (tolerance {1:0.##}%)", devPct, GauntletMath.VolumeTolPct) + Environment.NewLine + Environment.NewLine +
                (pass ? "PASS. The SI -> canonical mm3 path is correct in this unit system."
                      : "FAIL. The measured volume does not match; the unit path or model is off.");

            if (level != null && level.ExpectedDensityGcm3.HasValue)
            {
                double massG = (snap.VolumeMm3 / 1000.0) * level.ExpectedDensityGcm3.Value;
                bool ips = string.Equals(level.UnitSystem, "IPS", StringComparison.OrdinalIgnoreCase);
                double massLevel = ips ? massG / GauntletMath.LbToG : massG;
                text = text + Environment.NewLine + Environment.NewLine +
                    "Computed mass at level density: " + FormatMass(massLevel, level.UnitSystem) + " " + (level.MassUnit ?? "");
            }
            SetStatus(text, pass ? GreenBright : Crimson);
        }

        private string CodeFromField()
        {
            string code = txtCode.Text == null ? "" : txtCode.Text.Trim().ToUpperInvariant();
            if (code.Length != 8)
            {
                SetStatus("Enter the 8-character code from the GAUNTLET Speedrun screen first (Reveal the challenge to get one).", Amber);
                return null;
            }
            return code;
        }

        // ---------------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------------

        private void ShowSwVersion()
        {
            string text = "SOLIDWORKS";
            try
            {
                string revision = swApp.RevisionNumber();
                int major;
                string majorPart = revision != null && revision.IndexOf('.') > 0
                    ? revision.Substring(0, revision.IndexOf('.'))
                    : revision;
                if (int.TryParse(majorPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out major))
                {
                    text = "SOLIDWORKS " + (major + 1992).ToString(CultureInfo.InvariantCulture) +
                        " (rev " + revision + ")";
                }
                else if (!string.IsNullOrEmpty(revision))
                {
                    text = "SOLIDWORKS rev " + revision;
                }
            }
            catch { }
            lblVersion.Text = text + " · add-in v" + AddinUpdate.CurrentVersion;
        }

        private async void KickUpdateCheck()
        {
            string notice = await AddinUpdate.CheckAsync();
            if (string.IsNullOrEmpty(notice)) return;
            RunOnUi(delegate
            {
                if (lblVersion != null) lblVersion.Text = lblVersion.Text + " · " + notice;
            });
        }

        private void SetBusy(bool value)
        {
            busy = value;
            btnStart.Enabled = !value;
            btnSubmit.Enabled = !value;
            btnRefresh.Enabled = !value;
            btnLoad.Enabled = !value;
            btnPractice.Enabled = !value;
            btnSelfCheck.Enabled = !value;
        }

        private void SetStatus(string text, Color color)
        {
            txtStatus.ForeColor = color;
            txtStatus.Text = text;
        }

        private void RunOnUi(Action action)
        {
            try
            {
                if (IsDisposed) return;
                if (InvokeRequired) Invoke(action);
                else action();
            }
            catch { }
        }

        private static string FriendlyError(Exception error)
        {
            if (error is GauntletServerException) return error.Message;
            Exception inner = error;
            while (inner.InnerException != null) inner = inner.InnerException;
            return "Network error posting to GAUNTLET. Check your connection." +
                Environment.NewLine + Environment.NewLine + inner.Message;
        }

        // Present mass with IPS to 4 dp (lb), metric to 2 dp (g), per TooTallToby.
        private static string FormatMass(double value, string unitSystem)
        {
            bool ips = string.Equals(unitSystem, "IPS", StringComparison.OrdinalIgnoreCase);
            return ips ? value.ToString("0.0000", CultureInfo.InvariantCulture)
                       : value.ToString("0.00", CultureInfo.InvariantCulture);
        }

        private static string Shorten(string id)
        {
            return id != null && id.Length > 8 ? id.Substring(0, 8) : id;
        }

        private static string FormatElapsed(TimeSpan elapsed)
        {
            if (elapsed.TotalSeconds < 0) elapsed = TimeSpan.Zero;
            return string.Format(CultureInfo.InvariantCulture, "{0:00}:{1:00}",
                (int)elapsed.TotalMinutes, elapsed.Seconds);
        }

        private static string Inv(string format, params object[] args)
        {
            return string.Format(CultureInfo.InvariantCulture, format, args);
        }
    }
}
