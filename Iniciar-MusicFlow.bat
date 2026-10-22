@echo off
setlocal
title MusicFlow - Sheet Music Reader
set "PATH=%LOCALAPPDATA%\Programs\node-v24.22.1-win-x64;%PATH%"
cd /d "%~dp0"
echo Iniciando MusicFlow en http://localhost:5173 ...
start "" "http://localhost:5173"
node.exe "./node_modules/vite/bin/vite.js" --host --port 5173
pause
