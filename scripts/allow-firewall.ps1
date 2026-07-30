# Allow the phone (and any device on your hotspot) to reach the Bob Poker Timer.
#
# Windows blocks inbound connections on "Public" networks by default, and a phone
# hotspot is classified Public — so the phone can't reach the laptop's server until
# you allow the port. Run this ONCE on the laptop that hosts the timer.
#
# HOW TO RUN: right-click Start -> "Terminal (Admin)" / "PowerShell (Admin)", then:
#     powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1
#   (or paste the New-NetFirewallRule line below directly).

param([int]$Port = 3000)

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "This must be run as Administrator. Right-click Start -> Terminal (Admin), then re-run." -ForegroundColor Yellow
  exit 1
}

$name = "Bob Poker Timer (TCP $Port)"
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $name
}
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
Write-Host "Allowed inbound TCP $Port. Your phone can now reach the timer over the hotspot." -ForegroundColor Green

# Show the addresses the phone can use.
Write-Host "`nOpen one of these on the phone (use the hotspot 192.168.x.x one):"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host ("    http://{0}:{1}/control   [{2}]" -f $_.IPAddress, $Port, $_.InterfaceAlias) }
