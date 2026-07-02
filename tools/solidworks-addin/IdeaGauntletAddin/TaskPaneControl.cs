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
    /// The persistent GAUNTLET task pane: live current-vs-target mass with the
    /// part's unit system surfaced (IPS reads in lb, MMGS in g; both always
    /// shown), the submit-code field, Start/Submit, and status feedback.
    /// All SOLIDWORKS COM access happens on the pane's owning (main) thread;
    /// HTTP runs async and results are marshaled back with Invoke.
    /// </summary>
    public class TaskPaneControl : UserControl
    {
        // Neutral, host-matched surface (SOLIDWORKS 2025 light theme) with a
        // restrained IDEA-green accent for identity. The web app's neon-on-void
        // palette stays on the web (src/app.css); docked inside the host it
        // clashed hard, so the pane reads as a native panel instead. The field
        // names keep their semantic roles: Green/GreenBright are the IDEA
        // accent, Cyan is the section/metadata tint, Body is ink.
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
        private Label lblMaterial;
        private Label lblMassPrimary;
        private Label lblMassSecondary;
        private Label lblGeometry;
        private TextBox txtTarget;
        private ComboBox cmbTargetUnit;
        private Label lblDelta;
        private CheckBox chkLive;
        private Button btnRefresh;
        private TextBox txtCode;
        private Button btnStart;
        private Button btnSubmit;
        private Label lblRun;
        private TextBox txtStatus;
        private Label lblVersion;
        private System.Windows.Forms.Timer timer;

        private PartSnapshot last;
        private DateTime? runStartedUtc;
        private string sessionRunId;
        private bool targetUnitTouched;
        private bool suppressUnitEvent;
        private bool busy;
        private int tick;

        public TaskPaneControl(ISldWorks app)
        {
            swApp = app;
            BuildUi();
            ShowSwVersion();
            FullRefreshQuiet();

            timer = new System.Windows.Forms.Timer();
            timer.Interval = 1000;
            timer.Tick += OnTimerTick;
            timer.Start();
        }

        /// <summary>Called by the add-in on DisconnectFromSW, before Dispose.</summary>
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
            AddRow(lblUnits, 0);
            lblMaterial = MakeLabel("Material: -", Dim, null);
            AddRow(lblMaterial, 8);

            AddRow(MakeSection("MASS"), 2);
            lblMassPrimary = MakeLabel("-", Body, new Font("Consolas", 15f, FontStyle.Bold));
            AddRow(lblMassPrimary, 0);
            lblMassSecondary = MakeLabel("", Dim, new Font("Consolas", 9f));
            AddRow(lblMassSecondary, 2);
            lblGeometry = MakeLabel("", Dim, new Font("Consolas", 8f));
            AddRow(lblGeometry, 8);

            AddRow(MakeSection("TARGET MASS (from the challenge)"), 2);
            TableLayoutPanel targetRow = new TableLayoutPanel();
            targetRow.ColumnCount = 2;
            targetRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62f));
            targetRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38f));
            targetRow.AutoSize = true;
            targetRow.Dock = DockStyle.Fill;
            targetRow.Margin = new Padding(0);
            txtTarget = MakeTextBox();
            txtTarget.TextChanged += delegate { UpdateDelta(); };
            targetRow.Controls.Add(txtTarget, 0, 0);
            cmbTargetUnit = new ComboBox();
            cmbTargetUnit.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbTargetUnit.Items.Add("g");
            cmbTargetUnit.Items.Add("lb");
            cmbTargetUnit.SelectedIndex = 0;
            cmbTargetUnit.FlatStyle = FlatStyle.Flat;
            cmbTargetUnit.BackColor = BgPanel;
            cmbTargetUnit.ForeColor = Body;
            cmbTargetUnit.Font = new Font("Consolas", 9f);
            cmbTargetUnit.Dock = DockStyle.Fill;
            cmbTargetUnit.Margin = new Padding(6, 0, 0, 0);
            cmbTargetUnit.SelectedIndexChanged += OnTargetUnitChanged;
            targetRow.Controls.Add(cmbTargetUnit, 1, 0);
            AddRow(targetRow, 2);
            lblDelta = MakeLabel("", Dim, new Font("Consolas", 8.25f));
            AddRow(lblDelta, 8);

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
            AddRow(MakeLabel("Code from the GAUNTLET Speedrun screen:", Dim, null), 2);
            txtCode = MakeTextBox();
            txtCode.CharacterCasing = CharacterCasing.Upper;
            txtCode.MaxLength = 8;
            txtCode.Font = new Font("Consolas", 12f, FontStyle.Bold);
            txtCode.TextAlign = HorizontalAlignment.Center;
            AddRow(txtCode, 6);
            // The & gives each button a standard WinForms access key (UseMnemonic
            // defaults to true), so Alt+S starts and Alt+D submits when the pane has
            // focus. Submit is captioned "(DONE)" so its mnemonic can be Alt+D,
            // mirroring the .bas macro shortcuts (Start = Ctrl+Shift+S, Submit =
            // Ctrl+Shift+D, Author = Ctrl+Shift+A). No global/SolidWorks key hooks.
            btnStart = MakeButton("&START RUN (blank part)", Green);
            btnStart.Click += OnStartClick;
            AddRow(btnStart, 4);
            btnSubmit = MakeButton("SUBMIT RUN (&DONE)", GreenBright);
            MakePrimary(btnSubmit);
            btnSubmit.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnSubmit.Click += OnSubmitClick;
            AddRow(btnSubmit, 6);
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
            txtStatus.Text = "Reveal a Speedrun challenge on the GAUNTLET site to get your code." + Environment.NewLine +
                "1. START here on a new, blank part (the server clock starts)." + Environment.NewLine +
                "2. Model the part." + Environment.NewLine +
                "3. SUBMIT. Timing and grading are server-side.";
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
            // Outline button on the neutral surface; the accent carries identity.
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

        /// <summary>The one solid (primary) button: Submit.</summary>
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
                PartSnapshot snap = PartReader.Read(swApp);
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
            lblUnits.Text = snap.IsPart ? "Units: " + snap.UnitSystemLabel : "Units: -";

            // The server verifies the material by DENSITY (0027), so surface the
            // applied material AND its measured density continuously. A material
            // reads as "present" from a real (non-default ~1.0 g/cm3) density even
            // when the library name does not read, matching the server's gate.
            double? density = MeasuredDensity(snap);
            bool hasRealDensity = density.HasValue && density.Value > 0 && Math.Abs(density.Value - 1.0) > 0.05;
            if (!snap.IsPart)
            {
                lblMaterial.Text = "Material: -";
                lblMaterial.ForeColor = Dim;
            }
            else if (string.IsNullOrEmpty(snap.MaterialName) && !hasRealDensity)
            {
                lblMaterial.Text = "Material: none applied (required to pass)";
                lblMaterial.ForeColor = Amber;
            }
            else
            {
                string name = string.IsNullOrEmpty(snap.MaterialName) ? "(name not read)" : snap.MaterialName;
                lblMaterial.Text = density.HasValue
                    ? Inv("Material: {0} · {1:0.000} g/cm3", name, density.Value)
                    : "Material: " + name;
                lblMaterial.ForeColor = Body;
            }

            if (!snap.IsPart || !snap.HasMass)
            {
                lblMassPrimary.Text = "-";
                lblMassSecondary.Text = snap.IsPart ? "(empty part reads as zero)" : "";
                lblGeometry.Text = "";
            }
            else if (snap.PrimaryIsImperial)
            {
                lblMassPrimary.Text = Inv("{0:0.0000} lb", snap.MassLb);
                lblMassSecondary.Text = Inv("= {0:0.00} g", snap.MassG);
                lblGeometry.Text = GeometryLine(snap);
            }
            else
            {
                lblMassPrimary.Text = Inv("{0:0.00} g", snap.MassG);
                lblMassSecondary.Text = Inv("= {0:0.0000} lb", snap.MassLb);
                lblGeometry.Text = GeometryLine(snap);
            }

            if (!targetUnitTouched)
            {
                suppressUnitEvent = true;
                cmbTargetUnit.SelectedIndex = snap.PrimaryIsImperial ? 1 : 0;
                suppressUnitEvent = false;
            }

            UpdateDelta();
            UpdateRunLabel();
        }

        private static string GeometryLine(PartSnapshot snap)
        {
            return Inv("Vol {0:0.00} mm3\r\nArea {1:0.00} mm2 · Features {2}",
                snap.VolumeMm3, snap.SurfaceAreaMm2, snap.FeatureCount);
        }

        /// <summary>
        /// The part's density in g/cm3 (mass / volume), mirroring what the server
        /// derives from the submitted mass and volume. Null when there is no solid
        /// geometry to divide by.
        /// </summary>
        private static double? MeasuredDensity(PartSnapshot snap)
        {
            if (snap == null || !snap.HasMass || snap.VolumeMm3 <= 0.0) return null;
            return snap.MassG / (snap.VolumeMm3 / 1000.0);
        }

        private void UpdateDelta()
        {
            if (last == null || !last.IsPart || !last.HasMass)
            {
                lblDelta.Text = "";
                return;
            }
            double target;
            if (!TryParseNumber(txtTarget.Text, out target) || target <= 0)
            {
                lblDelta.Text = "Enter the challenge's target mass to compare.";
                lblDelta.ForeColor = Dim;
                return;
            }
            bool inPounds = cmbTargetUnit.SelectedIndex == 1;
            double current = inPounds ? last.MassLb : last.MassG;
            double delta = current - target;
            double pct = delta / target * 100.0;
            lblDelta.Text = Inv("{0}{1:0.0000} {2} vs target ({3}{4:0.00}%)",
                delta >= 0 ? "+" : "-", Math.Abs(delta), inPounds ? "lb" : "g",
                pct >= 0 ? "+" : "-", Math.Abs(pct));
            // Rough guide only; the actual pass band is the challenge's server-side tolerance.
            lblDelta.ForeColor = Math.Abs(pct) <= 1.0 ? Green : Amber;
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

        private void OnTargetUnitChanged(object sender, EventArgs e)
        {
            if (suppressUnitEvent) return;
            targetUnitTouched = true;
            UpdateDelta();
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
                SetStatus("This part is not blank. Your run must start on a new, empty part so that all of your modeling happens on the clock." +
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
                    "Do not close this part; the run id lives in the open document.";
                if (last == null || string.IsNullOrEmpty(last.MaterialName))
                {
                    message = message + Environment.NewLine +
                        "Apply the challenge's material while you model; a submit without it is rejected.";
                }
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
            try { snap = PartReader.Read(swApp); }
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
            if (!snap.HasMass || snap.VolumeMm3 <= 0.0)
            {
                SetStatus("This part has no solid geometry to submit yet.", Amber);
                return;
            }

            SetBusy(true);
            SetStatus("Submitting, the server is grading your part...", Dim);
            SubmitResult result = null;
            Exception error = null;
            try
            {
                result = await GauntletClient.SubmitRunAsync(
                    code, runId, snap.VolumeMm3, snap.SurfaceAreaMm2, snap.FeatureCount, snap.MassG,
                    snap.MaterialName);
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
                    if (result.Rank.HasValue)
                    {
                        text = text + Inv("  ·  rank #{0}", result.Rank.Value);
                    }
                }
                else
                {
                    text = Inv("OUTSIDE TOLERANCE in {0:0.00} s", elapsedSeconds);
                    if (!result.DensityOk)
                    {
                        text = text + Environment.NewLine + "Wrong material: the part's density does not match the challenge.";
                    }
                    text = text + Environment.NewLine +
                        "Recorded, but it does not rank. Fix your model and submit again with the same code (your time keeps counting), or re-reveal for a new run.";
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
                text = text + Environment.NewLine +
                    Inv("Mass {0:0.00} g / {1:0.0000} lb · Area {2:0.00} mm2 · Features {3}",
                        snap.MassG, snap.MassLb, snap.SurfaceAreaMm2, snap.FeatureCount);
                text = text + Environment.NewLine + "Material " +
                    (string.IsNullOrEmpty(snap.MaterialName) ? "(name not read; verified by density)" : snap.MaterialName);
                if (result.MeasuredDensity.HasValue)
                {
                    string density = Inv("Density {0:0.0000} g/cm3", result.MeasuredDensity.Value);
                    if (result.ExpectedDensity.HasValue)
                    {
                        density = density + Inv(" (expected {0:0.0000}", result.ExpectedDensity.Value);
                        if (result.DensityTolerancePct.HasValue)
                        {
                            density = density + Inv(" +/-{0:0.##}%", result.DensityTolerancePct.Value);
                        }
                        density = density + ")";
                    }
                    text = text + Environment.NewLine + density;
                }

                SetStatus(text, result.IsCorrect ? GreenBright : Amber);
            }
            finally
            {
                SetBusy(false);
                FullRefreshQuiet();
            }
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
                    // Revision majors map to model years: 30 -> 2022, 32 -> 2024, ...
                    text = "SOLIDWORKS " + (major + 1992).ToString(CultureInfo.InvariantCulture) +
                        " (rev " + revision + ")";
                }
                else if (!string.IsNullOrEmpty(revision))
                {
                    text = "SOLIDWORKS rev " + revision;
                }
            }
            catch { }
            lblVersion.Text = text + " · add-in v1.2";
        }

        private void SetBusy(bool value)
        {
            busy = value;
            btnStart.Enabled = !value;
            btnSubmit.Enabled = !value;
            btnRefresh.Enabled = !value;
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
                if (InvokeRequired)
                {
                    Invoke(action);
                }
                else
                {
                    action();
                }
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

        private static bool TryParseNumber(string text, out double value)
        {
            value = 0;
            if (string.IsNullOrEmpty(text)) return false;
            string normalized = text.Trim().Replace(",", ".");
            return double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
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
