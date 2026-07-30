# Remove the Bob Poker Timer firewall rule (fully closes the port again).
# Run as Administrator: right-click Start -> Terminal (Admin), then:
#     powershell -ExecutionPolicy Bypass -File scripts\remove-firewall.ps1

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "This must be run as Administrator. Right-click Start -> Terminal (Admin), then re-run." -ForegroundColor Yellow
  exit 1
}

if (Get-NetFirewallRule -DisplayName "Bob Poker Timer" -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName "Bob Poker Timer"
  Write-Host "Removed the Bob Poker Timer firewall rule. The port is closed again." -ForegroundColor Green
} else {
  Write-Host "No 'Bob Poker Timer' firewall rule found (nothing to remove)." -ForegroundColor DarkGray
}
