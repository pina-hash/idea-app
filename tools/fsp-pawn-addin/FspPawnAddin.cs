using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swpublished;

namespace IdeaFspPawn
{
    /// <summary>
    /// The SOLIDWORKS COM add-in for the IDEA FSP Pawn Build Wizard. On connect
    /// it mounts the PAWN BUILD task pane; everything else lives in
    /// PawnWizardPanel. No commands, menus, or event hooks are registered, so
    /// the add-in works unchanged across SOLIDWORKS versions.
    /// Same structural pattern as the GAUNTLET add-in (tools/solidworks-addin),
    /// with its own identity and GUID.
    /// </summary>
    [ComVisible(true)]
    [Guid("4D61B045-40AC-4FE7-9B65-51C2CD1CA138")]
    [ProgId("IdeaFspPawn.FspPawnAddin")]
    [ClassInterface(ClassInterfaceType.None)]
    public class FspPawnAddin : ISwAddin
    {
        public const string AddinTitle = "IDEA FSP Pawn Build";
        public const string AddinDescription = "Pawn build wizard for FSP students";
        public const string TaskPaneTitle = "PAWN BUILD";

        private ISldWorks swApp;
        private TaskpaneView taskpaneView;
        private PawnWizardPanel paneControl;

        public bool ConnectToSW(object thisSw, int cookie)
        {
            swApp = thisSw as ISldWorks;
            if (swApp == null) return false;
            try
            {
                CreateTaskPane();
            }
            catch
            {
                return false;
            }
            return true;
        }

        public bool DisconnectFromSW()
        {
            RemoveTaskPane();
            swApp = null;
            // Standard add-in teardown: release RCWs so SOLIDWORKS can exit cleanly.
            GC.Collect();
            GC.WaitForPendingFinalizers();
            return true;
        }

        private void CreateTaskPane()
        {
            paneControl = new PawnWizardPanel(swApp);
            // Task pane tab icon (16x18 BMP path): a simple pawn silhouette,
            // generated at runtime (PawnIcons). Icon trouble must never block
            // the pane.
            string icon = string.Empty;
            try
            {
                icon = PawnIcons.Save(
                    Path.Combine(Path.GetTempPath(), "idea-fsp-pawn-taskpane.bmp"), 16, 18);
            }
            catch
            {
                icon = string.Empty;
            }
            taskpaneView = (TaskpaneView)swApp.CreateTaskpaneView2(icon, TaskPaneTitle);
            taskpaneView.DisplayWindowFromHandlex64(paneControl.Handle.ToInt64());
        }

        private void RemoveTaskPane()
        {
            try
            {
                if (paneControl != null) paneControl.ShutDown();
            }
            catch { }
            try
            {
                if (taskpaneView != null)
                {
                    taskpaneView.DeleteView();
                    Marshal.ReleaseComObject(taskpaneView);
                }
            }
            catch { }
            taskpaneView = null;
            try
            {
                if (paneControl != null) paneControl.Dispose();
            }
            catch { }
            paneControl = null;
        }

        // -----------------------------------------------------------------
        // COM registration. regasm calls these after writing the class keys;
        // they add the entries SOLIDWORKS scans for add-ins. 64-bit regasm
        // writes the 64-bit registry view, which is what SOLIDWORKS reads.
        // -----------------------------------------------------------------

        [ComRegisterFunction]
        public static void RegisterFunction(Type t)
        {
            string guid = "{" + t.GUID.ToString().ToUpperInvariant() + "}";

            using (RegistryKey key = Registry.LocalMachine.CreateSubKey(
                "SOFTWARE\\SolidWorks\\Addins\\" + guid))
            {
                key.SetValue(null, 0);
                key.SetValue("Title", AddinTitle);
                key.SetValue("Description", AddinDescription);
                // Add-Ins dialog icon: the pawn mark, generated next to the
                // DLL at registration time. Never let icon trouble fail regasm.
                try
                {
                    string dir = Path.GetDirectoryName(t.Assembly.Location);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        key.SetValue("Icon Path",
                            PawnIcons.Save(Path.Combine(dir, "idea-fsp-pawn-addin.bmp"), 16, 16));
                    }
                }
                catch { }
            }

            // Load at startup for the current user (toggleable in Tools > Add-Ins).
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                "Software\\SolidWorks\\AddInsStartup\\" + guid))
            {
                key.SetValue(null, 1, RegistryValueKind.DWord);
            }
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type t)
        {
            string guid = "{" + t.GUID.ToString().ToUpperInvariant() + "}";
            try { Registry.LocalMachine.DeleteSubKeyTree("SOFTWARE\\SolidWorks\\Addins\\" + guid, false); }
            catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree("Software\\SolidWorks\\AddInsStartup\\" + guid, false); }
            catch { }
        }
    }

    /// <summary>
    /// Draws the add-in's mark at runtime, so no binary image ships in the
    /// repo: a simple chess-pawn silhouette (head, tapered body, base) in the
    /// program's dark green on white. BMP is what both the task pane tab and
    /// the Add-Ins dialog expect.
    /// </summary>
    internal static class PawnIcons
    {
        private static readonly Color Mark = Color.FromArgb(0, 122, 61);

        /// <summary>Writes the icon (overwriting) and returns the path.</summary>
        public static string Save(string path, int width, int height)
        {
            using (Bitmap bmp = new Bitmap(width, height))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.White);

                    float w = width;
                    float h = height;
                    using (SolidBrush brush = new SolidBrush(Mark))
                    {
                        // Head.
                        float headR = w * 0.22f;
                        float headCx = w / 2f;
                        float headCy = h * 0.24f;
                        g.FillEllipse(brush, headCx - headR, headCy - headR, headR * 2f, headR * 2f);

                        // Tapered body (neck widening toward the base).
                        PointF[] body = new PointF[]
                        {
                            new PointF(w * 0.42f, h * 0.36f),
                            new PointF(w * 0.58f, h * 0.36f),
                            new PointF(w * 0.68f, h * 0.78f),
                            new PointF(w * 0.32f, h * 0.78f)
                        };
                        g.FillPolygon(brush, body);

                        // Base bar.
                        g.FillRectangle(brush, w * 0.20f, h * 0.80f, w * 0.60f, h * 0.14f);
                    }
                }
                bmp.Save(path, ImageFormat.Bmp);
            }
            return path;
        }
    }
}
