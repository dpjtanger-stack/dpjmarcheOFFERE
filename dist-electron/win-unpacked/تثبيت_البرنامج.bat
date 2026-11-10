@echo off
chcp 65001 >nul
title تثبيت برنامج FinAudit Justice
cls
echo ==============================================================
echo     تثبيت برنامج FinAudit Justice - تدقيق وفحص الصفقات العمومية
echo     المملكة المغربية - وزارة العدل
echo ==============================================================
echo.
echo [1/3] جاري تهيئة مسار التثبيت...
set "TARGET_DIR=%LOCALAPPDATA%\Programs\FinAuditJustice"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo [2/3] جاري نسخ ملفات البرنامج كاملة...
xcopy /E /I /Y /Q "%~dp0*" "%TARGET_DIR%\" >nul

echo [3/3] جاري إنشاء اختصار سطح المكتب وقائمة ابدأ بالأيقونة الرسمية...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'FinAudit Justice.lnk'); $s = $ws.CreateShortcut($desktop); $s.TargetPath = '%TARGET_DIR%\FinAudit_Justice.exe'; $s.WorkingDirectory = '%TARGET_DIR%'; $s.IconLocation = '%TARGET_DIR%\icon.ico,0'; $s.Description = 'FinAudit Justice - نظام تدقيق وفحص الصفقات العمومية'; $s.Save()"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $startMenu = [System.IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'FinAudit Justice.lnk'); $s = $ws.CreateShortcut($startMenu); $s.TargetPath = '%TARGET_DIR%\FinAudit_Justice.exe'; $s.WorkingDirectory = '%TARGET_DIR%'; $s.IconLocation = '%TARGET_DIR%\icon.ico,0'; $s.Description = 'FinAudit Justice - نظام تدقيق وفحص الصفقات العمومية'; $s.Save()"

echo.
echo ==============================================================
echo     تم التثبيت بنجاح!
echo     تم إنشاء اختصار البرنامج على سطح المكتب وفي قائمة ابدأ.
echo ==============================================================
echo.
echo جاري تشغيل البرنامج الآن...
start "" "%TARGET_DIR%\FinAudit_Justice.exe"
timeout /t 2 >nul
exit
