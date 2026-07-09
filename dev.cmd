@echo off
setlocal
cd /d "%~dp0"
set "CI=true"
set "PATH=C:\Users\Vichy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
"C:\Users\Vichy\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd" --config.confirmModulesPurge=false dev -- --port 5173 --host 0.0.0.0
