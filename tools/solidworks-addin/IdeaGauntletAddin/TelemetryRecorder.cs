using System;
using System.Collections.Generic;
using System.Diagnostics;
using SolidWorks.Interop.sldworks;

namespace IdeaGauntlet
{
    /// <summary>
    /// Fail-safe, ADD-IN-ONLY Speedrun telemetry. Captures modeling-process and
    /// integrity signals for the ACTIVE part only. Minor-appropriate scope: NO
    /// keylogging, NO screenshots, NO filesystem scraping beyond the active part's
    /// own file timestamp.
    ///
    /// HARD RULE: telemetry is best-effort and must NEVER affect a run. Every path
    /// is guarded; an exception in capture, batching, or the network can neither
    /// crash the add-in nor abort a run, and nothing here is coupled to
    /// verification. Events buffer in memory and flush to the batch RPC
    /// periodically, with a guaranteed final flush at submit.
    ///
    /// The reliable core is a per-tick model-state SNAPSHOT (volume / features /
    /// area) driven by the pane's existing refresh, so the progress-over-time
    /// stream exists even if native SOLIDWORKS event binding is unavailable. Native
    /// events (feature add/delete, undo, redo, rebuild, command) enrich it and are
    /// bound best-effort behind their own guard.
    /// </summary>
    public class TelemetryRecorder
    {
        /// <summary>Command telemetry is higher volume; a flag so it can be turned
        /// off if it ever causes lag.</summary>
        public static bool CommandTelemetryEnabled = true;

        private readonly object gate = new object();
        private ISldWorks swApp;
        private PartDoc part;
        private string code;
        private string runId;
        private bool active;
        private int seq;
        private Stopwatch clock;

        private readonly List<object> buffer = new List<object>();

        private int undoCount, redoCount, rebuilds;
        private long activeMs, idleMs, lastActivityMs;
        private double lastVolume = -1;
        private string fileCreatedUtc;

        private DPartDocEvents_AddItemNotifyEventHandler onAdd;
        private DPartDocEvents_DeleteItemNotifyEventHandler onDelete;
        private DPartDocEvents_UndoPostNotifyEventHandler onUndo;
        private DPartDocEvents_RedoPostNotifyEventHandler onRedo;
        private DPartDocEvents_RegenPostNotifyEventHandler onRegen;
        private DSldWorksEvents_CommandCloseNotifyEventHandler onCommand;

        public bool IsActive { get { return active; } }

        public void Start(ISldWorks app, IModelDoc2 model, string theCode, string theRunId)
        {
            try
            {
                Stop();
                swApp = app;
                code = theCode;
                runId = theRunId;
                seq = 0;
                clock = Stopwatch.StartNew();
                lock (gate) { buffer.Clear(); }
                undoCount = redoCount = rebuilds = 0;
                activeMs = idleMs = lastActivityMs = 0;
                lastVolume = -1;
                fileCreatedUtc = null;
                active = true;
                WireEvents(model);
                Emit("run_start", null);
            }
            catch { /* fail-safe */ }
        }

        private void WireEvents(IModelDoc2 model)
        {
            try
            {
                part = model as PartDoc;
                if (part != null)
                {
                    try
                    {
                        onAdd = new DPartDocEvents_AddItemNotifyEventHandler(OnAddItem);
                        onDelete = new DPartDocEvents_DeleteItemNotifyEventHandler(OnDeleteItem);
                        onUndo = new DPartDocEvents_UndoPostNotifyEventHandler(OnUndo);
                        onRedo = new DPartDocEvents_RedoPostNotifyEventHandler(OnRedo);
                        onRegen = new DPartDocEvents_RegenPostNotifyEventHandler(OnRegen);
                        part.AddItemNotify += onAdd;
                        part.DeleteItemNotify += onDelete;
                        part.UndoPostNotify += onUndo;
                        part.RedoPostNotify += onRedo;
                        part.RegenPostNotify += onRegen;
                    }
                    catch { /* native events unavailable: snapshots still cover it */ }
                }
                if (CommandTelemetryEnabled && swApp != null)
                {
                    try
                    {
                        onCommand = new DSldWorksEvents_CommandCloseNotifyEventHandler(OnCommandClose);
                        ((SldWorks)swApp).CommandCloseNotify += onCommand;
                    }
                    catch { }
                }
                try
                {
                    string path = model.GetPathName();
                    if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                    {
                        fileCreatedUtc = System.IO.File.GetCreationTimeUtc(path).ToString("o");
                        Emit("integrity", Kv("kind", "file_created", "utc", fileCreatedUtc));
                    }
                }
                catch { }
            }
            catch { }
        }

