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
            // Mirrors the macros: UseSystemUnits = true reads SI (m3 / m2 / kg)
            // regardless of the document's display units, so the payload is
            // identical whether the student models in IPS or MMGS. An empty
            // part throws or returns null here; that reads as zero volume,
            // which is exactly the blank state the start check wants.
            try
            {
                IMassProperty mass = (IMassProperty)model.Extension.CreateMassProperty();
                if (mass == null) return;
                mass.UseSystemUnits = true;
                snap.VolumeMm3 = mass.Volume * 1000000000.0;   // m3 -> mm3
                snap.SurfaceAreaMm2 = mass.SurfaceArea * 1000000.0; // m2 -> mm2
                double kg = mass.Mass;
                snap.MassG = kg * 1000.0;                      // kg -> g
                snap.MassLb = kg * KgToLb;                     // kg -> lb
                snap.HasMass = true;
            }
            catch
            {
                snap.HasMass = false;
            }
        }
    }
}
