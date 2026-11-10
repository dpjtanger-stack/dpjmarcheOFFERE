@echo off
TITLE FinAudit Meknes - Serveur Local
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo    FinAudit Meknes - Serveur Local
echo ==========================================
echo.

:: 1. Verification de Node.js et NPM
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo Veuillez l'installer sur : https://nodejs.org/
    pause
    exit /b
)

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERREUR] NPM n'est pas installe ou n'est pas dans le PATH.
    pause
    exit /b
)

:: 2. Verification des dependances
if not exist "node_modules\" (
    echo [INFO] Installation des dependances...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERREUR] L'installation des dependances a echoue.
        pause
        exit /b
    )
)

:: 3. Verification du fichier .env
if not exist ".env" (
    echo [INFO] Creation du fichier .env a partir de .env.example...
    copy .env.example .env >nul
    echo [ATTENTION] Veuillez ouvrir le fichier .env et ajouter votre GEMINI_API_KEY.
    echo [ATTENTION] Ou utilisez l'icone de parametres dans l'application.
)

:: 4. Lancement du serveur
echo [INFO] Demarrage du serveur...
echo [INFO] L'application sera accessible sur : http://localhost:3000
echo.

:: Lancer le navigateur apres un court delai
start /b cmd /c "timeout /t 5 >nul && start http://localhost:3000"

:: Lancer le serveur (dev mode)
call npm run dev

if !errorlevel! neq 0 (
    echo.
    echo [ERREUR] Le serveur s'est arrete de maniere inattendue.
    pause
)

