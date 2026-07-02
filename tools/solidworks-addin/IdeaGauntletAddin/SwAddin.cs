using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swpublished;

namespace IdeaGauntlet
{
    /// <summary>
    /// The SOLIDWORKS COM add-in. On connect it mounts the GAUNTLET task pane;
    /// everything else lives in TaskPaneControl. No commands, menus, or event
    /// hooks are registered, so the add-in works unchanged across SOLIDWORKS
    /// versions (the version is only read at runtime, for display).
    /// </summary>
    [ComVisible(true)]
    [Guid("5645DCF9-BF05-4E29-A117-978B6215FF32")]
    [ProgId("IdeaGauntlet.SwAddin")]
    [ClassInterface(ClassInterfaceType.None)]
    public class SwAddin : ISwAddin
    {
        public const string AddinTitle = "IDEA // GAUNTLET";
        public const string AddinDescription =
            "Verifies GAUNTLET Speedrun runs from the active part and submits them to the IDEA portal.";

        private ISldWorks swApp;
        private TaskpaneView taskpaneView;
        private TaskPaneControl paneControl;

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
            paneControl = new TaskPaneControl(swApp);
            // Task pane tab icon (16x18 BMP path): the hex-boss mark, generated
            // at runtime (AddinIcons). Icon trouble must never block the pane.
            string icon = string.Empty;
            try
            {
                icon = AddinIcons.Save(
                    Path.Combine(Path.GetTempPath(), "idea-gauntlet-taskpane.bmp"), 16, 18);
            }
            catch
            {
                icon = string.Empty;
            }
            taskpaneView = (TaskpaneView)swApp.CreateTaskpaneView2(icon, AddinTitle);
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
                // Add-Ins dialog icon: the hex-boss mark, generated next to the
                // DLL at registration time. Never let icon trouble fail regasm.
                try
                {
                    string dir = Path.GetDirectoryName(t.Assembly.Location);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        key.SetValue("Icon Path",
                            AddinIcons.Save(Path.Combine(dir, "idea-gauntlet-addin.bmp"), 16, 16));
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
}
