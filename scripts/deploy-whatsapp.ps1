# ============================================================
# GADU · Despliegue del conector de WhatsApp a Supabase
# ------------------------------------------------------------
# Configura los secretos de Meta Cloud API y despliega la
# función whatsapp-webhook.
#
# SEGURIDAD: NO hardcodea el token. Lo lee de variables de
# entorno (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_WABA_ID
# / WHATSAPP_VERIFY_TOKEN) o lo pide por pantalla de forma oculta
# (Read-Host -AsSecureString). El verify token, si no está definido,
# se genera automáticamente y se muestra para copiarlo en Meta.
# El archivo temporal de secretos se escribe en %TEMP% y se borra
# al final, por lo que NUNCA queda en el repositorio.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-whatsapp.ps1
#   (opcional) powershell ... -SkipLink    → no re-linkear el proyecto
#              powershell ... -SkipDeploy  → solo setear secretos
# ============================================================
param(
  [switch]$SkipLink,
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$PROJECT_REF = "kalqvykomlfwxmsdaipf"
$FUNCTION   = "whatsapp-webhook"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---------- 1) CLI de Supabase ----------
$supaCmd = $null
if (Get-Command supabase -ErrorAction SilentlyContinue) {
  $supaCmd = "supabase"
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $supaCmd = "npx"
} else {
  throw "No se encontró el CLI de Supabase. Instalalo con:  npm install -g supabase"
}

function Invoke-Supa([string[]]$Args) {
  if ($supaCmd -eq "supabase") { & supabase @Args }
  else { & npx supabase @Args }
  if ($LASTEXITCODE -ne 0) { throw "El comando 'supabase $($Args -join ' ')' falló (exit $LASTEXITCODE)." }
}

# ---------- 2) Lectura SEGURA de secretos ----------
function Read-Secret([string]$name) {
  $envVal = [Environment]::GetEnvironmentVariable($name)
  if ($envVal) { return $envVal }
  $secure = Read-Host "Ingresá el valor de $name (no se mostrará)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Step "Verificando sesión de Supabase"
try { Invoke-Supa @("projects", "list", "--limit", "1") | Out-Null }
catch {
  Write-Host "No hay sesión activa de Supabase. Iniciá sesión:" -ForegroundColor Yellow
  if ($supaCmd -eq "supabase") { & supabase login } else { & npx supabase login }
}

# ---------- 3) Link del proyecto ----------
if (-not $SkipLink) {
  Write-Step "Linkeando el proyecto $PROJECT_REF"
  Invoke-Supa @("link", "--project-ref", $PROJECT_REF)
}

# ---------- 4) Secretos ----------
Write-Step "Cargando secretos de Meta Cloud API"
$token   = Read-Secret "WHATSAPP_TOKEN"
$phoneId = Read-Secret "WHATSAPP_PHONE_ID"
$wabaId  = Read-Secret "WHATSAPP_WABA_ID"

# WHATSAPP_VERIFY_TOKEN: cadena propia que Meta usará en el handshake GET.
# No es un secreto de Meta: es un valor que VOS elegís y debés copiar en el
# panel de Meta (Configuración > Webhook > "Verify token").
$verifyToken = [Environment]::GetEnvironmentVariable("WHATSAPP_VERIFY_TOKEN")
if (-not $verifyToken) {
  $verifyToken = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  Write-Host "WHATSAPP_VERIFY_TOKEN no estaba definido → se generó uno nuevo:" -ForegroundColor Yellow
  Write-Host "  $verifyToken" -ForegroundColor Cyan
  Write-Host "  Copialo en: Meta for Developers > WhatsApp > Configuración > Webhook > Verify token." -ForegroundColor Yellow
}

if (-not $token) { throw "WHATSAPP_TOKEN es obligatorio." }
if (-not $phoneId) { throw "WHATSAPP_PHONE_ID es obligatorio." }

# Archivo temporal (fuera del repo, se borra al final)
$secretsFile = Join-Path $env:TEMP ("gadu-whatsapp-secrets-" + [guid]::NewGuid().ToString("N") + ".env")
try {
  @(
    "WHATSAPP_TOKEN=$token",
    "WHATSAPP_PHONE_ID=$phoneId",
    "WHATSAPP_WABA_ID=$wabaId",
    "WHATSAPP_VERIFY_TOKEN=$verifyToken"
  ) | Set-Content -Path $secretsFile -Encoding UTF8

  Invoke-Supa @("secrets", "set", "--env-file", $secretsFile, "--project-ref", $PROJECT_REF)
  Write-Host "✔ Secretos cargados: WHATSAPP_TOKEN · WHATSAPP_PHONE_ID · WHATSAPP_WABA_ID · WHATSAPP_VERIFY_TOKEN" -ForegroundColor Green
} finally {
  if (Test-Path $secretsFile) { Remove-Item $secretsFile -Force }
}

# ---------- 5) Deploy ----------
if (-not $SkipDeploy) {
  Write-Step "Desplegando la función $FUNCTION"
  Invoke-Supa @("functions", "deploy", $FUNCTION, "--project-ref", $PROJECT_REF)
  Write-Host "✔ Función $FUNCTION desplegada" -ForegroundColor Green
}

Write-Host "`nListo. Verificá con:" -ForegroundColor Cyan
Write-Host "  supabase secrets list --project-ref $PROJECT_REF"
Write-Host "  supabase functions list --project-ref $PROJECT_REF"
