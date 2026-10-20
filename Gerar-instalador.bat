@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado.
  echo Instale a versao LTS em https://nodejs.org e de dois cliques neste arquivo de novo.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo Falha na instalacao. Verifique a internet e tente de novo.
  pause
  exit /b 1
)
call npm run installer:win
if errorlevel 1 (
  echo Falha ao gerar o instalador.
  pause
  exit /b 1
)
echo.
echo Pronto! O instalador esta na pasta: dist-instalador
echo De dois cliques em "BuscaConquista Setup" para instalar (cria atalho na area de trabalho e no menu Iniciar).
pause
