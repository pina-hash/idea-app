Attribute VB_Name = "IdeaGauntletStart"
'==============================================================================
' IDEA // GAUNTLET, Speedrun START macro (SolidWorks VBA)
'==============================================================================
' What it does
'   Verifies the active PART is blank (zero solid volume), then posts a start
'   event to the gauntlet_macro_start endpoint with your 8-char code. The
'   server records the start time on receipt and returns a run_id, which this
'   macro writes into the part as a custom property (GAUNTLET_RUN_ID). Build
'   your part, then run the Submit macro. The server times your run from this
'   start event to your submit, both stamped server-side, so your computer's
'   clock does not matter.
'
'   Because the part must be blank when you start, all of your modeling happens
'   on the clock. Do not close the part between starting and submitting; the
'   run_id lives in the open document and is lost if you close it.
'
' Setup (once): paste your project values into the two constants below. They
' are the same PUBLIC values the website uses, not secrets. Import this .bas as
' a new SolidWorks macro and bind it to a keyboard shortcut (Ctrl+Shift+B).
'==============================================================================

Option Explicit

' ===== EDIT THESE TWO CONSTANTS ONCE (they are NOT secret) ====================
' Same Supabase project as the Submit macro, but the gauntlet_macro_START path.
Private Const GAUNTLET_START_ENDPOINT As String = _
    "https://ifxbufvugkzfxhwcwqhf.supabase.co/rest/v1/rpc/gauntlet_macro_start"
Private Const SUPABASE_ANON_KEY As String = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeGJ1ZnZ1Z2t6Znhod2N3cWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MTgyNzIsImV4cCI6MjA5NzQ5NDI3Mn0.0fdEON2B7NNsHjqavVJEvTXqAB9I7e3O0cS0V68asjg"
' =============================================================================

Private Const swDocPART As Long = 1
Private Const swCustomInfoText As Long = 30
Private Const swCustomPropertyReplaceValue As Long = 2

Sub main()
    Dim swApp As Object
    Dim swModel As Object

    On Error Resume Next
    Set swApp = GetObject(, "SldWorks.Application")
    On Error GoTo 0
    If swApp Is Nothing Then
        MsgBox "Could not connect to SolidWorks. Open SolidWorks and a new blank part first.", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then
        MsgBox "No document is open. Start a new, empty PART to begin your run.", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If
    If swModel.GetType <> swDocPART Then
        MsgBox "The active document is not a part. Start a new, empty PART (not an assembly or drawing).", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    ' --- Blank check: a run may only start on a part with zero solid volume ----
    Dim volumeMm3 As Double
    volumeMm3 = 0#
    On Error Resume Next
    Dim swMass As Object
    Set swMass = swModel.Extension.CreateMassProperty
    swMass.UseSystemUnits = True
    volumeMm3 = swMass.Volume * 1000000000#      ' m^3 -> mm^3
    On Error GoTo 0

    If volumeMm3 > 0# Then
        MsgBox "This part is not blank. Your run must start on a new, empty part " & _
               "so that all of your modeling happens on the clock." & vbCrLf & vbCrLf & _
               "Start a brand new part with nothing modeled yet, then run Start again.", _
               vbExclamation, "GAUNTLET, cannot start"
        Exit Sub
    End If

    If InStr(GAUNTLET_START_ENDPOINT, "YOUR-PROJECT-REF") > 0 _
       Or InStr(SUPABASE_ANON_KEY, "PASTE-YOUR") > 0 Then
        MsgBox "This macro is not configured yet. Edit GAUNTLET_START_ENDPOINT and " & _
               "SUPABASE_ANON_KEY at the top of the macro (see the GAUNTLET Tools page).", _
               vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    Dim code As String
    code = Trim(InputBox( _
        "Enter the 8-character code from the GAUNTLET Speedrun screen to START your run:", _
        "GAUNTLET, Start run"))
    If Len(code) = 0 Then Exit Sub

    ' --- Post the start event; server records start time and returns run_id ----
    Dim body As String
    body = "{""p_code"":""" & JsonEsc(UCase(code)) & """" & _
           ",""p_volume_mm3"":" & JNum(volumeMm3) & "}"

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
    http.Open "POST", GAUNTLET_START_ENDPOINT, False
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "apikey", SUPABASE_ANON_KEY
    http.SetRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    http.Send body
    On Error GoTo 0

    Dim status As Long, resp As String
    status = http.Status
    resp = http.ResponseText

    If status < 200 Or status >= 300 Then
        Dim errMsg As String
        errMsg = JsonField(resp, "message")
        If Len(errMsg) = 0 Then errMsg = "Could not start the run (HTTP " & status & ")."
        MsgBox errMsg, vbExclamation, "GAUNTLET, not started"
        Exit Sub
    End If

    Dim runId As String
    runId = JsonField(resp, "run_id")
    If Len(runId) = 0 Then
        MsgBox "The server did not return a run id. Try revealing the challenge again " & _
               "in GAUNTLET for a fresh code, then start again.", vbExclamation, "GAUNTLET"
        Exit Sub
    End If

    ' --- Write the run_id into the part so Submit can read it later -----------
    On Error Resume Next
    Dim cpm As Object
    Set cpm = swModel.Extension.CustomPropertyManager("")
    cpm.Add3 "GAUNTLET_RUN_ID", swCustomInfoText, runId, swCustomPropertyReplaceValue
    On Error GoTo 0

    ' --- Material reminder: Submit is rejected without the challenge's material
    Dim matName As String, matDb As String
    matName = ""
    On Error Resume Next
    matName = swModel.GetMaterialPropertyName2("", matDb)
    On Error GoTo 0

    Dim doneMsg As String
    doneMsg = "Run started. The clock is running." & vbCrLf & vbCrLf & _
              "Build your part now, then run Submit (Ctrl+Shift+G)." & vbCrLf & _
              "Do not close this part, or your run is lost."
    If Len(Trim$(matName)) = 0 Then
        doneMsg = doneMsg & vbCrLf & vbCrLf & _
                  "Apply the challenge's material while you model; a submit without it is rejected."
    End If
    MsgBox doneMsg, vbInformation, "GAUNTLET, run started"
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
