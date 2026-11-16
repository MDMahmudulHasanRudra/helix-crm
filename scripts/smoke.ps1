# Helix CRM API smoke test
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke.ps1 [-BaseUrl http://localhost:5080]
# Signs in, reads every surface, exercises each mutation path, and cleans up after itself.

param(
    [string]$BaseUrl = "http://localhost:5080",
    [string]$Email = "avery@helixcrm.dev",
    [string]$Password = "Admin@123"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$script:passed = 0
$script:failed = 0
$script:cookies = New-Object System.Net.CookieContainer
$script:handler = New-Object System.Net.Http.HttpClientHandler
$script:handler.CookieContainer = $script:cookies
$script:client = New-Object System.Net.Http.HttpClient($script:handler)
$script:client.BaseAddress = New-Object System.Uri("$BaseUrl/api/v1/")
$script:client.Timeout = [TimeSpan]::FromSeconds(60)

function Invoke-Api {
    param(
        [string]$Method = "GET",
        [string]$Path,
        $Body = $null
    )
    $request = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($Method.ToUpperInvariant())), $Path.TrimStart("/"))
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 8 -Compress
        $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
    }
    $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
    $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    $response.Dispose()
    if ($status -ge 400) {
        throw "HTTP $status from $Method $Path : $content"
    }
    if ([string]::IsNullOrWhiteSpace($content)) { return $null }
    return $content | ConvertFrom-Json
}

function Check {
    param([string]$Name, [scriptblock]$Test)
    try {
        & $Test
        $script:passed++
        Write-Host ("  PASS  " + $Name) -ForegroundColor Green
    } catch {
        $script:failed++
        Write-Host ("  FAIL  " + $Name) -ForegroundColor Red
        $message = $_.Exception.Message
        if ($message.Length -gt 500) { $message = $message.Substring(0, 500) }
        Write-Host ("        " + $message) -ForegroundColor DarkRed
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ("$Actual" -ne "$Expected") { throw "$Label expected '$Expected' but got '$Actual'" }
}

Write-Host "`nHelix CRM smoke test -> $BaseUrl`n" -ForegroundColor Cyan

# ---------------------------------------------------------------- auth
Write-Host "Auth" -ForegroundColor Yellow
Check "login returns user + organization" {
    $result = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = $Email; password = $Password }
    Assert-True ($null -ne $result.user) "no user in response"
    Assert-Equal $result.user.email $Email "email"
    Assert-True ($result.organization.name.Length -gt 0) "no organization"
}
Check "me reflects the signed-in user" {
    $me = Invoke-Api -Path "/auth/me"
    Assert-Equal $me.user.email $Email "email"
}
Check "unauthenticated request is rejected" {
    $anonymous = New-Object System.Net.Http.HttpClientHandler
    $anonymous.UseCookies = $false
    $anon = New-Object System.Net.Http.HttpClient($anonymous)
    $anon.BaseAddress = New-Object System.Uri("$BaseUrl/api/v1/")
    $response = $anon.GetAsync("accounts").GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    $response.Dispose(); $anon.Dispose()
    Assert-Equal $status 401 "status"
}

# ---------------------------------------------------------------- read surfaces
Write-Host "`nRead surfaces" -ForegroundColor Yellow
$entities = @("accounts", "contacts", "leads", "activities", "tickets", "products", "quotes", "notifications", "custom-fields", "users")
foreach ($entity in $entities) {
    Check "GET /$entity" {
        $data = Invoke-Api -Path "/$entity"
        Assert-True ($null -ne $data) "empty response"
    }
}
Check "GET /deals (paged)" { Assert-True ((Invoke-Api -Path "/deals?page=1&pageSize=5").items.Count -le 5) "page size" }
Check "GET /deals/board" { Assert-True ((Invoke-Api -Path "/deals/board").pipelines.Count -gt 0) "no pipelines" }
Check "GET /dashboard" { Assert-True (@((Invoke-Api -Path "/dashboard").kpis).Count -gt 0) "no kpis" }
Check "GET /reports/summary" { Assert-True (@((Invoke-Api -Path "/reports/summary").kpis).Count -gt 0) "no kpis" }
Check "GET /search?q=north" { Assert-True ((Invoke-Api -Path "/search?q=north").total -gt 0) "no results" }
Check "GET /pipelines" { Assert-True ((Invoke-Api -Path "/pipelines").Count -gt 0) "no pipelines" }

