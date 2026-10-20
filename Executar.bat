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
if not exist node_modules (
  echo Instalando o necessario na primeira vez... isso pode levar alguns minutos.
  call npm install
  if errorlevel 1 (
    echo Falha na instalacao. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)
call npm start
