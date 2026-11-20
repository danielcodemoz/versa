$InputFile = $env:VERSA_OFFICE_INPUT
$OutputFile = $env:VERSA_OFFICE_OUTPUT
$Kind = $env:VERSA_OFFICE_KIND
$ErrorActionPreference = 'Stop'
$app = $null
$doc = $null
try {
  switch ($Kind) {
    'word-pdf' {
      $app = New-Object -ComObject Word.Application
      $app.DisplayAlerts = 0
      $app.AutomationSecurity = 3
      $doc = $app.Documents.Open($InputFile, $false, $true, $false)
      $doc.ExportAsFixedFormat($OutputFile, 17)
    }
    'excel-pdf' {
      $app = New-Object -ComObject Excel.Application
      $app.DisplayAlerts = $false
      $app.AutomationSecurity = 3
      $doc = $app.Workbooks.Open($InputFile, 0, $true)
      $doc.ExportAsFixedFormat(0, $OutputFile)
    }
    'slides-pdf' {
      $app = New-Object -ComObject PowerPoint.Application
      $app.DisplayAlerts = 1
      $app.AutomationSecurity = 3
      $doc = $app.Presentations.Open($InputFile, -1, 0, 0)
      $doc.SaveAs($OutputFile, 32)
    }
  }
} finally {
  if ($doc) {
    if ($Kind -eq 'slides-pdf') { $doc.Close() }
    else { $doc.Close($false) }
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc)
  }
  if ($app) {
    $app.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
}