# ---------------------------------------------------------------- product
Write-Host "`nProduct lifecycle" -ForegroundColor Yellow
$product = $null
Check "create product" {
    $script:productSku = "SMOKE-$((Get-Random -Maximum 99999))"
    $script:product = Invoke-Api -Method POST -Path "/products" -Body @{
        name = "Smoke Test Widget"; sku = $script:productSku; description = "Temporary smoke-test product"
        unitPrice = 149.5; currency = "USD"; taxRate = 8.5; category = "Hardware"; isActive = $true
    }
    Assert-True ($script:product.id -ne $null) "no id"
    Assert-Equal $script:product.unitPrice 149.5 "unitPrice"
}
Check "product appears in search" {
    $found = Invoke-Api -Path "/products?search=$($script:productSku)"
    Assert-True (@($found).Count -eq 1) "expected 1 match, got $(@($found).Count)"
}
Check "update product" {
    $updated = Invoke-Api -Method PUT -Path "/products/$($script:product.id)" -Body @{
        name = "Smoke Test Widget v2"; sku = $script:productSku; description = "Updated"; unitPrice = 199; currency = "USD"
        taxRate = 8.5; category = "Hardware"; isActive = $false
    }
    Assert-Equal $updated.name "Smoke Test Widget v2" "name"
    Assert-Equal $updated.isActive $false "isActive"
}

# ---------------------------------------------------------------- quote
Write-Host "`nQuote lifecycle" -ForegroundColor Yellow
$quote = $null
$account = @(Invoke-Api -Path "/accounts?pageSize=1").items[0]
Check "create quote with line items" {
    $script:quote = Invoke-Api -Method POST -Path "/quotes" -Body @{
        accountId = $account.id; status = "Draft"; currency = "USD"; discountPercent = 10; taxPercent = 8
        issueDate = (Get-Date).ToString("o"); expiryDate = (Get-Date).AddDays(14).ToString("o")
        notes = "Smoke test quote"
        lines = @(
            @{ productId = $script:product.id; description = "Smoke Test Widget v2"; quantity = 2; unitPrice = 199; discountPercent = 0 },
            @{ description = "Onboarding"; quantity = 1; unitPrice = 500; discountPercent = 5 }
        )
    }
    # subtotal 873.00 - 10% = 785.70, +8% tax = 848.556 -> 848.56
    Assert-Equal $script:quote.total 848.56 "total"
    Assert-Equal @($script:quote.lines).Count 2 "line count"
}
Check "quote appears in account filter" {
    $list = Invoke-Api -Path "/quotes?accountId=$($account.id)"
    Assert-True (@($list.items).Count -ge 1) "quote not listed for account"
}
Check "advance quote status" {
    $sent = Invoke-Api -Method PATCH -Path "/quotes/$($script:quote.id)/status" -Body @{ status = "Sent" }
    Assert-Equal $sent.status "Sent" "status"
}

# ---------------------------------------------------------------- ticket + conversation
Write-Host "`nTicket lifecycle" -ForegroundColor Yellow
$ticket = $null
$users = Invoke-Api -Path "/users"
$agent = $users[0]
Check "create ticket" {
    $script:ticket = Invoke-Api -Method POST -Path "/tickets" -Body @{
        subject = "Smoke test ticket"; description = "Temporary ticket"; status = "Open"; priority = "High"
        channel = "Email"; accountId = $account.id
    }
    Assert-True ($script:ticket.number -match '^T-\d+$') "unexpected ticket number $($script:ticket.number)"
}
Check "reply creates a conversation entry" {
    $reply = Invoke-Api -Method POST -Path "/activities" -Body @{
        type = "Reply"; subject = "Re: Smoke test ticket"; body = "Thanks for reaching out."
        relatedType = "Ticket"; relatedId = $script:ticket.id; status = "Completed"
    }
    Assert-Equal $reply.relatedType "Ticket" "relatedType"
    $detail = Invoke-Api -Path "/tickets/$($script:ticket.id)"
    Assert-True (@($detail.conversation).Count -ge 1) "conversation is empty"
}
Check "internal note is auto-completed" {
    $note = Invoke-Api -Method POST -Path "/activities" -Body @{
        type = "Note"; subject = "Internal"; body = "Customer is on the enterprise plan."
        relatedType = "Ticket"; relatedId = $script:ticket.id
    }
    Assert-Equal $note.status "Completed" "note status"
}
Check "assign ticket" {
    $assigned = Invoke-Api -Method PATCH -Path "/tickets/$($script:ticket.id)/assign" -Body @{ assigneeId = $agent.id }
    Assert-Equal $assigned.assigneeId $agent.id "assigneeId"
}
Check "resolve ticket" {
    $resolved = Invoke-Api -Method PATCH -Path "/tickets/$($script:ticket.id)/status" -Body @{ status = "Resolved" }
    Assert-Equal $resolved.status "Resolved" "status"
}

