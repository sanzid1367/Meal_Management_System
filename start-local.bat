@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
)

".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
cd frontend
call npm.cmd install
call npm.cmd run build
cd ..

echo.
echo Mess Manager is starting...
echo Press Ctrl+C in this window to stop it.
echo.
".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
