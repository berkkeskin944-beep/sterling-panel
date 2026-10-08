<# 
Discord Bot Auto-Start Setup
Windows başlangıcında otomatik çalışması için Scheduled Task oluşturur.
Yönetici (Admin) olarak çalıştırın.
#>

$taskName = "DiscordPhotoBot"
$botPath = "C:\Users\PC1\OneDrive\Belgeler\Default Project\discord-photo-bot\start-bot.bat"
$user = "SYSTEM"

# Mevcut task varsa sil
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Eski task silindi." -ForegroundColor Yellow
}

# Trigger: Windows başlangıcı
$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay 00:02:00

# Action: Bat dosyasını çalıştır
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$botPath`"" -WorkingDirectory "C:\Users\PC1\OneDrive\Belgeler\Default Project\discord-photo-bot"

# Settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Task oluştur (SYSTEM hesabı ile, en yüksek yetki)
Register-ScheduledTask -TaskName $taskName -Trigger $trigger -Action $action -Settings $settings -User $user -RunLevel Highest -Force

Write-Host "✅ Scheduled Task oluşturuldu: $taskName" -ForegroundColor Green
Write-Host "Bot artık Windows her açıldığında otomatik başlayacak." -ForegroundColor Cyan
Write-Host ""
Write-Host "Kontrol için: Task Scheduler > Task Scheduler Library > $taskName" -ForegroundColor Gray
Write-Host "Manuel test: Run (sağ tık > Run)" -ForegroundColor Gray