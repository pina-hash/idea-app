namespace IdeaGauntlet
{
    /// <summary>
    /// Shared numeric constants for the verification model. These are the ONE
    /// place the add-in's tolerance and unit conversions live; keep them in sync
    /// with the VBA macros (GAUNTLET_VOLUME_TOL_PCT / M3_TO_MM3) and the server
    /// (gauntlet_macro_submit c_volume_tol_pct, 1 m^3 = 1e9 mm^3).
    /// </summary>
    internal static class GauntletMath
    {
        /// <summary>SI m^3 -> canonical cubic mm (the payload's volume unit).</summary>
        public const double CubicMToCubicMm = 1000000000.0;

        /// <summary>SI m^2 -> mm^2.</summary>
        public const double SquareMToSquareMm = 1000000.0;

        /// <summary>
        /// Shared RELATIVE volume tolerance, percent. Ranked verification passes
        /// when |measured - target| &lt;= target * VolumeTolPct / 100 (a level may
        /// override server-side via answer.tolerance_pct). Keep in sync across
        /// layers.
        /// </summary>
        public const double VolumeTolPct = 0.5;

        /// <summary>Exact NIST pound-to-gram, for displaying mass in IPS levels.</summary>
        public const double LbToG = 453.59237;

        /// <summary>1 lb/in^3 = 27.679904653 g/cm^3 (IPS density normalization).</summary>
        public const double LbIn3ToGcm3 = 27.679904653;
    }
}
