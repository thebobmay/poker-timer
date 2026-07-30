# Allow the phone (and any device on your hotspot) to reach the Bob Poker Timer.
#
# Windows blocks inbound connections on "Public" networks by default, and a phone
# hotspot is classified Public — so the phone can't reach the laptop's server until
# you allow the port. Run this ONCE on the laptop that hosts the timer.
#
# By default this is SCOPED and REMOVABLE:
#   - only on Public networks (your home/Private Wi-Fi stays closed)
#   - only port 3000 (nothing else is opened)
#   - delete it anytime with scripts/remove-firewall.ps1
#
# Options:
#   -Subnet 192.168.4.0/24   only accept connections from that hotspot subnet
#   -AllProfiles             apply on all network types (simplest, less scoped)
#
# HOW TO RUN: right-click Start -> "Terminal (Admin)" / "PowerShell (Admin)", then:
#     powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1
#     powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1 -Subnet 192.168.4.0/24

param(
  [int]$Port = 3000,
  [string]$Subnet = "",
  [switch]$AllProfiles
)

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "This must be run as Administrator. Right-click Start -> Terminal (Admin), then re-run." -ForegroundColor Yellow
  exit 1
}

$name = "Bob Poker Timer"
if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $name
}

$params = @{
  DisplayName = $name
  Direction   = "Inbound"
  Action      = "Allow"
  Protocol    = "TCP"
  LocalPort   = $Port
  Profile     = if ($AllProfiles) { "Any" } else { "Public" }
}
if ($Subnet) { $params["RemoteAddress"] = $Subnet }

New-NetFirewallRule @params | Out-Null
Write-Host ("Added inbound allow for TCP {0} (profile: {1}{2})." -f $Port, $params.Profile, $(if ($Subnet) { ", from $Subnet" } else { "" })) -ForegroundColor Green
Write-Host "Remove it later with:  powershell -ExecutionPolicy Bypass -File scripts\remove-firewall.ps1" -ForegroundColor DarkGray

Write-Host "`nOpen one of these on the phone (use the hotspot 192.168.x.x one):"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host ("    http://{0}:{1}/control   [{2}]" -f $_.IPAddress, $Port, $_.InterfaceAlias) }