# ---------------------------------------------------------------- activity
Write-Host "`nActivity lifecycle" -ForegroundColor Yellow
$activity = $null
Check "create activity" {
    $script:activity = Invoke-Api -Method POST -Path "/activities" -Body @{
        type = "Call"; subject = "Smoke follow-up call"; body = "Confirm renewal"
        dueAt = (Get-Date).AddDays(1).ToString("o"); priority = "High"
        relatedType = "Account"; relatedId = $account.id
    }
    Assert-Equal $script:activity.status "Open" "status"
}
Check "complete activity" {
    $done = Invoke-Api -Method PATCH -Path "/activities/$($script:activity.id)/complete" -Body @{
        completed = $true; outcome = "Reached the customer"; body = "Renewal confirmed"
    }
    Assert-Equal $done.status "Completed" "status"
}
Check "reopen activity" {
    $reopened = Invoke-Api -Method PATCH -Path "/activities/$($script:activity.id)/complete" -Body @{ completed = $false }
    Assert-Equal $reopened.status "Open" "status"
}

# ---------------------------------------------------------------- pipeline + stage
Write-Host "`nPipeline lifecycle" -ForegroundColor Yellow
$pipeline = $null
$stageA = $null
$stageB = $null
Check "create pipeline" {
    $script:pipeline = Invoke-Api -Method POST -Path "/pipelines" -Body @{ name = "Smoke Pipeline $(Get-Random)"; isDefault = $false }
    Assert-True ($script:pipeline.id -ne $null) "no id"
}
Check "add stage" {
    $script:stageA = Invoke-Api -Method POST -Path "/pipelines/$($script:pipeline.id)/stages" -Body @{
        name = "Discovery"; probability = 25; color = "#22c55e"
    }
    Assert-Equal $script:stageA.probability 25 "probability"
    Assert-Equal $script:stageA.sortOrder 1 "sortOrder"
}
Check "update stage" {
    $updated = Invoke-Api -Method PUT -Path "/pipelines/$($script:pipeline.id)/stages/$($script:stageA.id)" -Body @{
        name = "Qualified"; probability = 40; color = "#22c55e"
    }
    Assert-Equal $updated.name "Qualified" "name"
    Assert-Equal $updated.probability 40 "probability"
}
Check "reorder stages" {
    $script:stageB = Invoke-Api -Method POST -Path "/pipelines/$($script:pipeline.id)/stages" -Body @{
        name = "Proposal"; probability = 60; color = "#f59e0b"
    }
    Invoke-Api -Method PATCH -Path "/pipelines/$($script:pipeline.id)/stages/reorder" -Body @{ stageIds = @($script:stageB.id, $script:stageA.id) }
    $after = Invoke-Api -Path "/pipelines"
    $pipelineAfter = @($after | Where-Object { $_.id -eq $script:pipeline.id })[0]
    Assert-Equal @($pipelineAfter.stages)[0].id $script:stageB.id "first stage"
}
Check "cannot delete the last stage" {
    Invoke-Api -Method DELETE -Path "/pipelines/$($script:pipeline.id)/stages/$($script:stageA.id)"
    try {
        Invoke-Api -Method DELETE -Path "/pipelines/$($script:pipeline.id)/stages/$($script:stageB.id)"
        throw "expected 400"
    } catch {
        Assert-True ($_.Exception.Message -match "at least one stage") "unexpected error: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------- custom field
Write-Host "`nCustom field lifecycle" -ForegroundColor Yellow
$field = $null
Check "create custom field" {
    $script:field = Invoke-Api -Method POST -Path "/custom-fields" -Body @{
        entityType = "Account"; key = "smoke_tier"; label = "Smoke Tier"; fieldType = "select"
        options = @("Gold", "Silver"); isRequired = $false; sortOrder = 99; isActive = $true
    }
    Assert-Equal $script:field.key "smoke_tier" "key"
}
Check "update custom field" {
    $updated = Invoke-Api -Method PUT -Path "/custom-fields/$($script:field.id)" -Body @{
        entityType = "Account"; key = "smoke_tier"; label = "Smoke Tier (renamed)"; fieldType = "select"
        options = @("Gold", "Silver", "Bronze"); isRequired = $false; sortOrder = 99; isActive = $true
    }
    Assert-Equal $updated.label "Smoke Tier (renamed)" "label"
    Assert-Equal @($updated.options).Count 3 "options"
}

# ---------------------------------------------------------------- autonomous engines
Write-Host "`nAutonomous engines" -ForegroundColor Yellow
Check "insights summarise the workspace" {
    $result = Invoke-Api -Path "/autonomous/insights"
    Assert-True ($null -ne $result.items) "no items array"
    Assert-True ($null -ne $result.stalledDeals) "no stalled deal count"
    Assert-True ($null -ne $result.generatedAt) "no timestamp"
}
Check "settings round-trip" {
    $current = Invoke-Api -Path "/autonomous/settings"
    Assert-True ($current.staleDealDays -ge 1) "stale deal days missing"
    $saved = Invoke-Api -Method PUT -Path "/autonomous/settings" -Body @{
        autonomousEnabled = $current.autonomousEnabled
        autoRouteLeads = $current.autoRouteLeads
        staleDealDays = $current.staleDealDays
        staleDealProbabilityPenalty = $current.staleDealProbabilityPenalty
        dataFreshnessDays = $current.dataFreshnessDays
        leadScoreRoutingThreshold = $current.leadScoreRoutingThreshold
    }
    Assert-Equal $saved.leadScoreRoutingThreshold $current.leadScoreRoutingThreshold "routing threshold"
}
Check "run all workers" {
    $result = Invoke-Api -Method POST -Path "/autonomous/run"
    Assert-True ($null -ne $result.dealsReviewed) "no deal review count"
    Assert-True ($null -ne $result.ticketsReviewed) "no ticket review count"
}
Check "re-score leads" {
    $result = Invoke-Api -Method POST -Path "/autonomous/leads/rescore"
    Assert-True ($null -ne $result.changed) "no changed count"
}
Check "duplicate scan" {
    $scan = Invoke-Api -Method POST -Path "/duplicates/scan"
    Assert-True ($null -ne $scan.candidatesCreated) "no candidate count"
    $list = Invoke-Api -Path "/duplicates?status=Pending&pageSize=5"
    Assert-True ($null -ne $list.items) "no duplicate list"
}

# ---------------------------------------------------------------- exports
Write-Host "`nCSV exports" -ForegroundColor Yellow
foreach ($export in @("/accounts/export", "/deals/export", "/tickets/export", "/quotes/export", "/leads/export")) {
    Check "GET $export" {
        $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $export.TrimStart("/"))
        $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
        $contentType = $response.Content.Headers.ContentType.MediaType
        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $response.Dispose()
        Assert-True ("$contentType" -match "text/csv") "not CSV: $contentType"
        Assert-True ($content.Length -gt 20) "empty CSV"
    }
}

# ---------------------------------------------------------------- cleanup
Write-Host "`nCleanup" -ForegroundColor Yellow
Check "delete quote" { if ($script:quote) { Invoke-Api -Method DELETE -Path "/quotes/$($script:quote.id)" } }
Check "delete ticket" { if ($script:ticket) { Invoke-Api -Method DELETE -Path "/tickets/$($script:ticket.id)" } }
Check "delete activity" { if ($script:activity) { Invoke-Api -Method DELETE -Path "/activities/$($script:activity.id)" } }
Check "delete pipeline" { if ($script:pipeline) { Invoke-Api -Method DELETE -Path "/pipelines/$($script:pipeline.id)" } }
Check "delete product" { if ($script:product) { Invoke-Api -Method DELETE -Path "/products/$($script:product.id)" } }
Check "delete custom field" { if ($script:field) { Invoke-Api -Method DELETE -Path "/custom-fields/$($script:field.id)" } }
Check "deleted quote is gone" {
    if (-not $script:quote) { throw "quote was never created" }
    try {
        Invoke-Api -Path "/quotes/$($script:quote.id)"
        throw "expected 404"
    } catch { Assert-True ($_.Exception.Message -match "HTTP 404") "unexpected error: $($_.Exception.Message)" }
}

# ---------------------------------------------------------------- summary
$script:client.Dispose()
Write-Host ""
if ($script:failed -eq 0) {
    Write-Host "All $($script:passed) checks passed." -ForegroundColor Green
    exit 0
}
Write-Host "$($script:passed) passed, $($script:failed) failed." -ForegroundColor Red
exit 1
