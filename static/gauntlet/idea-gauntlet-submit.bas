Attribute VB_Name = "IdeaGauntletSubmit"
'==============================================================================
' IDEA // GAUNTLET, Speedrun STUDENT SUBMIT macro (SolidWorks VBA)
'==============================================================================
' What it does
'   Reads the active PART's mass properties (SI, via UseSystemUnits = True) and
'   feature count, prompts for the 8-char submit code shown on the GAUNTLET
'   Speedrun play screen, posts the captured geometry to the
'   gauntlet_macro_submit endpoint, and shows pass/fail, your time, and rank.
'   The server measures time from when you hit Start, so model first, submit
'   after.
'
' Setup (once): in SolidWorks, Tools > Macro > New, Import File this .bas,
' delete the leftover blank module, save as a .swp. Run the "main" sub. The two
' constants below are already filled in with this project's PUBLIC values (the
' same ones the website ships to every browser, not secrets), so no editing is
' needed.
'
' Rules: ORIGINAL parts only. The submit code is single use and expires ~30
' min after you hit Start; re-reveal in GAUNTLET for a fresh run.
'==============================================================================

Option Explicit

' ===== PROJECT VALUES (public, not secret) ===================================
Private Const GAUNTLET_ENDPOINT As String = _
    "https://ifxbufvugkzfxhwcwqhf.supabase.co/rest/v1/rpc/gauntlet_macro_submit"
Private Const SUPABASE_ANON_KEY As String = _
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeGJ1ZnZ1Z2t6Znhod2N3cWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTgyNzIsImV4cCI6MjA5NzQ5NDI3Mn0.0fdEON2B7NNsHjqavVJEvTXqAB9I7e3O0cS0V68asjg"
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

    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True   ' SI: m^3, m^2, kg

    Dim volumeMm3 As Double, areaMm2 As Double, massG As Double
    volumeMm3 = swMass.Volume * 1000000000#      ' m^3 -> mm^3
    areaMm2 = swMass.SurfaceArea * 1000000#       ' m^2 -> mm^2
    massG = swMass.Mass * 1000#                   ' kg  -> g

    Dim featureCount As Long
    featureCount = swModel.GetFeatureCount

    StudentSubmit volumeMm3, areaMm2, featureCount, massG
End Sub

Private Sub StudentSubmit(ByVal volumeMm3 As Double, ByVal areaMm2 As Double, _
                          ByVal featureCount As Long, ByVal massG As Double)
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
           ",""p_volume_mm3"":" & JNum(volumeMm3) & _
           ",""p_surface_area_mm2"":" & JNum(areaMm2) & _
           ",""p_feature_count"":" & CStr(featureCount) & _
           ",""p_mass_g"":" & JNum(massG) & "}"

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

    Dim out As String
    If isCorrect = "true" Then
        out = "PASS in " & secs & " s"
        If Len(rankS) > 0 And rankS <> "null" Then out = out & "  -  rank #" & rankS
    Else
        out = "OUTSIDE TOLERANCE in " & secs & " s" & vbCrLf & _
              "Recorded, but it does not rank. Adjust your model and re-reveal for a new run."
    End If
    out = out & vbCrLf & vbCrLf & "Volume: " & JNum(volumeMm3) & " mm3" & _
          "   Area: " & JNum(areaMm2) & " mm2" & "   Features: " & featureCount
    MsgBox out, vbInformation, "GAUNTLET result"
    Exit Sub

HttpError:
    MsgBox "Network error posting to GAUNTLET. Check the endpoint URL and your " & _
           "connection." & vbCrLf & vbCrLf & Err.Description, vbExclamation, "GAUNTLET"
End Sub

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
        q = InStr(p + 1, json, """")
        If q = 0 Then JsonField = "": Exit Function
        JsonField = Mid(json, p + 1, q - p - 1)
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
