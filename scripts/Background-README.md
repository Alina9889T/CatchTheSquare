# Запуск без Visual Studio

Два задания Планировщика: CatchTheSquare-App и CatchTheSquare-Tunnel.
Они запускаются при загрузке Windows от LOCAL SERVICE, без входа пользователя.
Приложение слушает localhost:5091; данные остаются в users.json в корне проекта.
Не перемещайте папку проекта и C:\cloudflared\cloudflared.exe после установки.

## Адрес Mini App

Откройте bin\Background\tunnel-url.txt и вставьте HTTPS-ссылку в BotFather.
После перезапуска туннеля ссылка меняется. После остановки задания файл может
содержать прежний адрес: проверьте, что задание запущено и ссылка открывается.
Старый терминал с cloudflared можно закрыть после перехода на новую ссылку.
ПК должен оставаться включённым, подключённым к сети и не переходить в сон.

## Управление

PowerShell от администратора, из папки проекта:

```powershell
Get-ScheduledTask -TaskName 'CatchTheSquare-*'
Stop-ScheduledTask -TaskName CatchTheSquare-Tunnel
Stop-ScheduledTask -TaskName CatchTheSquare-App
# Запустить снова:
Start-ScheduledTask -TaskName CatchTheSquare-App
Start-ScheduledTask -TaskName CatchTheSquare-Tunnel
```

Логи: bin\Background\logs. Завершившиеся процессы запускаются повторно через
10 секунд. Логи отдельных запусков сохраняются; старые можно удалять вручную.
Для отладки в Visual Studio сначала остановите задание App, чтобы освободить порт.

## Обновление кода

Остановите задание App и убедитесь, что порт 5091 свободен:

```powershell
Stop-ScheduledTask -TaskName CatchTheSquare-App
Get-NetTCPConnection -LocalPort 5091 -State Listen -ErrorAction SilentlyContinue
# Если слушающих процессов нет:
dotnet publish .\CatchTheSquare.csproj -c Release -o .\bin\Background\app
# Только если сборка успешна:
Start-ScheduledTask -TaskName CatchTheSquare-App
```

Туннель при обновлении можно не останавливать, тогда адрес сохранится.
Публикация не перезаписывает исходный users.json.

## Установка заново

Остановите и удалите существующие задания, затем из PowerShell администратора:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-Background.ps1
```

Установщик публикует Release-сборку и добавляет LOCAL SERVICE права чтения
проекта и cloudflared, записи логов, tunnel-url.txt и users.json.
Результат установки: bin\Background\install.log.

## Удаление автозапуска

Из PowerShell администратора:

```powershell
Stop-ScheduledTask -TaskName CatchTheSquare-Tunnel
Stop-ScheduledTask -TaskName CatchTheSquare-App
Unregister-ScheduledTask -TaskName CatchTheSquare-App -Confirm:$false
Unregister-ScheduledTask -TaskName CatchTheSquare-Tunnel -Confirm:$false
```

Файлы и данные игроков остаются на диске.
