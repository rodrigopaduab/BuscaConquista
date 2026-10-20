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
call npm run package:win
if errorlevel 1 (
  echo Falha ao gerar o programa.
  pause
  exit /b 1
)
echo.
echo Pronto! O programa esta em: dist\BuscaConquista-win32-x64\BuscaConquista.exe
echo Voce pode copiar essa pasta inteira para onde quiser.
pause
