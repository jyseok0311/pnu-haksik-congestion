/**
 * PNU 학식 혼잡도 — 구글시트 기록 + 집계 Apps Script
 *
 * 기능
 *  - doPost : 제보 1건을 시트에 행으로 추가
 *  - doGet?action=summary : 최근 N분 제보를 식당별로 집계해 JSON 반환
 *
 * ※ 이 파일을 수정했으면 반드시 Apps Script에서
 *    [배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포] 를 다시 해야
 *    변경 내용이 반영됩니다. (URL은 그대로 유지)
 *
 * 배포 설정: 실행 계정 = 나, 액세스 권한 = 모든 사용자
 */

var SHEET_NAME = "제보";
var TZ = "Asia/Seoul";
var HEADERS = ["날짜", "시각", "요일", "식당", "혼잡도(1-5)", "등급", "기록시각(ISO)"];
var TS_COL = 6; // 0-based: 기록시각(ISO) 컬럼 인덱스

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
      now.toISOString(), // 집계용 절대시각(UTC)
    ];
    getSheet_().appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : "";
  if (action === "summary") return summary_(e);
  return json_({ ok: true, message: "PNU 학식 혼잡도 기록 엔드포인트 정상 동작 중" });
}

// 최근 windowMin 분 제보를 식당별로 집계
function summary_(e) {
  try {
    var windowMin = Number((e.parameter && e.parameter.window) || 60);
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var cutoff = new Date().getTime() - windowMin * 60 * 1000;
    var agg = {}; // place -> { sum, count, latest(ms) }

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var place = row[3];
      var level = Number(row[4]);
      var iso = row[TS_COL];
      if (!place || !level || !iso) continue;
      var ts = new Date(iso).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
      if (!agg[place]) agg[place] = { sum: 0, count: 0, latest: 0 };
      agg[place].sum += level;
      agg[place].count += 1;
      if (ts > agg[place].latest) agg[place].latest = ts;
    }

    var places = {};
    Object.keys(agg).forEach(function (p) {
      var a = agg[p];
      places[p] = {
        level: Math.round(a.sum / a.count),
        avg: Math.round((a.sum / a.count) * 10) / 10,
        count: a.count,
        at: new Date(a.latest).toISOString(),
      };
    });

    return json_({ ok: true, window: windowMin, places: places });
  } catch (err) {
    return json_({ ok: false, error: String(err), places: {} });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
