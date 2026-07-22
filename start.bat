@echo off
chcp 65001 >nul
REM PNU 학식 혼잡도 데모 실행 (더블클릭)
REM 구글시트 URL은 같은 폴더의 sheet-url.txt 파일에 한 줄로 저장하세요.
REM (sheet-url.txt 는 .gitignore 로 깃허브에 올라가지 않습니다.)
if exist "%~dp0sheet-url.txt" (
  set /p SHEET_WEBHOOK_URL=<"%~dp0sheet-url.txt"
) else (
  echo [알림] sheet-url.txt 가 없어 구글시트 연동 없이 실행됩니다.
)
echo.
echo   PNU 학식 혼잡도 데모 시작
echo   브라우저에서 http://localhost:3000 을 여세요. (종료: Ctrl+C)
echo.
node server.js
pause
