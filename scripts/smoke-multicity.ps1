param(
  [string]$BaseUrl = "http://127.0.0.1:8011"
)

$ErrorActionPreference = "Stop"

# Keep this file ASCII-only so Windows PowerShell 5 will not corrupt Chinese strings.
$casesJson = @'
[
  {
    "Id": "beijing",
    "City": "\u5317\u4eac",
    "Start": "\u5929\u5b89\u95e8\u5e7f\u573a",
    "Destinations": ["\u6545\u5bab\u535a\u7269\u9662", "\u666f\u5c71\u516c\u56ed", "\u738b\u5e9c\u4e95"],
    "TravelerStyle": "senior"
  },
  {
    "Id": "hangzhou",
    "City": "\u676d\u5dde",
    "Start": "\u9f99\u7fd4\u6865",
    "Destinations": ["\u897f\u6e56", "\u6cb3\u574a\u8857", "\u676d\u5dde\u535a\u7269\u9986"],
    "TravelerStyle": "family"
  },
  {
    "Id": "chengdu",
    "City": "\u6210\u90fd",
    "Start": "\u5929\u5e9c\u5e7f\u573a",
    "Destinations": ["\u5bbd\u7a84\u5df7\u5b50", "\u9526\u91cc\u53e4\u8857", "\u592a\u53e4\u91cc"],
    "TravelerStyle": "food"
  },
  {
    "Id": "guangzhou",
    "City": "\u5e7f\u5dde",
    "Start": "\u4f53\u80b2\u897f\u8def",
    "Destinations": ["\u5e7f\u5dde\u5854", "\u6c99\u9762\u5c9b", "\u5317\u4eac\u8def\u6b65\u884c\u8857"],
    "TravelerStyle": "photo"
  },
  {
    "Id": "xian",
    "City": "\u897f\u5b89",
    "Start": "\u949f\u697c",
    "Destinations": ["\u897f\u5b89\u57ce\u5899", "\u56de\u6c11\u8857", "\u9655\u897f\u5386\u53f2\u535a\u7269\u9986"],
    "TravelerStyle": "classic"
  }
]
'@

$cases = $casesJson | ConvertFrom-Json

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -TimeoutSec 60
  }

  $json = $Body | ConvertTo-Json -Depth 16
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 120
}

function Resolve-Location {
  param(
    [string]$City,
    [string]$Keyword,
    [hashtable]$Headers
  )

  $response = Invoke-Json -Method "POST" -Uri "$BaseUrl/api/poi/geocode" -Headers $Headers -Body @{
    city = $City
    keyword = $Keyword
  }
  if ($null -eq $response.location) {
    throw "No start location candidate"
  }
  return $response.location
}

function Search-FirstPoi {
  param(
    [string]$City,
    [string]$Keyword,
    [hashtable]$Headers
  )

  $response = Invoke-Json -Method "POST" -Uri "$BaseUrl/api/poi/search" -Headers $Headers -Body @{
    city = $City
    keyword = $Keyword
  }
  if ($null -eq $response.candidates -or $response.candidates.Count -eq 0) {
    throw "No POI candidate"
  }
  return $response.candidates[0]
}

function Convert-ToDestinationPayload {
  param(
    [object]$Poi,
    [string]$RawName
  )

  return @{
    source = $Poi.source
    sourcePoiId = $Poi.sourcePoiId
    rawName = $RawName
    name = $Poi.name
    address = $Poi.address
    lat = $Poi.lat
    lng = $Poi.lng
    poiType = $Poi.poiType
    mustGo = $false
    stayMinutes = $null
    suggestedStayMinutes = $Poi.suggestedStayMinutes
    riskLevel = $Poi.riskLevel
    tags = @($Poi.tags)
    note = $Poi.note
    practicalInfo = $Poi.practicalInfo
  }
}

$results = @()
$failed = 0

foreach ($case in $cases) {
  $headers = @{
    "X-Client-Id" = "smoke_multicity_$($case.Id)_$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
  }
  $tripId = $null
  try {
    $start = Resolve-Location -City $case.City -Keyword $case.Start -Headers $headers
    $destinations = @()
    foreach ($name in $case.Destinations) {
      $poi = Search-FirstPoi -City $case.City -Keyword $name -Headers $headers
      $destinations += Convert-ToDestinationPayload -Poi $poi -RawName $name
    }

    $payload = @{
      city = $case.City
      startLocation = @{
        name = $start.name
        lat = $start.lat
        lng = $start.lng
      }
      startTime = "2026-07-08T15:00:00+08:00"
      endTime = "2026-07-08T21:00:00+08:00"
      transportPreference = "metro"
      pace = "balanced"
      travelerStyle = $case.TravelerStyle
      destinations = $destinations
    }

    $trip = Invoke-Json -Method "POST" -Uri "$BaseUrl/api/trips" -Headers $headers -Body $payload
    $tripId = $trip.tripId
    $routes = Invoke-Json -Method "POST" -Uri "$BaseUrl/api/trips/$tripId/routes" -Headers $headers -Body @{ fixedOrder = $false }

    if ($null -eq $routes.plans -or $routes.plans.Count -eq 0) {
      throw "No route plans returned"
    }

    $first = $routes.plans[0]
    if ($null -eq $first.scoreFactors -or $first.scoreFactors.Count -eq 0) {
      throw "Missing scoreFactors"
    }
    if ($null -eq $first.weather -or [string]::IsNullOrWhiteSpace([string]$first.weather.outdoorRisk)) {
      throw "Missing weather risk"
    }
    if ($null -eq $first.legs -or $first.legs.Count -eq 0) {
      throw "Missing route legs"
    }

    $legSources = @($first.legs | ForEach-Object { $_.source } | Select-Object -Unique)
    $results += [PSCustomObject]@{
      CityId = $case.Id
      Status = "PASS"
      Plans = $routes.plans.Count
      Stops = $first.stops.Count
      LegSources = ($legSources -join ",")
      WeatherRisk = $first.weather.outdoorRisk
      ScoreFactors = $first.scoreFactors.Count
      Message = ""
    }
  } catch {
    $failed += 1
    $results += [PSCustomObject]@{
      CityId = $case.Id
      Status = "FAIL"
      Plans = 0
      Stops = 0
      LegSources = ""
      WeatherRisk = ""
      ScoreFactors = 0
      Message = $_.Exception.Message
    }
  } finally {
    if ($null -ne $tripId) {
      try {
        Invoke-Json -Method "DELETE" -Uri "$BaseUrl/api/trips/$tripId" -Headers $headers | Out-Null
      } catch {
        Write-Host "[WARN] cleanup failed for trip ${tripId}: $($_.Exception.Message)"
      }
    }
  }
}

$results | Format-Table -AutoSize
Write-Host ""
Write-Host "Multi-city smoke summary: $($cases.Count - $failed) passed, $failed failed."
if ($failed -gt 0) {
  exit 1
}
