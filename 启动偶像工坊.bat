@echo off
chcp 65001 >nul
title 虚拟女团工坊
cd /d "%~dp0"
start "" http://localhost:3210/
node server.mjs
pause
