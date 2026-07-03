Attribute VB_Name = "IdeaGauntletAuthor"
'==============================================================================
' IDEA // GAUNTLET, AUTHOR CAPTURE macro (SolidWorks VBA)
'==============================================================================
' What it does
'   Reads the active PART's mass properties (SI, via UseSystemUnits = True)
'   and feature count, asks for a density, and prints canonical
'   volume_mm3 / surface_area_mm2 / feature_count / mass_g to a message box
'   AND the clipboard, for seeding a real challenge. No server call, no
'   configuration needed.
'
' Setup (once): in SolidWorks, Tools > Macro > New, Import File this .bas,
' delete the leftover blank module, save as a .swp. Run the "main" sub.
'==============================================================================

Option Explicit

Private Const swDocPART As Long = 1

Sub main()
    Dim swApp As Object
    Dim swModel As Object
    Dim swMass As Object

    On Error Resume Next
    Set swApp = GetObject(, "SldWorks.Application")
    On Error GoTo 0
    If swApp Is Nothing Then
        MsgBox "Could not connect to SolidWorks. Open SolidWorks and your part first.", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then
        MsgBox "No document is open. Open the PART you modeled.", vbExclamation, "GAUNTLET"
        Exit Sub
    End If
    If swModel.GetType <> swDocPART Then
        MsgBox "The active document is not a part. Open your PART (not an assembly or drawing).", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True   ' SI: m^3, m^2, kg

    Dim volumeMm3 As Double, areaMm2 As Double
    volumeMm3 = swMass.Volume * 1000000000#      ' m^3 -> mm^3
    areaMm2 = swMass.SurfaceArea * 1000000#       ' m^2 -> mm^2

    Dim featureCount As Long
    featureCount = swModel.GetFeatureCount

    ' Applied material's exact library name: the challenge should carry this
    ' verbatim, because student submits must match it (0026 material gate).
    Dim matName As String, matDb As String
    matName = ""
    On Error Resume Next
    matName = swModel.GetMaterialPropertyName2("", matDb)
    On Error GoTo 0
    matName = Trim$(matName)

    AuthorCapture volumeMm3, areaMm2, featureCount, matName
End Sub

Private Sub AuthorCapture(ByVal volumeMm3 As Double, ByVal areaMm2 As Double, _
                          ByVal featureCount As Long, ByVal matName As String)
    Dim densStr As String
    densStr = Trim(InputBox( _
        "Density for this material, in g/cm3 (e.g. 2.70 for Aluminum 6061):", _
        "GAUNTLET, Author capture", "2.70"))
    If Len(densStr) = 0 Then Exit Sub

    Dim density As Double
    density = Val(Replace(densStr, ",", "."))

    Dim volumeCm3 As Double, massG As Double
    volumeCm3 = volumeMm3 / 1000#          ' mm^3 -> cm^3
    massG = volumeCm3 * density            ' g/cm3 x cm3 = g

    Dim out As String
    out = "GAUNTLET author capture (paste into the challenge answer):" & vbCrLf & vbCrLf & _
          "target_volume_mm3 : " & JNum(volumeMm3) & vbCrLf & _
          "surface_area_mm2  : " & JNum(areaMm2) & vbCrLf & _
          "feature_count     : " & featureCount & vbCrLf & _
          "density (g/cm3)    : " & JNum(density) & vbCrLf & _
          "target_mass (g)    : " & JNum(massG)
    If Len(matName) > 0 Then
        ' The exact SolidWorks library name; student submits must match it.
        out = out & vbCrLf & "material           : " & matName
    End If

    On Error Resume Next
    Dim clip As Object
    Set clip = CreateObject("MSForms.DataObject")
    clip.SetText out
    clip.PutInClipboard
    On Error GoTo 0

    MsgBox out, vbInformation, "GAUNTLET, Author capture"
End Sub

Private Function JNum(ByVal d As Double) As String
    Dim s As String
    s = Format$(d, "0.0##########")
    JNum = Replace(s, ",", ".")
End Function
