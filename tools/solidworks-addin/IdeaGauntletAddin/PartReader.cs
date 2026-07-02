using System;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace IdeaGauntlet
{
    /// <summary>
    /// A point-in-time reading of the active document. Mass properties are
    /// captured in system (SI) units exactly like the VBA macros
    /// (UseSystemUnits = true: m3 / m2 / kg) and normalized to the canonical
    /// payload units mm3 / mm2 / g, plus lb for the IPS-facing display.
    /// </summary>
    public class PartSnapshot
    {
        public string Title = "";
        public bool IsPart;
        /// <summary>Human label for the part's unit system, e.g. "IPS (in / lb)".</summary>
        public string UnitSystemLabel = "";
        /// <summary>True when the part's units are inch-family, so mass reads in lb first.</summary>
        public bool PrimaryIsImperial;
        /// <summary>True when mass properties were readable (an empty part reads as zeros).</summary>
        public bool HasMass;
        public double VolumeMm3;
        public double SurfaceAreaMm2;
        public double MassG;
        public double MassLb;
        public int FeatureCount;
        /// <summary>Applied material name (empty when none is applied). Sent on
        /// Submit; the server requires it to match the challenge's material.</summary>
        public string MaterialName = "";
        /// <summary>GAUNTLET_RUN_ID custom property, written by Start (add-in or Start macro).</summary>
        public string RunId;
    }

    public static class PartReader
    {
        /// <summary>Exact NIST conversion; the payload itself always stays in grams.</summary>
        private const double KgToLb = 2.20462262184878;

        /// <summary>Custom property the Start macro also uses, so mid-run the
        /// .bas macros and this add-in are interchangeable.</summary>
        public const string RunIdProperty = "GAUNTLET_RUN_ID";

        public static PartSnapshot Read(ISldWorks app)
        {
            PartSnapshot snap = new PartSnapshot();
            if (app == null)
            {
                snap.Title = "Not connected to SOLIDWORKS";
                return snap;
            }

            IModelDoc2 model = app.ActiveDoc as IModelDoc2;
            if (model == null)
            {
                snap.Title = "No document open";
                return snap;
            }

            try { snap.Title = model.GetTitle(); }
            catch { snap.Title = "(unnamed)"; }

            if (model.GetType() != (int)swDocumentTypes_e.swDocPART)
            {
                snap.Title = snap.Title + "  (not a part)";
                return snap;
            }
            snap.IsPart = true;

            ReadUnitSystem(model, snap);
            ReadMassProperties(model, snap);
            ReadMaterial(model, snap);

            try { snap.FeatureCount = model.GetFeatureCount(); }
            catch { snap.FeatureCount = 0; }

            snap.RunId = ReadRunId(model);
            return snap;
        }

        /// <summary>
        /// Writes the run id into the part the same way the Start macro does
        /// (text custom property, replace if present). Returns true when the
        /// value reads back correctly.
        /// </summary>
        public static bool WriteRunId(ISldWorks app, string runId)
        {
            try
            {
                IModelDoc2 model = app.ActiveDoc as IModelDoc2;
                if (model == null) return false;
                ICustomPropertyManager cpm = (ICustomPropertyManager)model.Extension.get_CustomPropertyManager("");
                cpm.Add3(RunIdProperty, (int)swCustomInfoType_e.swCustomInfoText, runId,
                    (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
                return string.Equals(ReadRunId(model), runId, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static string ReadRunId(IModelDoc2 model)
        {
            try
            {
                ICustomPropertyManager cpm = (ICustomPropertyManager)model.Extension.get_CustomPropertyManager("");
                string valOut;
                string resolvedOut;
                cpm.Get4(RunIdProperty, false, out valOut, out resolvedOut);
                if (valOut != null) valOut = valOut.Trim();
                return string.IsNullOrEmpty(valOut) ? null : valOut;
            }
            catch
            {
                return null;
            }
        }

        private static void ReadUnitSystem(IModelDoc2 model, PartSnapshot snap)
        {
            int system;
            try
            {
                system = model.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swUnitSystem);
            }
            catch
            {
                snap.UnitSystemLabel = "Unknown";
                return;
            }

            switch ((swUnitSystem_e)system)
            {
                case swUnitSystem_e.swUnitSystem_IPS:
                    snap.UnitSystemLabel = "IPS (in / lb)";
                    snap.PrimaryIsImperial = true;
                    break;
                case swUnitSystem_e.swUnitSystem_MMGS:
                    snap.UnitSystemLabel = "MMGS (mm / g)";
                    break;
                case swUnitSystem_e.swUnitSystem_CGS:
                    snap.UnitSystemLabel = "CGS (cm / g)";
                    break;
                case swUnitSystem_e.swUnitSystem_MKS:
                    snap.UnitSystemLabel = "MKS (m / kg)";
                    break;
                default:
                    // Custom system: decide the primary mass display from the
                    // length unit family. Either way both lb and g are shown.
                    snap.PrimaryIsImperial = IsImperialLength(model);
                    snap.UnitSystemLabel = snap.PrimaryIsImperial ? "Custom (inch family)" : "Custom (metric)";
                    break;
            }
        }

        private static bool IsImperialLength(IModelDoc2 model)
        {
            try
            {
                int linear = model.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swUnitsLinear);
                swLengthUnit_e unit = (swLengthUnit_e)linear;
                return unit == swLengthUnit_e.swINCHES
                    || unit == swLengthUnit_e.swFEET
                    || unit == swLengthUnit_e.swFEETINCHES
                    || unit == swLengthUnit_e.swMIL
                    || unit == swLengthUnit_e.swUIN;
            }
            catch
            {
                return false;
            }
        }

        private static void ReadMassProperties(IModelDoc2 model, PartSnapshot snap)
        {
            // THE LIVE-READOUT FIX. The macros read a one-shot IMassProperty
            // object, which works for them because running a macro commits the
            // active command first. This pane polls MID-SESSION: an
            // IMassProperty created while a command/sketch is open (or before
            // the model has been re-evaluated) returns ZEROS without throwing,
            // which is exactly the "0.0000 lb with a real part open" bug.
            //
            // Primary read is therefore GetMassProperties2, which computes
            // directly from the current geometry and reports an explicit
            // status, so "genuinely blank part" (NoBody -> zeros are truth,
            // the blank state the start check wants) is distinguishable from
            // "could not evaluate right now" (fall back, else show "-" rather
            // than fake zeros). Values are MKS (m3 / m2 / kg), normalized to
            // the same canonical mm3 / mm2 / g payload as the macros.
            try
            {
                int status = (int)swMassPropertiesStatus_e.swMassPropertiesStatus_UnknownError;
                double[] props = model.Extension.GetMassProperties2(1, out status, false) as double[];
                if (status == (int)swMassPropertiesStatus_e.swMassPropertiesStatus_OK
                    && props != null && props.Length > 5)
                {
                    // [0..2] center of mass, [3] volume m3, [4] area m2, [5] mass kg.
                    FillMass(snap, props[3], props[4], props[5]);
                    return;
                }
                if (status == (int)swMassPropertiesStatus_e.swMassPropertiesStatus_NoBody)
                {
                    FillMass(snap, 0.0, 0.0, 0.0); // truly blank part
                    return;
                }
            }
            catch
            {
                // Fall through to the one-shot object below.
            }

            // Fallback: the macros' one-shot object (kept for parity; can still
            // read zeros mid-command, but the primary path above covers that).
            try
            {
                IMassProperty mass = (IMassProperty)model.Extension.CreateMassProperty();
                if (mass == null) return;
                mass.UseSystemUnits = true; // SI: m3 / m2 / kg
                FillMass(snap, mass.Volume, mass.SurfaceArea, mass.Mass);
            }
            catch
            {
                snap.HasMass = false;
            }
        }

        private static void FillMass(PartSnapshot snap, double volumeM3, double areaM2, double massKg)
        {
            snap.VolumeMm3 = volumeM3 * 1000000000.0;    // m3 -> mm3
            snap.SurfaceAreaMm2 = areaM2 * 1000000.0;    // m2 -> mm2
            snap.MassG = massKg * 1000.0;                // kg -> g
            snap.MassLb = massKg * KgToLb;               // kg -> lb
            snap.HasMass = true;
        }

        /// <summary>
        /// The applied material's library name (for example "6061 Alloy"),
        /// empty when no material is applied. Read from the active
        /// configuration, falling back to the empty (current) config name.
        /// </summary>
        private static void ReadMaterial(IModelDoc2 model, PartSnapshot snap)
        {
            try
            {
                IPartDoc part = model as IPartDoc;
                if (part == null) return;
                string config = "";
                try { config = model.ConfigurationManager.ActiveConfiguration.Name; }
                catch { config = ""; }
                string database;
                string name = part.GetMaterialPropertyName2(config, out database);
                if (string.IsNullOrEmpty(name) && config.Length > 0)
                {
                    name = part.GetMaterialPropertyName2("", out database);
                }
                snap.MaterialName = name == null ? "" : name.Trim();
            }
            catch
            {
                snap.MaterialName = "";
            }
        }
    }
}
