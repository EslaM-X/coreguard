# CoreGuard Testnet2 Staged Hardening Campaign - shared gates & helpers
#
# ASCII ONLY (PowerShell 5.1 misreads non-ASCII bytes as ANSI).
#
# Invoked by dot-sourcing from each phase script:
#   . (Join-Path $PSScriptRoot "common.ps1")
#
# This file contains ONLY read-only gates (RPC reads, balance, hygiene). No
# transaction is ever broadcast from this file. Any -RequireFunded phase calls
# Assert-BalanceGate before casting a transaction.

param(
  [string]$Wallet = "0x6F2ca1D3c140218A5561a330D867983a22Bd193c",
  [string]$Rpc = "https://rpc.test2.btcs.network",
  [string]$Rpc2 = "https://rpcar.test2.btcs.network"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Artifacts = Join-Path $PSScriptRoot "artifacts"
Push-Location $Root
if (-not (Test-Path $Artifacts)) { New-Item -ItemType Directory -Path $Artifacts -Force | Out-Null }

# ---- Canonical constants (frozen in the repo, see scripts/verify-anchor.ps1) ----
$Canonical = [ordered]@{
  intentEventTopic0 = "0x56a2b6506b90d822d75d1b4267b743b5e05fb15361f0393f58f223d0329cf6b4"
  anchorEventTopic0 = "0x0c33ee02e1b358686f70819be25e8d45c5c15ca5d9b48c790441b349b30f3475"
  verifyCommitSel   = "0x7cc26b95"  # verifyCommitment(bytes32,bytes32)
  isCommittedSel    = "0x59cf4ea0"  # isCommitted(bytes32)
}

# ---- Low-level raw JSON-RPC read (canonical evidence source; never a cast string) ----
function Invoke-RpcRaw {
  param([string]$Method, $Params)
  $body = @{ jsonrpc = "2.0"; id = 1; method = $Method; params = $Params } | ConvertTo-Json -Depth 8 -Compress
  $resp = Invoke-RestMethod -Uri $script:Rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($resp.error) { throw "RPC error: $($resp.error.message)" }
  if ($null -eq $resp.result) { throw "RPC null result for $Method" }
  return $resp.result
}

function Invoke-RpcRaw2 {
  param([string]$Method, $Params)
  $body = @{ jsonrpc = "2.0"; id = 1; method = $Method; params = $Params } | ConvertTo-Json -Depth 8 -Compress
  $resp = Invoke-RestMethod -Uri $script:Rpc2 -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($resp.error) { throw "RPC2 error: $($resp.error.message)" }
  if ($null -eq $resp.result) { throw "RPC2 null result for $Method" }
  return $resp.result
}

function Assert-Testnet2 {
  # Chain ID must be 1114 (Core Testnet2). Refuses anything else.
  $chainHex = Invoke-RpcRaw "eth_chainId" @()
  $chainId = [Convert]::ToInt64($chainHex, 16)
  if ($chainId -ne 1114) { throw "WRONG NETWORK: chainId=$chainId (expected 1114 Testnet2). Aborting campaign." }
  Write-Host "      [gate] chainId=$chainId (Testnet2) OK"
}

function Assert-BalanceGate {
  # Positive-funding hard gate: any broadcast phase must pass this FIRST.
  $balHex = Invoke-RpcRaw "eth_getBalance" @($script:Wallet, "latest")
  $wei = if ($balHex -eq "0x0") { [bigint]0 } else { [bigint]::Parse($balHex.Substring(2), "AllowHexSpecifier") }
  if ($wei -le 0) {
    Write-Host "`n  ==== BROADCAST GATE CLOSED ===="
    Write-Host "  Wallet $($script:Wallet) has 0 balance on Testnet2 (chainId=1114)."
    Write-Host "  No transaction is authorized until tCORE2 funding arrives."
    Write-Host "  Continuing is IMPOSSIBLE by design.`n"
    Pop-Location
    exit 1
  }
  Write-Host "      [gate] wallet funded: $wei wei ($([Math]::Round($wei / 1e18, 6)) CORE)"
}

function Assert-CleanTree {
  # The campaign must never dirty tracked files. Requires a clean working tree.
  $dirty = git status --porcelain
  if ($dirty) {
    Write-Host "      [warn] git tree not clean during campaign:"
    $dirty | ForEach-Object { Write-Host "          $_" }
  }
}

function Assert-NoSecrets {
  # Private key bytes must never end up in an artifact. Scan artifacts for the
  # 0x-prefixed hex sign pattern length (hold any file containing a long hex).
  $files = Get-ChildItem -Path $script:Artifacts -Recurse -File -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "0x[0-9a-fA-F]{64}") {
      Write-Host "      [warn] artifact contains a 64-hex blob: $($f.Name)"
    }
  }
}

function Write-Artifact {
  param([string]$Name, $Payload)
  $path = Join-Path $script:Artifacts $Name
  $Payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $path -Encoding UTF8
  Write-Host "      [artifact] wrote $($path -replace [regex]::Escape($script:Root), '.')"
  return $path
}

function Stop-Campaign {
  Pop-Location
  exit 0
}