        private void UnwireEvents()
        {
            try
            {
                if (part != null)
                {
                    if (onAdd != null) part.AddItemNotify -= onAdd;
                    if (onDelete != null) part.DeleteItemNotify -= onDelete;
                    if (onUndo != null) part.UndoPostNotify -= onUndo;
                    if (onRedo != null) part.RedoPostNotify -= onRedo;
                    if (onRegen != null) part.RegenPostNotify -= onRegen;
                }
                if (onCommand != null && swApp != null) ((SldWorks)swApp).CommandCloseNotify -= onCommand;
            }
            catch { }
            part = null; onAdd = null; onDelete = null; onUndo = null; onRedo = null; onRegen = null; onCommand = null;
        }

        // Event handlers must never throw back into SOLIDWORKS.
        private int OnAddItem(int entityType, string name) { try { Emit("feature_add", Kv("entity", entityType, "name", name)); } catch { } return 0; }
        private int OnDeleteItem(int entityType, string name) { try { Emit("feature_delete", Kv("entity", entityType, "name", name)); } catch { } return 0; }
        private int OnUndo() { try { undoCount++; Emit("undo", null); } catch { } return 0; }
        private int OnRedo() { try { redoCount++; Emit("redo", null); } catch { } return 0; }
        private int OnRegen() { try { rebuilds++; Emit("rebuild", null); } catch { } return 0; }
        private int OnCommandClose(int command, int reason) { try { Emit("command", Kv("id", command, "reason", reason)); } catch { } return 0; }

        /// <summary>
        /// Drive from the pane's refresh tick with the current snapshot: emit a
        /// model-state snapshot when geometry changed and accrue active/idle time.
        /// </summary>
        public void OnTick(PartSnapshot snap)
        {
            if (!active) return;
            try
            {
                long now = clock != null ? clock.ElapsedMilliseconds : 0;
                bool changed = snap != null && snap.HasVolume && Math.Abs(snap.VolumeMm3 - lastVolume) > 0.001;
                if (changed)
                {
                    Emit("snapshot", Kv(
                        "volume_mm3", snap.VolumeMm3,
                        "area_mm2", snap.SurfaceAreaMm2,
                        "feature_count", snap.FeatureCount));
                    lastVolume = snap.VolumeMm3;
                    activeMs += Math.Max(0, now - lastActivityMs);
                    lastActivityMs = now;
                }
                else
                {
                    long gap = now - lastActivityMs;
                    if (gap > 4000) { idleMs += gap; lastActivityMs = now; }
                }
                MaybeFlush(false);
            }
            catch { }
        }

        private void Emit(string type, Dictionary<string, object> payload)
        {
            try
            {
                Dictionary<string, object> e = new Dictionary<string, object>();
                e["seq"] = seq++;
                e["t_ms"] = clock != null ? clock.ElapsedMilliseconds : 0;
                e["event_type"] = type;
                e["payload"] = payload != null ? payload : new Dictionary<string, object>();
                lock (gate) { buffer.Add(e); }
            }
            catch { }
        }

        private void MaybeFlush(bool force)
        {
            List<object> batch = null;
            lock (gate)
            {
                if (buffer.Count == 0) return;
                if (!force && buffer.Count < 12) return;
                batch = new List<object>(buffer);
                buffer.Clear();
            }
            var ignore = GauntletClient.PostEventsAsync(code, runId, batch); // fire-and-forget, never throws
        }

        public void Flush() { try { MaybeFlush(true); } catch { } }

        /// <summary>Final flush + summary at submit, then unwire and go idle.</summary>
        public void Stop(PartSnapshot finalSnap, SubmitResult result)
        {
            try
            {
                if (active)
                {
                    Emit("run_end", Kv("is_correct", result != null && result.IsCorrect));
                    Flush();

                    Dictionary<string, object> summary = new Dictionary<string, object>();
                    if (finalSnap != null)
                    {
                        summary["final_volume_mm3"] = finalSnap.VolumeMm3;
                        summary["feature_count"] = finalSnap.FeatureCount;
                    }
                    if (result != null && result.YourMassLevel.HasValue)
                    {
                        summary["computed_mass"] = result.YourMassLevel.Value;
                        summary["mass_unit"] = result.MassUnit;
                    }
                    summary["undo_count"] = undoCount;
                    summary["redo_count"] = redoCount;
                    summary["active_ms"] = activeMs;
                    summary["idle_ms"] = idleMs;
                    summary["rebuild_ms"] = 0;
                    summary["error_count"] = 0;
                    summary["warning_count"] = 0;
                    Dictionary<string, object> integrity = new Dictionary<string, object>();
                    if (fileCreatedUtc != null) integrity["file_created_utc"] = fileCreatedUtc;
                    summary["integrity"] = integrity;
                    var ignore = GauntletClient.PostAnalysisAsync(code, runId, summary);
                }
            }
            catch { }
            finally { UnwireEvents(); active = false; }
        }

        /// <summary>Clear state without a summary (e.g. a re-start).</summary>
        public void Stop() { try { UnwireEvents(); } catch { } active = false; }

        private static Dictionary<string, object> Kv(params object[] pairs)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            for (int i = 0; i + 1 < pairs.Length; i += 2) d[Convert.ToString(pairs[i])] = pairs[i + 1];
            return d;
        }
    }
}
