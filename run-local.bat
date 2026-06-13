@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   MessSync Next.js Local Runner
echo ===================================================
echo.

:: 1. Check for node_modules
if not exist "node_modules" (
    echo [1/3] Node modules not found. Installing dependencies...
    call npm install
) else (
    echo [1/3] Dependencies already installed.
)
echo.

:: 2. Check for .env file
if not exist ".env" (
    echo [2/3] Creating template .env file...
    echo DATABASE_URL="postgresql://username:password@localhost:5432/database_name?sslmode=require" > .env
    echo JWT_SECRET="develop-secret-key-12345" >> .env
    echo.
    echo ⚠️  ATTENTION REQUIRED:
    echo A template '.env' file has been created in the project root.
    echo You MUST edit '.env' and put your real PostgreSQL DATABASE_URL connection string before running the app.
    echo.
    pause
    exit /b
) else (
    echo [2/3] Environment configurations (.env) found.
)
echo.

:: 3. Start dev server
echo [3/3] Starting Next.js Local Server...
echo Opening http://localhost:3000 in your default browser...
echo Press Ctrl+C in this terminal to stop it.
echo.

:: Asynchronously wait 3 seconds for the server to start, then open the browser
start /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"

call npm run dev

