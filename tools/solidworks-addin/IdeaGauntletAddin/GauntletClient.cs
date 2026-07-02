using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace IdeaGauntlet
{
    /// <summary>
    /// A server-side rejection (invalid/expired code, non-blank part, ...).
    /// The message is the PostgREST error message, already student-readable.
    /// </summary>
    public class GauntletServerException : Exception
    {
        public GauntletServerException(string message) : base(message) { }
    }

    public class StartResult
    {
        public string RunId;
        public string StartedAt;
    }

    public class SubmitResult
    {
        public bool IsCorrect;
        public string Mode;
        public long ElapsedMs;
        public double? ScoreMetric;
        public int? Rank;
        public double? TargetVolumeMm3;
        public double? YourVolumeMm3;
        public double? TolerancePct;
        // Material-by-density verdict (0027). Correctness now requires the applied
        // material's density to match the challenge within DensityTolerancePct.
        public bool VolumeOk;
        public bool DensityOk;
        public double? MeasuredDensity;
        public double? ExpectedDensity;
        public double? DensityTolerancePct;
        public string DetectedMaterial;
    }

    /// <summary>
    /// Speaks the exact contract of the two VBA macros
    /// (static/gauntlet/idea-gauntlet-start.bas / idea-gauntlet-submit.bas):
    /// PostgREST RPC POSTs authenticated by the public anon key, with the
    /// single-use submit code as the real credential. Timing and grading are
    /// entirely server-side (migrations 0006/0016/0017).
    /// </summary>
    public static class GauntletClient
    {
        // Same PUBLIC project values the VBA macros ship with. The anon key is
        // not a secret (it is in every page of the website); the single-use,
        // expiring submit code is the credential.
        private const string SupabaseUrl = "https://ifxbufvugkzfxhwcwqhf.supabase.co";
        private const string AnonKey =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeGJ1ZnZ1Z2t6Znhod2N3cWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTgyNzIsImV4cCI6MjA5NzQ5NDI3Mn0.0fdEON2B7NNsHjqavVJEvTXqAB9I7e3O0cS0V68asjg";

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static readonly HttpClient Http = CreateClient();

        private static HttpClient CreateClient()
        {
            // Lab machines may have OS defaults that exclude TLS 1.2; Supabase requires it.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            HttpClient client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(25);
            client.DefaultRequestHeaders.Add("apikey", AnonKey);
            client.DefaultRequestHeaders.Add("Authorization", "Bearer " + AnonKey);
            return client;
        }

        /// <summary>
        /// gauntlet_macro_start(p_code, p_volume_mm3): the blank-part start event.
        /// The server stamps started_at, mints a run_id, and returns it.
        /// </summary>
        public static async Task<StartResult> StartRunAsync(string code, double volumeMm3)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["p_code"] = code;
            body["p_volume_mm3"] = volumeMm3;

            Dictionary<string, object> resp = await PostRpcAsync("gauntlet_macro_start", body).ConfigureAwait(false);

            StartResult result = new StartResult();
            result.RunId = AsString(resp, "run_id");
            result.StartedAt = AsString(resp, "started_at");
            if (string.IsNullOrEmpty(result.RunId))
            {
                throw new GauntletServerException(
                    "The server did not return a run id. Re-reveal the challenge in GAUNTLET for a fresh code, then start again.");
            }
            return result;
        }

        /// <summary>
        /// gauntlet_macro_submit(p_code, p_volume_mm3, p_run_id, p_surface_area_mm2,
        /// p_feature_count, p_mass_g, p_material): the graded submit. Elapsed time
        /// is computed server-side from the start event; correctness is verified on
        /// volume AND (since 0027) on the applied material's DENSITY (mass / volume)
        /// against the challenge's expected density. The server blocks only when
        /// there is genuinely no material; a present-but-wrong material grades as
        /// not-correct (unranked), so p_material is sent for audit/display, not as
        /// the gate. The measured density is derived server-side from p_mass_g.
        /// </summary>
        public static async Task<SubmitResult> SubmitRunAsync(
            string code, string runId, double volumeMm3, double surfaceAreaMm2, int featureCount,
            double massG, string materialName)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["p_code"] = code;
            body["p_run_id"] = runId;
            body["p_volume_mm3"] = volumeMm3;
            body["p_surface_area_mm2"] = surfaceAreaMm2;
            body["p_feature_count"] = featureCount;
            body["p_mass_g"] = massG;
            body["p_material"] = string.IsNullOrEmpty(materialName) ? null : materialName;

            Dictionary<string, object> resp = await PostRpcAsync("gauntlet_macro_submit", body).ConfigureAwait(false);

            SubmitResult result = new SubmitResult();
            result.IsCorrect = AsBool(resp, "is_correct");
            result.Mode = AsString(resp, "mode");
            result.ElapsedMs = AsLong(resp, "elapsed_ms");
            result.ScoreMetric = AsDouble(resp, "score_metric");
            result.Rank = AsInt(resp, "rank");
            result.TargetVolumeMm3 = AsDouble(resp, "target_volume_mm3");
            result.YourVolumeMm3 = AsDouble(resp, "your_volume_mm3");
            result.TolerancePct = AsDouble(resp, "tolerance_pct");
            result.VolumeOk = AsBool(resp, "volume_ok");
            result.DensityOk = AsBool(resp, "density_ok");
            result.MeasuredDensity = AsDouble(resp, "measured_density_g_cm3");
            result.ExpectedDensity = AsDouble(resp, "expected_density_g_cm3");
            result.DensityTolerancePct = AsDouble(resp, "density_tolerance_pct");
            result.DetectedMaterial = AsString(resp, "detected_material");
            return result;
        }

        private static async Task<Dictionary<string, object>> PostRpcAsync(string function, Dictionary<string, object> body)
        {
            string url = SupabaseUrl + "/rest/v1/rpc/" + function;
            StringContent content = new StringContent(Json.Serialize(body), Encoding.UTF8, "application/json");

            HttpResponseMessage response = await Http.PostAsync(url, content).ConfigureAwait(false);
            string text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                // PostgREST errors: { "code": ..., "message": ..., ... }. The RPCs
                // raise student-readable messages, so surface them verbatim.
                string message = null;
                try
                {
                    Dictionary<string, object> err = Json.Deserialize<Dictionary<string, object>>(text);
                    message = AsString(err, "message");
                }
                catch { }
                if (string.IsNullOrEmpty(message))
                {
                    message = "Request failed (HTTP " + ((int)response.StatusCode).ToString(CultureInfo.InvariantCulture) + ").";
                }
                throw new GauntletServerException(message);
            }

            Dictionary<string, object> parsed = null;
            try
            {
                parsed = Json.Deserialize<Dictionary<string, object>>(text);
            }
            catch { }
            return parsed != null ? parsed : new Dictionary<string, object>();
        }

        private static string AsString(Dictionary<string, object> dict, string key)
        {
            object value;
            if (dict == null || !dict.TryGetValue(key, out value) || value == null) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        private static bool AsBool(Dictionary<string, object> dict, string key)
        {
            object value;
            if (dict == null || !dict.TryGetValue(key, out value) || value == null) return false;
            if (value is bool) return (bool)value;
            string s = Convert.ToString(value, CultureInfo.InvariantCulture);
            return string.Equals(s, "true", StringComparison.OrdinalIgnoreCase);
        }

        private static long AsLong(Dictionary<string, object> dict, string key)
        {
            object value;
            if (dict == null || !dict.TryGetValue(key, out value) || value == null) return 0;
            try { return Convert.ToInt64(value, CultureInfo.InvariantCulture); }
            catch { return 0; }
        }

        private static double? AsDouble(Dictionary<string, object> dict, string key)
        {
            object value;
            if (dict == null || !dict.TryGetValue(key, out value) || value == null) return null;
            try { return Convert.ToDouble(value, CultureInfo.InvariantCulture); }
            catch { return null; }
        }

        private static int? AsInt(Dictionary<string, object> dict, string key)
        {
            object value;
            if (dict == null || !dict.TryGetValue(key, out value) || value == null) return null;
            try { return Convert.ToInt32(value, CultureInfo.InvariantCulture); }
            catch { return null; }
        }
    }
}
