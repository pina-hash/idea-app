Attribute VB_Name = "IdeaGauntletSubmit"
'==============================================================================
' IDEA // GAUNTLET, Speedrun STUDENT SUBMIT macro (SolidWorks VBA)
'==============================================================================
' Three actions live here (run from Tools > Macro > Run, pick the method):
'
'   main                  RANKED submit. Reads the run_id the Start macro wrote,
'                         reads ONLY the part's geometry (volume, on an explicit
'                         SI basis), and posts it. Ranked verification is VOLUME
'                         ONLY: measured volume vs the level's stored expected
'                         volume within tolerance. It NEVER reads the part's
'                         assigned material or its density. Mass is computed by
'                         the server from the LEVEL's density and shown for
'                         reference. Bind this to Ctrl+Shift+D.
'
'   PracticeMassVerify    UNRANKED. Computes your mass as measured volume x the
'                         LEVEL's density and reports how close you are to the
'                         level's target mass. Writes nothing, ranks nothing,
'                         blocks nothing. Use it to dial in a part before a
'                         ranked run.
'
'   ReferenceCubeSelfCheck  Proves the unit path: reads a 100 mm cube and asserts
'                         it measures 1,000,000 canonical cubic mm within
'                         tolerance, printing the measured canonical volume. Run
'                         it in an IPS document and an MMGS document; both must
'                         report 1,000,000.
'
' Setup (once): the two constants below are the same PUBLIC values the website
' uses, not secrets. Import this .bas as a macro; bind main to Ctrl+Shift+D.
'==============================================================================

Option Explicit

' ===== EDIT THESE CONSTANTS ONCE (they are NOT secret) ========================
Private Const GAUNTLET_ENDPOINT As String = _
    "https://ifxbufvugkzfxhwcwqhf.supabase.co/rest/v1/rpc/gauntlet_macro_submit"
Private Const GAUNTLET_TARGETS_ENDPOINT As String = _
    "https://ifxbufvugkzfxhwcwqhf.supabase.co/rest/v1/rpc/gauntlet_run_targets"
Private Const SUPABASE_ANON_KEY As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeGJ1ZnZ1Z2t6Znhod2N3cWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTgyNzIsImV4cCI6MjA5NzQ5NDI3Mn0.0fdEON2B7NNsHjqavVJEvTXqAB9I7e3O0cS0V68asjg"
' =============================================================================

' Relative volume tolerance (percent). KEEP IN SYNC with the server
' (gauntlet_macro_submit c_volume_tol_pct) and the C# add-in
' (GauntletMath.VolumeTolPct). Preview-only here (practice + the cube
' self-check); the server constant governs ranked pass/fail.
Private Const GAUNTLET_VOLUME_TOL_PCT As Double = 0.1

' Canonical unit conversion: extract on an SI basis and convert ONCE.
Private Const M3_TO_MM3 As Double = 1000000000#   ' 1 m^3  = 1e9 mm^3
Private Const M2_TO_MM2 As Double = 1000000#       ' 1 m^2  = 1e6 mm^2
Private Const LB_TO_G As Double = 453.59237#

Private Const swDocPART As Long = 1

'==============================================================================
' ACTION 1: RANKED SUBMIT (bind to Ctrl+Shift+D)
'==============================================================================
Sub main()
    Dim swModel As Object
    Set swModel = ActivePart()
    If swModel Is Nothing Then Exit Sub

    ' Read the run_id the Start macro wrote into this part.
    Dim runId As String, resolvedId As String
    On Error Resume Next
    Dim cpm As Object
    Set cpm = swModel.Extension.CustomPropertyManager("")
    cpm.Get4 "GAUNTLET_RUN_ID", False, runId, resolvedId
    On Error GoTo 0
    If Len(runId) = 0 Then
        MsgBox "No run has been started for this part. Start a run first:" & vbCrLf & vbCrLf & _
               "1. Start a new, blank part." & vbCrLf & _
               "2. Run the Start macro (Ctrl+Shift+S) and enter your code." & vbCrLf & _
               "3. Build your part." & vbCrLf & _
               "4. Run Submit again.", _
               vbExclamation, "GAUNTLET, no run started"
        Exit Sub
    End If

    ' Geometry ONLY. No material read, no material-derived mass.
    Dim volumeMm3 As Double, areaMm2 As Double
    volumeMm3 = ReadCanonicalVolume(swModel)
    If volumeMm3 < 0 Then
        MsgBox "Could not read a solid volume from this part. Make sure it has a " & _
               "single solid body, then submit again. (Nothing was recorded.)", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If
    areaMm2 = ReadCanonicalArea(swModel)

    Dim featureCount As Long
    featureCount = swModel.GetFeatureCount

    ' Document unit system is informational telemetry only (the server never gates
    ' on it and the comparison never branches on it). 4 = IPS, 3 = MMGS.
    Dim unitSys As String
    unitSys = DocUnitSystem(swModel)

    If Not Configured() Then Exit Sub

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
           ",""p_unit_system"":" & JStrOrNull(unitSys) & "}"

    Dim status As Long, resp As String
    resp = HttpPost(GAUNTLET_ENDPOINT, body, status)
    If status = -1 Then Exit Sub  ' HttpPost already messaged
    If status < 200 Or status >= 300 Then
        Dim emsg As String
        emsg = JsonField(resp, "message")
        If Len(emsg) = 0 Then emsg = "Submit failed (HTTP " & status & ")."
        MsgBox emsg, vbExclamation, "GAUNTLET, not submitted"
        Exit Sub
    End If

    Dim isCorrect As String, secs As String, rankS As String
    isCorrect = LCase(JsonField(resp, "is_correct"))
    secs = JsonField(resp, "score_metric")
    rankS = JsonField(resp, "rank")

    Dim yourMass As String, targMass As String, massUnit As String, lvlUnits As String
    yourMass = JsonField(resp, "your_mass_level")
    targMass = JsonField(resp, "target_mass_level")
    massUnit = JsonField(resp, "mass_unit")
    lvlUnits = JsonField(resp, "unit_system")

    Dim out As String
    If isCorrect = "true" Then
        out = "PASS in " & secs & " s"
        If Len(rankS) > 0 And rankS <> "null" Then out = out & "  -  rank #" & rankS
    Else
        out = "OUTSIDE TOLERANCE in " & secs & " s" & vbCrLf & _
              "Recorded, but it does not rank. Fix your model and submit again with the " & _
              "same code (your time keeps counting), or re-reveal for a new run."
    End If
    out = out & vbCrLf & vbCrLf & _
          "Volume: " & JNum(volumeMm3) & " mm3   Features: " & featureCount
    If Len(yourMass) > 0 And yourMass <> "null" Then
        out = out & vbCrLf & "Your mass: " & yourMass & " " & massUnit
        If Len(targMass) > 0 And targMass <> "null" Then _
            out = out & "   (target " & targMass & " " & massUnit & ")"
        out = out & vbCrLf & "Mass is computed from the level's density, not your part's material."
    End If
    MsgBox out, vbInformation, "GAUNTLET result"
End Sub

'==============================================================================
' ACTION 2: UNRANKED PRACTICE MASS VERIFY (run from Tools > Macro > Run)
'==============================================================================
Sub PracticeMassVerify()
    Dim swModel As Object
    Set swModel = ActivePart()
    If swModel Is Nothing Then Exit Sub

    Dim volumeMm3 As Double
    volumeMm3 = ReadCanonicalVolume(swModel)
    If volumeMm3 < 0 Then
        MsgBox "Could not read a solid volume from this part. Model a solid body first.", _
               vbExclamation, "GAUNTLET practice"
        Exit Sub
    End If

    If Not Configured() Then Exit Sub

    Dim code As String
    code = Trim(InputBox( _
        "PRACTICE (unranked). Enter your level's 8-char code to compare your mass " & _
        "to the target. Nothing is submitted or recorded.", "GAUNTLET, Practice mass verify"))
    If Len(code) = 0 Then Exit Sub

    Dim tj As String
    tj = FetchTargets(code)
    If Len(tj) = 0 Then Exit Sub  ' FetchTargets already messaged

    Dim densGcm3 As Double, unitSys As String, massUnit As String, tolPct As Double
    densGcm3 = ValInv(JsonField(tj, "expected_density_g_cm3"))
    unitSys = UCase(JsonField(tj, "unit_system"))
    massUnit = JsonField(tj, "mass_unit")
    tolPct = ValInv(JsonField(tj, "tolerance_pct"))
    If tolPct <= 0 Then tolPct = GAUNTLET_VOLUME_TOL_PCT

    If densGcm3 <= 0 Then
        MsgBox "This level has no stored density, so a mass check is not available. " & _
               "Ranked verification is volume-only, so you can still submit normally.", _
               vbInformation, "GAUNTLET practice"
        Exit Sub
    End If

    Dim yourMassG As Double, yourMassLevel As Double, targMassLevel As Double
    yourMassG = (volumeMm3 / 1000#) * densGcm3           ' cm3 x g/cm3 = g
    targMassLevel = ValInv(JsonField(tj, "target_mass_level"))
    If unitSys = "IPS" Then
        yourMassLevel = yourMassG / LB_TO_G
    Else
        yourMassLevel = yourMassG
    End If

    ' Mass tolerance equals volume tolerance (density is a constant), so compare
    ' the computed mass to the target within the same relative percent.
    Dim pass As Boolean, devPct As Double
    If targMassLevel <> 0 Then
        devPct = Abs(yourMassLevel - targMassLevel) / targMassLevel * 100#
        pass = devPct <= tolPct
    End If

    Dim out As String
    out = "PRACTICE (unranked, nothing recorded)" & vbCrLf & vbCrLf & _
          "Your mass:   " & JNum(yourMassLevel) & " " & massUnit & vbCrLf & _
          "Target mass: " & JNum(targMassLevel) & " " & massUnit & vbCrLf & _
          "Difference:  " & JNum(devPct) & " %  (tolerance " & JNum(tolPct) & " %)" & vbCrLf & vbCrLf
    If pass Then
        out = out & "WITHIN TOLERANCE. You are dialed in; run a ranked submit when ready."
    Else
        out = out & "OUTSIDE TOLERANCE. Adjust your geometry and check again."
    End If
    out = out & vbCrLf & vbCrLf & "Volume: " & JNum(volumeMm3) & " mm3   " & _
          "(mass = volume x level density; your part's material is not read)"
    MsgBox out, vbInformation, "GAUNTLET, Practice mass verify"
End Sub

'==============================================================================
' ACTION 3: REFERENCE CUBE SELF-CHECK (run from Tools > Macro > Run)
'==============================================================================
Sub ReferenceCubeSelfCheck()
    Dim swModel As Object
    Set swModel = ActivePart()
    If swModel Is Nothing Then Exit Sub

    Dim volumeMm3 As Double
    volumeMm3 = ReadCanonicalVolume(swModel)
    If volumeMm3 < 0 Then
        MsgBox "Could not read a solid volume. Open a 100 mm cube part and try again.", _
               vbExclamation, "GAUNTLET self-check"
        Exit Sub
    End If

    Const EXPECTED As Double = 1000000#   ' a 100 mm cube = 1,000,000 mm3
    Dim devPct As Double, pass As Boolean
    devPct = Abs(volumeMm3 - EXPECTED) / EXPECTED * 100#
    pass = devPct <= GAUNTLET_VOLUME_TOL_PCT

    Dim unitSys As String
    unitSys = DocUnitSystem(swModel)
    If Len(unitSys) = 0 Then unitSys = "(other)"

    Dim out As String
    out = "REFERENCE CUBE SELF-CHECK" & vbCrLf & vbCrLf & _
          "Document units:  " & unitSys & vbCrLf & _
          "Measured volume: " & JNum(volumeMm3) & " canonical mm3" & vbCrLf & _
          "Expected:        1000000 mm3 (100 mm cube)" & vbCrLf & _
          "Deviation:       " & JNum(devPct) & " %  (tolerance " & JNum(GAUNTLET_VOLUME_TOL_PCT) & " %)" & vbCrLf & vbCrLf
    If pass Then
        out = out & "PASS. The SI -> canonical mm3 path is correct in this unit system."
    Else
        out = out & "FAIL. The measured volume does not match; the unit path or the model is off."
    End If

    ' Optionally show the computed mass at a level's density (enter a code).
    Dim code As String
    code = Trim(InputBox( _
        "Optional: enter a level code to also show the computed mass at that level's " & _
        "density. Leave blank to skip.", "GAUNTLET self-check, mass (optional)"))
    If Len(code) > 0 And Configured() Then
        Dim tj As String
        tj = FetchTargets(code)
        If Len(tj) > 0 Then
            Dim densGcm3 As Double, massUnit As String, unitS As String, massG As Double, massLevel As Double
            densGcm3 = ValInv(JsonField(tj, "expected_density_g_cm3"))
            massUnit = JsonField(tj, "mass_unit")
            unitS = UCase(JsonField(tj, "unit_system"))
            If densGcm3 > 0 Then
                massG = (volumeMm3 / 1000#) * densGcm3
                If unitS = "IPS" Then massLevel = massG / LB_TO_G Else massLevel = massG
                out = out & vbCrLf & vbCrLf & "Computed mass at level density: " & _
                      JNum(massLevel) & " " & massUnit
            End If
        End If
    End If

    MsgBox out, vbInformation, "GAUNTLET, Reference cube self-check"
End Sub

'==============================================================================
' Shared helpers
'==============================================================================
Private Function ActivePart() As Object
    Dim swApp As Object, swModel As Object
    On Error Resume Next
    Set swApp = GetObject(, "SldWorks.Application")
    On Error GoTo 0
    If swApp Is Nothing Then
        MsgBox "Could not connect to SolidWorks. Open SolidWorks and your part first.", _
               vbExclamation, "GAUNTLET"
        Set ActivePart = Nothing
        Exit Function
    End If
    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then
        MsgBox "No document is open. Open the PART you modeled.", vbExclamation, "GAUNTLET"
        Set ActivePart = Nothing
        Exit Function
    End If
    If swModel.GetType <> swDocPART Then
        MsgBox "The active document is not a part. Open your PART (not an assembly or drawing).", _
               vbExclamation, "GAUNTLET"
        Set ActivePart = Nothing
        Exit Function
    End If
    Set ActivePart = swModel
End Function

' Measured solid volume in CANONICAL cubic mm, extracted on an explicit SI basis
' (UseSystemUnits = True -> m^3) and converted once. Returns -1 when no solid
' volume can be read, so callers never post or pass a false zero. Never branches
' on the document display unit system.
Private Function ReadCanonicalVolume(ByVal swModel As Object) As Double
    Dim swMass As Object, vM3 As Double
    ReadCanonicalVolume = -1
    On Error Resume Next
    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True
    vM3 = swMass.Volume
    On Error GoTo 0
    If swMass Is Nothing Then Exit Function
    If vM3 <= 0# Then Exit Function
    ReadCanonicalVolume = vM3 * M3_TO_MM3
End Function

Private Function ReadCanonicalArea(ByVal swModel As Object) As Double
    Dim swMass As Object, aM2 As Double
    ReadCanonicalArea = 0#
    On Error Resume Next
    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True
    aM2 = swMass.SurfaceArea
    On Error GoTo 0
    ReadCanonicalArea = aM2 * M2_TO_MM2
End Function

' Document unit system for TELEMETRY / DISPLAY only. "IPS", "MMGS", or "".
Private Function DocUnitSystem(ByVal swModel As Object) As String
    Dim usVal As Long
    DocUnitSystem = ""
    On Error Resume Next
    usVal = swModel.GetUserPreferenceIntegerValue(125)  ' swUnitSystem
    On Error GoTo 0
    If usVal = 4 Then
        DocUnitSystem = "IPS"
    ElseIf usVal = 3 Then
        DocUnitSystem = "MMGS"
    End If
End Function

Private Function Configured() As Boolean
    If InStr(GAUNTLET_ENDPOINT, "YOUR-PROJECT-REF") > 0 _
       Or InStr(SUPABASE_ANON_KEY, "PASTE-YOUR") > 0 Then
        MsgBox "This macro is not configured yet. Edit the endpoint and anon key " & _
               "at the top of the macro (see the GAUNTLET Tools page).", vbExclamation, "GAUNTLET"
        Configured = False
    Else
        Configured = True
    End If
End Function

' GET the level targets for a code (density, target mass, tolerance, unit system).
' Returns the JSON body, or "" after messaging on failure.
Private Function FetchTargets(ByVal code As String) As String
    Dim body As String, status As Long, resp As String
    body = "{""p_code"":""" & JsonEsc(UCase(code)) & """}"
    resp = HttpPost(GAUNTLET_TARGETS_ENDPOINT, body, status)
    If status = -1 Then FetchTargets = "": Exit Function
    If status < 200 Or status >= 300 Then
        Dim emsg As String
        emsg = JsonField(resp, "message")
        If Len(emsg) = 0 Then emsg = "Could not read the level (HTTP " & status & ")."
        MsgBox emsg, vbExclamation, "GAUNTLET"
        FetchTargets = ""
        Exit Function
    End If
    FetchTargets = resp
End Function

' POST a JSON body; returns the response text and sets status. status = -1 means
' the request could not be sent (already messaged), so callers should stop.
Private Function HttpPost(ByVal endpoint As String, ByVal body As String, ByRef status As Long) As String
    Dim http As Object
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    If http Is Nothing Then Set http = CreateObject("MSXML2.ServerXMLHTTP")
    On Error GoTo 0
    If http Is Nothing Then
        MsgBox "Could not create an HTTP client (WinHTTP / MSXML).", vbExclamation, "GAUNTLET"
        status = -1
        HttpPost = ""
        Exit Function
    End If

    On Error GoTo HttpError
    http.Open "POST", endpoint, False
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    http.Send body
    On Error GoTo 0

    status = http.status
    HttpPost = http.ResponseText
    Exit Function

HttpError:
    MsgBox "Network error posting to GAUNTLET. Check your connection." & vbCrLf & vbCrLf & _
           Err.Description, vbExclamation, "GAUNTLET"
    status = -1
    HttpPost = ""
End Function

'------------------------------------------------------------------------------
' JSON + number helpers
'------------------------------------------------------------------------------
Private Function JNum(ByVal d As Double) As String
    Dim s As String
    s = Format$(d, "0.0##########")
    JNum = Replace(s, ",", ".")
End Function

' Parse a decimal that always uses "." regardless of the machine's locale.
Private Function ValInv(ByVal s As String) As Double
    If Len(Trim$(s)) = 0 Then ValInv = 0: Exit Function
    ValInv = Val(Replace(Trim$(s), ",", "."))
End Function

Private Function JsonEsc(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    JsonEsc = s
End Function

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
        Dim out As String, ch As String, esc As String
        out = ""
        q = p + 1
        Do While q <= Len(json)
            ch = Mid(json, q, 1)
            If ch = "\" And q < Len(json) Then
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
