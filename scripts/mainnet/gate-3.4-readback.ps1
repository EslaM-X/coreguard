# GATE 3.4 -- READ-BACK verification of on-chain state. Zero-gas, read-only.
# ASCII-ONLY. Cross-checks gate-3.2/3.3 evidence against live Mainnet registry via eth_call/cast call.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = "D:\KOSSASHI\CORE DAO\coreguard"
$rpc = "https://rpc.coredao.org"
Set-Location -LiteralPath $repo

$ev32 = Get-Content -LiteralPath (Join-Path $repo "evidence\gate-3.2-commitintent.json") -Raw | ConvertFrom-Json
$ev33 = Get-Content -LiteralPath (Join-Path $repo "evidence\gate-3.3-anchorproof.json") -Raw | ConvertFrom-Json
$anchor = $ev32.registry

function InvokeCast([string[]]$argList) {
  $so = Join-Path $env:TEMP ("cg34-cast-o-" + [guid]::NewGuid() + ".txt")
  $se = Join-Path $env:TEMP ("cg34-cast-e-" + [guid]::NewGuid() + ".txt")
  $p = Start-Process -FilePath "cast" -ArgumentList $argList -WorkingDirectory $repo -NoNewWindow -Wait -PassThru -RedirectStandardOutput $so -RedirectStandardError $se
  $soOut = ""; if (Test-Path -LiteralPath $so) { $soOut = (Get-Content -LiteralPath $so -Raw -ErrorAction SilentlyContinue) }
  Remove-Item -LiteralPath $so, $se -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { throw "cast exit=$($p.ExitCode)" }
  return $soOut.Trim()
}
function RpcP($method, $params) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 8
  $res = Invoke-RestMethod -Uri $rpc -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  if ($res.error) { throw "RPC error: $($res.error.message)" }
  return $res.result
}

$cid = [Convert]::ToInt64((RpcP "eth_chainId" @()), 16)
if ($cid -ne 1116) { throw "[FAIL-CLOSED] chainId=$cid" }
"[OK] chainId=1116"

# runtime code present (deploy persisted)
$code = RpcP "eth_getCode" @($anchor, "latest")
"[OK] registry runtime code len=$((($code.Length - 2) / 2)) bytes"
if ($code.Length -lt 200) { throw "[FAIL-CLOSED] no code on chain" }

# intentCommit
$intent = InvokeCast @("call", "--rpc-url", $rpc, $anchor, "intentCommits(bytes32)(bytes32,bytes32,bytes32,uint256,address)", $ev32.intentId)
$il = $intent -split "`r?`n" | Where-Object { $_.Trim() }
if ($il.Count -lt 5) { throw "[FAIL-CLOSED] intent readback malformed" }
$rbCommitment = $il[0].Trim()
$rbReceipt = $il[2].Trim()
$rbVu = $il[3].Trim(); if ($rbVu -match "^(\d+)") { $rbVu = $Matches[1] }
$rbSigner = $il[4].Trim()
"[readback] intent     commitment=$($rbCommitment.Substring(0,18))... signer=$rbSigner validUntil=$rbVu"
if ($rbCommitment -ine $ev32.intentCommitment) { throw "[FAIL-CLOSED] intent commitment mismatch" }
if ($rbSigner -ine $ev32.signer) { throw "[FAIL-CLOSED] intent signer mismatch" }
"[PASS] intentCommits(intentId) matches gate-3.2 evidence"

# proofAnchor
$proof = InvokeCast @("call", "--rpc-url", $rpc, $anchor, "proofAnchors(bytes32)(bytes32,bytes32,bytes32,bytes32,uint256,uint8,address)", $ev33.proofId)
$pl = $proof -split "`r?`n" | Where-Object { $_.Trim() }
if ($pl.Count -lt 7) { throw "[FAIL-CLOSED] proof readback malformed" }
$rbReceiptId = $pl[0].Trim()
$rbIntentCommitment = $pl[1].Trim()
$rbProofCommitment = $pl[2].Trim()
$rbVerifier = $pl[3].Trim()
$rbAnchoredAt = $pl[4].Trim()
$rbResult = $pl[5].Trim()
$rbSigner2 = $pl[6].Trim()
"[readback] proof     receipt=$($rbReceiptId.Substring(0,18))... commitment=$($rbProofCommitment.Substring(0,18))... result=$rbResult verifier=$($rbVerifier.Substring(0,18))... signer=$rbSigner2"
if ($rbReceiptId -ine $ev33.receiptId) { throw "[FAIL-CLOSED] proof receiptId mismatch" }
if ($rbProofCommitment -ine $ev33.proofCommitment) { throw "[FAIL-CLOSED] proof commitment mismatch" }
if ($rbResult -ine $ev33.result) { throw "[FAIL-CLOSED] proof result mismatch" }
if ($rbSigner2 -ine $ev33.signer) { throw "[FAIL-CLOSED] proof signer mismatch" }
"[PASS] proofAnchors(proofId) matches gate-3.3 evidence"

# tx receipts confirmed on-chain statuses
foreach ($t in @(@("3.2", $ev32.txHash), @("3.3", $ev33.txHash))) {
  $rec = RpcP "eth_getTransactionReceipt" @($t[1])
  if (-not $rec) { throw "[FAIL-CLOSED] no receipt for gate $($t[0])" }
  if ([Convert]::ToInt64($rec.status, 16) -ne 1) { throw "[FAIL-CLOSED] gate $($t[0]) status != 1" }
  "[PASS] gate $($t[0]) tx $($t[1].Substring(0,12))... status=1 block=$([Convert]::ToInt64($rec.blockNumber,16))"
}

$verdict = [ordered]@{
  gate = "3.4"; chainId = 1116; registry = $anchor
  intentReadback = "MATCH"; proofReadback = "MATCH"; txStatuses = "OK"
  verdict = "READBACK-VERIFIED-ON-CHAIN"; gasSpent = 0
  date = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 4
Set-Content -LiteralPath (Join-Path $repo "evidence\gate-3.4-readback.json") -Value $verdict -Encoding UTF8
"[OK] evidence pinned: evidence\gate-3.4-readback.json"
"[GATE 3.4 COMPLETE (zero-gas)]"