@echo off
cd /d "%~dp0"
echo Iniciando GADU Dashboard en http://localhost:8000 ...
node server.js --abrir
pause
