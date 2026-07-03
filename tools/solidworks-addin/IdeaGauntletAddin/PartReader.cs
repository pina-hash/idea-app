using System;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace IdeaGauntlet
{
    /// <summary>
    /// A point-in-time reading of the active document. GEOMETRY ONLY on the
    /// verification path: volume and surface area are captured on an explicit SI
    /// basis (UseSystemUnits = true -> m3 / m2) and converted ONCE to canonical
    /// mm3 / mm2 (GauntletMath). The part's assigned material and its
    /// material-derived mass are NOT read for verification or mass display: mass
    /// is computed from the LEVEL's density (see TaskPaneControl). The material
    /// NAME is read only when explicitly requested for the optional, non-gating
    /// material advisory.
    /// </summary>
    public class PartSnapshot
    {
        public string Title = "";
        public bool IsPart;
        /// <summary>Human label for the document's unit system, e.g. "IPS (in / lb)".</summary>
        public string UnitSystemLabel = "";
        /// <summary>Document unit system, informational only: "IPS", "MMGS", or "".
        /// The verification/mass path never branches on it.</summary>
        public string UnitSystemCode = "";
        /// <summary>True when the document's length unit is inch-family (display only).</summary>
        public bool PrimaryIsImperial;
        /// <summary>True when a solid volume was readable (an empty part reads as zero).</summary>
        public bool HasVolume;
        public double VolumeMm3;
        public double SurfaceAreaMm2;
        public int FeatureCount;
        /// <summary>Applied material name, read ONLY for the optional advisory
        /// (empty otherwise). Never used to verify or to compute mass.</summary>
        public string MaterialName = "";
        /// <summary>GAUNTLET_RUN_ID custom property, written by Start (add-in or Start macro).</summary>
        public string RunId;
    }

    public static class PartReader
    {
        /// <summary>Custom property the Start macro also uses, so mid-run the
        /// .bas macros and this add-in are interchangeable.</summary>
        public const string RunIdProperty = "GAUNTLET_RUN_ID";

        /// <param name="includeMaterial">Read the applied material NAME for the
        /// optional advisory. Off by default so the normal path never touches the
        /// part's material.</param>
        public static PartSnapshot Read(ISldWorks app, bool includeMaterial = false)
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
            ReadGeometry(model, snap);
            if (includeMaterial) ReadMaterial(model, snap);

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
                    snap.UnitSystemCode = "IPS";
                    break;
                case swUnitSystem_e.swUnitSystem_MMGS:
                    snap.UnitSystemLabel = "MMGS (mm / g)";
                    snap.UnitSystemCode = "MMGS";
                    break;
                case swUnitSystem_e.swUnitSystem_CGS:
                    snap.UnitSystemLabel = "CGS (cm / g)";
                    break;
                case swUnitSystem_e.swUnitSystem_MKS:
                    snap.UnitSystemLabel = "MKS (m / kg)";
                    break;
                default:
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

        private static void ReadGeometry(IModelDoc2 model, PartSnapshot snap)
        {
            // Primary read is GetMassProperties2, which computes directly from the
            // current geometry and reports an explicit status, so a genuinely blank
            // part (NoBody -> zeros are truth) is distinguishable from "could not
            // evaluate right now". Values are SI (m3 / m2), converted once to
            // canonical mm3 / mm2. No branch on the document display unit system.
            try
            {
                int status = (int)swMassPropertiesStatus_e.swMassPropertiesStatus_UnknownError;
                double[] props = model.Extension.GetMassProperties2(1, out status, false) as double[];
                if (status == (int)swMassPropertiesStatus_e.swMassPropertiesStatus_OK
                    && props != null && props.Length > 5)
                {
                    // [0..2] center of mass, [3] volume m3, [4] area m2, [5] mass kg.
                    FillGeometry(snap, props[3], props[4]);
                    return;
                }
                if (status == (int)swMassPropertiesStatus_e.swMassPropertiesStatus_NoBody)
                {
                    FillGeometry(snap, 0.0, 0.0); // truly blank part
                    return;
                }
            }
            catch
            {
                // Fall through to the one-shot object below.
            }

            try
            {
                IMassProperty mass = (IMassProperty)model.Extension.CreateMassProperty();
                if (mass == null) return;
                mass.UseSystemUnits = true; // SI: m3 / m2 / kg
                FillGeometry(snap, mass.Volume, mass.SurfaceArea);
            }
            catch
            {
                snap.HasVolume = false;
            }
        }

        private static void FillGeometry(PartSnapshot snap, double volumeM3, double areaM2)
        {
            snap.VolumeMm3 = volumeM3 * GauntletMath.CubicMToCubicMm;    // m3 -> canonical mm3
            snap.SurfaceAreaMm2 = areaM2 * GauntletMath.SquareMToSquareMm; // m2 -> mm2
            snap.HasVolume = true;
        }

        /// <summary>
        /// The applied material's library name, read ONLY for the optional
        /// non-gating advisory (never to verify or to compute mass). Read from the
        /// active configuration via IPartDoc; empty when none is applied.
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
