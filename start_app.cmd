@echo off
title Anti-Gravity Integrated System
echo ==================================================
echo   Anti-Gravity System을 시작합니다.
echo ==================================================

:: 1. 증거 수집 서버 시작 (Node.js)
echo [1/3] Evidence Module 서버를 시작 중... (Port 13000)
cd "Evidence Collection Module"
start /B node server.js
cd ..

:: 2. 크롤링 및 대응 서버 시작 (Python)
echo [2/3] Crawling/Takedown 서버를 시작 중... (Port 13001)
cd module_crawl_takedown
start /B python server.py
cd ..

:: 3. 통합 오케스트레이터 시작 (FastAPI)
echo [3/3] Orchestrator를 시작합니다... (Port 8080)
echo.
echo 시스템이 준비되면 http://localhost:8080/register-ui/ 에 접속하세요.
echo ==================================================
cd pip
python orchestrator.py

pause
