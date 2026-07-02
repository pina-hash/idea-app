using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace IdeaGauntlet
{
    /// <summary>
    /// Draws the add-in's mark at runtime, so no binary image ships in the
    /// repo: a machined hex boss with a center bore, the same original
    /// CAD-part language as the GAUNTLET site (and deliberately nothing like
    /// the SolidWorks logo or its red-on-white scheme). Rendered in the
    /// pane's IDEA-green accent on white and saved as BMP, which is what
    /// both the task pane and the Add-Ins dialog expect.
    /// </summary>
    public static class AddinIcons
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

                    float cx = width / 2f;
                    float cy = height / 2f;
                    float r = Math.Min(width, height) / 2f - 1.6f;

                    // Flat-top hexagon (the boss) + the bore circle.
                    PointF[] hex = new PointF[6];
                    for (int i = 0; i < 6; i++)
                    {
                        double a = Math.PI / 6.0 + i * Math.PI / 3.0;
                        hex[i] = new PointF(
                            cx + (float)(r * Math.Cos(a)),
                            cy + (float)(r * Math.Sin(a)));
                    }
                    using (Pen pen = new Pen(Mark, 1.7f))
                    {
                        pen.LineJoin = LineJoin.Round;
                        g.DrawPolygon(pen, hex);
                        float bore = r * 0.4f;
                        g.DrawEllipse(pen, cx - bore, cy - bore, bore * 2f, bore * 2f);
                    }
                }
                bmp.Save(path, ImageFormat.Bmp);
            }
            return path;
        }
    }
}
