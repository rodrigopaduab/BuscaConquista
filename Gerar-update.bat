@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado.
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm run update:gerar
if errorlevel 1 (
  echo Falha ao gerar a atualizacao.
  pause
  exit /b 1
)
start "" "%~dp0dist-update"
echo.
echo Pronto! Anexe app.asar e update.json em uma nova Release no GitHub.
pause
