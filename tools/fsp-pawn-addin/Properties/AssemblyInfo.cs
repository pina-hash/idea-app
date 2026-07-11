using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

[assembly: AssemblyTitle("IDEA FSP Pawn Build SolidWorks Add-in")]
[assembly: AssemblyDescription("Guided chess-pawn build wizard task pane for FSP students")]
[assembly: AssemblyCompany("Bosco Tech IDEA")]
[assembly: AssemblyProduct("FspPawnAddin")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

// Only the add-in class itself is COM-visible (it opts in with [ComVisible(true)]).
[assembly: ComVisible(false)]

// Typelib id for regasm; the add-in class has its own CLSID in FspPawnAddin.cs.
// Both are unique to this add-in (neither matches the GAUNTLET add-in).
[assembly: Guid("7B02B5A2-D73C-45E8-A4ED-0DB5E69BD802")]

// Stated explicitly because the fallback build script compiles with the in-box
// framework csc, which does not synthesize this attribute (MSBuild would).
// The csproj sets GenerateTargetFrameworkAttribute=false to avoid a duplicate.
[assembly: TargetFramework(".NETFramework,Version=v4.8", FrameworkDisplayName = ".NET Framework 4.8")]
