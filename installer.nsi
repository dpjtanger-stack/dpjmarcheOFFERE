Unicode true
!include "MUI2.nsh"
!include "x64.nsh"

; General Configuration
Name "FinAudit Justice"
Caption "FinAudit Justice - نظام تدقيق وفحص العروض المالية للصفقات العمومية"
OutFile "dist-electron/FinAudit_Justice_Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\FinAuditJustice"
InstallDirRegKey HKCU "Software\FinAuditJustice" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; Interface Settings
!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

; Finish Page Settings
!define MUI_FINISHPAGE_RUN "$INSTDIR\FinAudit Meknes.exe"
!define MUI_FINISHPAGE_RUN_TEXT "تشغيل البرنامج مباشرة بعد التثبيت (Lancer l'application)"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

; Installer Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages (Arabic primary, French secondary)
!insertmacro MUI_LANGUAGE "Arabic"
!insertmacro MUI_LANGUAGE "French"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; Copy the icon for shortcuts
  File "icon.ico"

  ; Copy all packaged application files
  File /r "dist-electron/win-unpacked/*.*"

  ; Create Shortcuts
  CreateDirectory "$SMPROGRAMS\FinAudit Justice"
  CreateShortCut "$SMPROGRAMS\FinAudit Justice\FinAudit Justice.lnk" "$INSTDIR\FinAudit Meknes.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\FinAudit Justice\Désinstaller FinAudit.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\FinAudit Justice.lnk" "$INSTDIR\FinAudit Meknes.exe" "" "$INSTDIR\icon.ico" 0

  ; Write Registry for Add/Remove Programs
  WriteRegStr HKCU "Software\FinAuditJustice" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "DisplayName" "FinAudit Justice - تدقيق الصفقات العمومية"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "Publisher" "Ministère de la Justice - Direction Provinciale"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice" "NoRepair" 1

  ; Create Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  ; Delete Shortcuts
  Delete "$DESKTOP\FinAudit Justice.lnk"
  Delete "$SMPROGRAMS\FinAudit Justice\FinAudit Justice.lnk"
  Delete "$SMPROGRAMS\FinAudit Justice\Désinstaller FinAudit.lnk"
  RMDir "$SMPROGRAMS\FinAudit Justice"

  ; Delete Files and Directory
  RMDir /r "$INSTDIR"

  ; Delete Registry Keys
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FinAuditJustice"
  DeleteRegKey HKCU "Software\FinAuditJustice"
SectionEnd
