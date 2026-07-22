/**
 * PNU 학식 혼잡도 — 구글시트 기록용 Apps Script
 *
 * 사용법(자세한 건 README.md 참고):
 *  1) 구글시트 하나 만들기
 *  2) 확장 프로그램 → Apps Script 열기
 *  3) 이 코드를 전부 붙여넣고 저장
 *  4) 배포 → 새 배포 → 유형: 웹 앱
 *       - 실행 계정: 나
 *       - 액세스 권한: 모든 사용자
 *  5) 배포 후 나오는 웹 앱 URL(...·/exec)을 복사
 *  6) 서버 실행 시 그 URL을 환경변수로 지정:
 *       PowerShell:  $env:SHEET_WEBHOOK_URL = "복사한_/exec_URL"; node server.js
 */

// 기록할 시트 이름 (없으면 첫 번째 시트 사용)
var SHEET_NAME = "제보";
var TZ = "Asia/Seoul";
var HEADERS = ["날짜", "시각", "요일", "식당", "혼잡도(1-5)", "등급"];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var now = new Date();
    var days = { "1": "월", "2": "화", "3": "수", "4": "목", "5": "금", "6": "토", "7": "일" };
    var row = [
      Utilities.formatDate(now, TZ, "yyyy-MM-dd"),
      Utilities.formatDate(now, TZ, "HH:mm:ss"),
      days[Utilities.formatDate(now, TZ, "u")],
      String(body.place || ""),
      Number(body.level || 0),
      String(body.levelWord || ""),
    ];
    getSheet_().appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// 브라우저에서 URL을 열었을 때 동작 확인용
function doGet() {
  return json_({ ok: true, message: "PNU 학식 혼잡도 기록 엔드포인트 정상 동작 중" });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
