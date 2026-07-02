Attribute VB_Name = "IdeaGauntletSubmit"
'==============================================================================
' IDEA // GAUNTLET, Speedrun STUDENT SUBMIT macro (SolidWorks VBA)
'==============================================================================
' What it does
'   Reads the run_id written into this part by the Start macro, reads the
'   part's mass properties (SI, via UseSystemUnits = True), feature count,
'   and APPLIED MATERIAL, prompts for the 8-char code shown on the GAUNTLET
'   Speedrun screen, and posts everything to the gauntlet_macro_submit
'   endpoint. The server times your run from the Start event to this submit
'   (both stamped server-side), checks your geometry, and verifies your applied
'   material by its DENSITY (mass / volume) against the challenge's material,
'   then returns pass/fail, your time, and your rank. Material is checked by
'   density, not name, so a custom-library material (e.g. "6061-T6 (SS)") is
'   accepted as long as its density matches.
'
'   You must run the Start macro on a blank part first. If this part has no
'   run_id, this macro will tell you to start a run.
'
' Setup (once): paste your project values into the two constants below. They
' are the same PUBLIC values the website uses, not secrets. Import this .bas as
' a new SolidWorks macro and bind it to a keyboard shortcut (Ctrl+Shift+G).
'
' Rules: ORIGINAL parts only. The code is single use and expires ~30 min after
' you reveal the challenge; re-reveal in GAUNTLET for a fresh run.
'==============================================================================

Option Explicit

' ===== EDIT THESE TWO CONSTANTS ONCE (they are NOT secret) ====================
Private Const GAUNTLET_ENDPOINT As String = _
    "https://ifxbufvugkzfxhwcwqhf.supabase.co/rest/v1/rpc/gauntlet_macro_submit"
Private Const SUPABASE_ANON_KEY As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeGJ1ZnZ1Z2t6Znhod2N3cWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTgyNzIsImV4cCI6MjA5NzQ5NDI3Mn0.0fdEON2B7NNsHjqavVJEvTXqAB9I7e3O0cS0V68asjg"
' =============================================================================

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

    ' --- Read the run_id the Start macro wrote into this part -----------------
    Dim runId As String, resolvedId As String
    On Error Resume Next
    Dim cpm As Object
    Set cpm = swModel.Extension.CustomPropertyManager("")
    cpm.Get4 "GAUNTLET_RUN_ID", False, runId, resolvedId
    On Error GoTo 0
    If Len(runId) = 0 Then
        MsgBox "No run has been started for this part. Start a run first:" & vbCrLf & vbCrLf & _
               "1. Start a new, blank part." & vbCrLf & _
               "2. Run the Start macro (Ctrl+Shift+B) and enter your code." & vbCrLf & _
               "3. Build your part." & vbCrLf & _
               "4. Run Submit again.", _
               vbExclamation, "GAUNTLET, no run started"
        Exit Sub
    End If

    ' --- Read mass properties in SI, then normalize to mm3 / mm2 / g ----------
    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True   ' SI: m^3, m^2, kg

    Dim volumeMm3 As Double, areaMm2 As Double, massG As Double
    volumeMm3 = swMass.Volume * 1000000000#      ' m^3 -> mm^3
    areaMm2 = swMass.SurfaceArea * 1000000#       ' m^2 -> mm^2
    massG = swMass.Mass * 1000#                   ' kg  -> g

    Dim featureCount As Long
    featureCount = swModel.GetFeatureCount

    ' --- Applied material: read the ACTIVE configuration through PartDoc, so a
    '     custom-library material (e.g. "6061-T6 (SS)") reads correctly. Reading
    '     via ModelDoc, or against the "" (default) config, can return empty for a
    '     custom-library material, which the old code then mistook for "no
    '     material." The server verifies the material by DENSITY (mass / volume),
    '     not by name, so an empty name here no longer blocks a materialed part.
    Dim matName As String, matDb As String
    matName = ""
    On Error Resume Next
    Dim swPart As Object
    Set swPart = swModel
    Dim activeCfg As String
    activeCfg = ""
    activeCfg = swModel.ConfigurationManager.ActiveConfiguration.Name
    matName = swPart.GetMaterialPropertyName2(activeCfg, matDb)
    If Len(Trim$(matName)) = 0 Then matName = swPart.GetMaterialPropertyName2("", matDb)
    On Error GoTo 0
    matName = Trim$(matName)

    StudentSubmit volumeMm3, areaMm2, featureCount, massG, runId, matName
End Sub

