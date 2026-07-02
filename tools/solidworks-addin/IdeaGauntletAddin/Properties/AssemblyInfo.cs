using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

[assembly: AssemblyTitle("IDEA // GAUNTLET SolidWorks Add-in")]
[assembly: AssemblyDescription("Speedrun verifier task pane for the IDEA GAUNTLET portal")]
[assembly: AssemblyCompany("Bosco Tech IDEA")]
[assembly: AssemblyProduct("IdeaGauntletAddin")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

// Only the add-in class itself is COM-visible (it opts in with [ComVisible(true)]).
[assembly: ComVisible(false)]

// Typelib id for regasm; the add-in class has its own CLSID in SwAddin.cs.
[assembly: Guid("81EAF0B1-E183-4493-B1B6-F5FA56617B0F")]

// Stated explicitly because the fallback build script compiles with the in-box
// framework csc, which does not synthesize this attribute (MSBuild would).
// The csproj sets GenerateTargetFrameworkAttribute=false to avoid a duplicate.
[assembly: TargetFramework(".NETFramework,Version=v4.8", FrameworkDisplayName = ".NET Framework 4.8")]
