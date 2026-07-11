namespace IdeaFspPawn
{
    partial class PawnWizardPanel
    {
        /// <summary>Required designer variable.</summary>
        private System.ComponentModel.IContainer components = null;

        // Fixed chrome. The per-phase content is built dynamically in
        // PawnWizardPanel.cs and mounted inside contentHost.
        private System.Windows.Forms.Panel errorBanner;
        private System.Windows.Forms.Label errorLabel;
        private System.Windows.Forms.Button errorDismissButton;
        private System.Windows.Forms.Panel progressStrip;
        private System.Windows.Forms.Button restartButton;
        private System.Windows.Forms.Button backButton;
        private System.Windows.Forms.Panel contentHost;

        /// <summary>Clean up any resources being used.</summary>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Component Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.errorBanner = new System.Windows.Forms.Panel();
            this.errorLabel = new System.Windows.Forms.Label();
            this.errorDismissButton = new System.Windows.Forms.Button();
            this.progressStrip = new System.Windows.Forms.Panel();
            this.restartButton = new System.Windows.Forms.Button();
            this.backButton = new System.Windows.Forms.Button();
            this.contentHost = new System.Windows.Forms.Panel();
            this.errorBanner.SuspendLayout();
            this.SuspendLayout();
            //
            // errorBanner (slides open from the top; height animated in code)
            //
            this.errorBanner.BackColor = System.Drawing.Color.FromArgb(255, 51, 85);
            this.errorBanner.Dock = System.Windows.Forms.DockStyle.Top;
            this.errorBanner.Height = 0;
            this.errorBanner.Visible = false;
            this.errorBanner.Controls.Add(this.errorLabel);
            this.errorBanner.Controls.Add(this.errorDismissButton);
            //
            // errorDismissButton
            //
            this.errorDismissButton.Dock = System.Windows.Forms.DockStyle.Right;
            this.errorDismissButton.Width = 76;
            this.errorDismissButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.errorDismissButton.FlatAppearance.BorderColor = System.Drawing.Color.White;
            this.errorDismissButton.FlatAppearance.BorderSize = 1;
            this.errorDismissButton.BackColor = System.Drawing.Color.FromArgb(255, 51, 85);
            this.errorDismissButton.ForeColor = System.Drawing.Color.White;
            this.errorDismissButton.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold);
            this.errorDismissButton.Text = "Dismiss";
            this.errorDismissButton.Cursor = System.Windows.Forms.Cursors.Hand;
            this.errorDismissButton.Margin = new System.Windows.Forms.Padding(0);
            this.errorDismissButton.Click += new System.EventHandler(this.OnErrorDismissClick);
            //
            // errorLabel
            //
            this.errorLabel.Dock = System.Windows.Forms.DockStyle.Fill;
            this.errorLabel.ForeColor = System.Drawing.Color.White;
            this.errorLabel.Font = new System.Drawing.Font("Segoe UI", 10F, System.Drawing.FontStyle.Bold);
            this.errorLabel.Padding = new System.Windows.Forms.Padding(10, 8, 6, 8);
            this.errorLabel.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
            //
            // progressStrip (the five phase dots; painted in code)
            //
            this.progressStrip.BackColor = System.Drawing.Color.FromArgb(26, 26, 26);
            this.progressStrip.Dock = System.Windows.Forms.DockStyle.Top;
            this.progressStrip.Height = 34;
            this.progressStrip.Controls.Add(this.restartButton);
            this.progressStrip.Controls.Add(this.backButton);
            this.progressStrip.Paint += new System.Windows.Forms.PaintEventHandler(this.OnProgressStripPaint);
            this.progressStrip.Resize += new System.EventHandler(this.OnProgressStripResize);
            //
            // backButton (go back one page; works on every step)
            //
            this.backButton.Dock = System.Windows.Forms.DockStyle.Left;
            this.backButton.Width = 76;
            this.backButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.backButton.FlatAppearance.BorderSize = 1;
            this.backButton.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(85, 85, 85);
            this.backButton.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(63, 63, 63);
            this.backButton.BackColor = System.Drawing.Color.FromArgb(38, 38, 38);
            this.backButton.ForeColor = System.Drawing.Color.FromArgb(200, 200, 200);
            this.backButton.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.backButton.Text = "‹ BACK";
            this.backButton.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.backButton.Cursor = System.Windows.Forms.Cursors.Hand;
            this.backButton.Margin = new System.Windows.Forms.Padding(0);
            this.backButton.TabStop = false;
            this.backButton.Visible = false;
            this.backButton.Click += new System.EventHandler(this.OnBackClick);
            //
            // restartButton (always-available "start over"; fixes a stuck pane)
            //
            this.restartButton.Dock = System.Windows.Forms.DockStyle.Right;
            this.restartButton.Width = 104;
            this.restartButton.FlatStyle = System.Windows.Forms.FlatStyle.Flat;
            this.restartButton.FlatAppearance.BorderSize = 1;
            this.restartButton.FlatAppearance.BorderColor = System.Drawing.Color.FromArgb(85, 85, 85);
            this.restartButton.FlatAppearance.MouseOverBackColor = System.Drawing.Color.FromArgb(63, 63, 63);
            this.restartButton.BackColor = System.Drawing.Color.FromArgb(38, 38, 38);
            this.restartButton.ForeColor = System.Drawing.Color.FromArgb(200, 200, 200);
            this.restartButton.Font = new System.Drawing.Font("Segoe UI", 8.5F, System.Drawing.FontStyle.Bold);
            this.restartButton.Text = "↺ START OVER";
            this.restartButton.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.restartButton.Cursor = System.Windows.Forms.Cursors.Hand;
            this.restartButton.Margin = new System.Windows.Forms.Padding(0);
            this.restartButton.TabStop = false;
            this.restartButton.Visible = false;
            this.restartButton.Click += new System.EventHandler(this.OnRestartClick);
            //
            // contentHost (the current phase's screen)
            //
            this.contentHost.BackColor = System.Drawing.Color.FromArgb(26, 26, 26);
            this.contentHost.Dock = System.Windows.Forms.DockStyle.Fill;
            this.contentHost.AutoScroll = true;
            //
            // PawnWizardPanel
            //
            this.BackColor = System.Drawing.Color.FromArgb(26, 26, 26);
            this.ForeColor = System.Drawing.Color.White;
            this.Font = new System.Drawing.Font("Segoe UI", 9F);
            this.Name = "PawnWizardPanel";
            this.Size = new System.Drawing.Size(360, 640);
            // Fill-docked control must be FIRST in the collection so the
            // Top-docked strips above it take their space first.
            this.Controls.Add(this.contentHost);
            this.Controls.Add(this.progressStrip);
            this.Controls.Add(this.errorBanner);
            this.errorBanner.ResumeLayout(false);
            this.ResumeLayout(false);
        }

        #endregion
    }
}