Private Sub StudentSubmit(ByVal volumeMm3 As Double, ByVal areaMm2 As Double, _
                          ByVal featureCount As Long, ByVal massG As Double, _
                          ByVal runId As String, ByVal matName As String)
    If InStr(GAUNTLET_ENDPOINT, "YOUR-PROJECT-REF") > 0 _
       Or InStr(SUPABASE_ANON_KEY, "PASTE-YOUR") > 0 Then
        MsgBox "This macro is not configured yet. Edit GAUNTLET_ENDPOINT and " & _
               "SUPABASE_ANON_KEY at the top of the macro (see the GAUNTLET Tools page).", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    Dim code As String
    code = Trim(InputBox( _
        "Enter the 8-character submit code from the GAUNTLET Speedrun screen:", _
        "GAUNTLET, Student submit"))
    If Len(code) = 0 Then Exit Sub

    Dim body As String
    body = "{""p_code"":""" & JsonEsc(UCase(code)) & """" & _
           ",""p_run_id"":""" & JsonEsc(runId) & """" & _
           ",""p_volume_mm3"":" & JNum(volumeMm3) & _
           ",""p_surface_area_mm2"":" & JNum(areaMm2) & _
           ",""p_feature_count"":" & CStr(featureCount) & _
           ",""p_mass_g"":" & JNum(massG) & _
           ",""p_material"":" & JStrOrNull(matName) & "}"

    Dim http As Object
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    If http Is Nothing Then Set http = CreateObject("MSXML2.ServerXMLHTTP")
    On Error GoTo 0
    If http Is Nothing Then
        MsgBox "Could not create an HTTP client (WinHTTP / MSXML).", vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    On Error GoTo HttpError
    http.Open "POST", GAUNTLET_ENDPOINT, False
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    http.Send body
    On Error GoTo 0

    Dim status As Long, resp As String
    status = http.Status
    resp = http.ResponseText

    If status < 200 Or status >= 300 Then
        Dim msg As String
        msg = JsonField(resp, "message")
        If Len(msg) = 0 Then msg = "Submit failed (HTTP " & status & ")."
        MsgBox msg, vbExclamation, "GAUNTLET, not submitted"
        Exit Sub
    End If

    Dim isCorrect As String, secs As String, rankS As String
    isCorrect = LCase(JsonField(resp, "is_correct"))
    secs = JsonField(resp, "score_metric")
    rankS = JsonField(resp, "rank")

    ' Material / density verdict from the server, for a debuggable result.
    Dim densOk As String, measDens As String, expDens As String
    densOk = LCase(JsonField(resp, "density_ok"))
    measDens = JsonField(resp, "measured_density_g_cm3")
    expDens = JsonField(resp, "expected_density_g_cm3")

    Dim out As String
    If isCorrect = "true" Then
        out = "PASS in " & secs & " s"
        If Len(rankS) > 0 And rankS <> "null" Then out = out & "  -  rank #" & rankS
    Else
        out = "OUTSIDE TOLERANCE in " & secs & " s"
        If densOk = "false" Then
            out = out & vbCrLf & "Wrong material: density does not match the challenge."
        End If
        out = out & vbCrLf & _
              "Recorded, but it does not rank. Fix your model and submit again with the " & _
              "same code (your time keeps counting), or re-reveal for a new run."
    End If
    out = out & vbCrLf & vbCrLf & "Volume: " & JNum(volumeMm3) & " mm3" & _
          "   Area: " & JNum(areaMm2) & " mm2" & "   Features: " & featureCount
    If Len(matName) > 0 Then
        out = out & vbCrLf & "Material: " & matName
    Else
        out = out & vbCrLf & "Material: (name not read; verified by density)"
    End If
    If Len(measDens) > 0 And measDens <> "null" Then
        out = out & vbCrLf & "Density: " & measDens & " g/cm3"
        If Len(expDens) > 0 And expDens <> "null" Then out = out & " (expected " & expDens & ")"
    End If
    MsgBox out, vbInformation, "GAUNTLET result"
    Exit Sub

HttpError:
    MsgBox "Network error posting to GAUNTLET. Check the endpoint URL and your " & _
           "connection." & vbCrLf & vbCrLf & Err.Description, vbExclamation, "GAUNTLET"
End Sub

'------------------------------------------------------------------------------
' Helpers
'------------------------------------------------------------------------------
Private Function JNum(ByVal d As Double) As String
    Dim s As String
    s = Format$(d, "0.0##########")
    JNum = Replace(s, ",", ".")
End Function

Private Function JsonEsc(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    JsonEsc = s
End Function

' A JSON string, or null when empty (so "no material applied" posts as null).
Private Function JStrOrNull(ByVal s As String) As String
    If Len(Trim$(s)) = 0 Then
        JStrOrNull = "null"
    Else
        JStrOrNull = """" & JsonEsc(Trim$(s)) & """"
    End If
End Function

Private Function JsonField(ByVal json As String, ByVal key As String) As String
    Dim k As String, p As Long, q As Long, c As String
    k = """" & key & """"
    p = InStr(json, k)
    If p = 0 Then JsonField = "": Exit Function
    p = InStr(p + Len(k), json, ":")
    If p = 0 Then JsonField = "": Exit Function
    p = p + 1
    Do While p <= Len(json)
        If Mid(json, p, 1) <> " " Then Exit Do
        p = p + 1
    Loop
    If p > Len(json) Then JsonField = "": Exit Function
    If Mid(json, p, 1) = """" Then
        ' Walk the string honoring backslash escapes, so a server message that
        ' itself contains an escaped quote (e.g. a material name in double
        ' quotes) is returned whole instead of being truncated at the first \".
        Dim out As String, ch As String
        out = ""
        q = p + 1
        Do While q <= Len(json)
            ch = Mid(json, q, 1)
            If ch = "\" And q < Len(json) Then
                Dim esc As String
                esc = Mid(json, q + 1, 1)
                Select Case esc
                    Case """": out = out & """"
                    Case "\": out = out & "\"
                    Case "/": out = out & "/"
                    Case "n": out = out & vbLf
                    Case "r": out = out & vbCr
                    Case "t": out = out & vbTab
                    Case "b": out = out & Chr(8)
                    Case "f": out = out & Chr(12)
                    Case "u"
                        If q + 5 <= Len(json) Then
                            out = out & ChrW(CLng("&H" & Mid(json, q + 2, 4)))
                            q = q + 4
                        End If
                    Case Else: out = out & esc
                End Select
                q = q + 2
            ElseIf ch = """" Then
                Exit Do
            Else
                out = out & ch
                q = q + 1
            End If
        Loop
        JsonField = out
    Else
        q = p
        Do While q <= Len(json)
            c = Mid(json, q, 1)
            If c = "," Or c = "}" Or c = "]" Then Exit Do
            q = q + 1
        Loop
        JsonField = Trim(Mid(json, p, q - p))
    End If
End Function
