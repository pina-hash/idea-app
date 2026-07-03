using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace IdeaGauntlet
{
    /// <summary>
    /// The add-in's own version and a lightweight, fully-defensive update check.
    /// The IDEA site publishes <c>/tools/tools-manifest.json</c> (see
    /// <c>static/tools</c>) listing the latest add-in version; this compares that
    /// against <see cref="CurrentVersion"/> and, when the site is newer, hands
    /// back a short notice string the pane appends to its footer.
    ///
    /// Safety: an update check must NEVER block the pane or fail the add-in load,
    /// so every path is wrapped and a failed / absent / malformed fetch is a
    /// silent no-op. It is called fire-and-forget off the UI thread.
    ///
    /// TODO(deploy): set <see cref="ManifestUrl"/> to the deployed site's absolute
    /// manifest URL (for example
    /// <c>https://your-idea-domain/tools/tools-manifest.json</c>) to turn the live
    /// check on. While it is empty the check no-ops by design, so the shipped
    /// build makes no unverified network call at startup.
    /// </summary>
    public static class AddinUpdate
    {
        /// <summary>The version this build reports (shown in the pane footer).</summary>
        public const string CurrentVersion = "1.5";

        // Empty by design: the check no-ops until a deployed manifest URL is set.
        private const string ManifestUrl = "";

        /// <summary>
        /// Returns a short "update available (vX)" notice when the manifest lists a
        /// newer add-in version, or null (no notice / any failure). Never throws.
        /// </summary>
        public static async Task<string> CheckAsync()
        {
            if (string.IsNullOrEmpty(ManifestUrl)) return null;
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                using (HttpClient http = new HttpClient())
                {
                    http.Timeout = TimeSpan.FromSeconds(8);
                    string text = await http.GetStringAsync(ManifestUrl).ConfigureAwait(false);
                    JavaScriptSerializer json = new JavaScriptSerializer();
                    Dictionary<string, object> root = json.Deserialize<Dictionary<string, object>>(text);
                    if (root == null) return null;
                    object addinObj;
                    if (!root.TryGetValue("addin", out addinObj)) return null;
                    Dictionary<string, object> addin = addinObj as Dictionary<string, object>;
                    if (addin == null) return null;
                    object versionObj;
                    if (!addin.TryGetValue("version", out versionObj) || versionObj == null) return null;
                    string latest = Convert.ToString(versionObj);
                    if (IsNewer(latest, CurrentVersion)) return "update available (v" + latest + ")";
                }
            }
            catch
            {
                // Offline, DNS, TLS, or parse failure: silent no-op by design.
            }
            return null;
        }

        // Dotted numeric compare ("1.3" > "1.2"); non-numeric parts read as 0, so a
        // malformed version never reports a false update.
        private static bool IsNewer(string candidate, string current)
        {
            int[] a = Parse(candidate);
            int[] b = Parse(current);
            int n = Math.Max(a.Length, b.Length);
            for (int i = 0; i < n; i++)
            {
                int ai = i < a.Length ? a[i] : 0;
                int bi = i < b.Length ? b[i] : 0;
                if (ai != bi) return ai > bi;
            }
            return false;
        }

        private static int[] Parse(string v)
        {
            if (string.IsNullOrEmpty(v)) return new int[0];
            string[] parts = v.Split('.');
            int[] nums = new int[parts.Length];
            for (int i = 0; i < parts.Length; i++)
            {
                int p;
                int.TryParse(parts[i], out p);
                nums[i] = p;
            }
            return nums;
        }
    }
}
