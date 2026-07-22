// PNU 학식 혼잡도 + 식단 연동 로컬 서버 (의존성 0, API 키 불필요)
// 실행:  node server.js  →  http://localhost:3000
//
// 부산대 스마트캠퍼스 식단 페이지를 서버에서 가져와(브라우저 CORS 우회)
// 파싱한 뒤 /api/menu 로 제공합니다.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const UA = "Mozilla/5.0 (compatible; PNU-haksik-demo/1.0)";
// 구글 Apps Script 웹앱 /exec URL (README 참고). 없으면 시트 기록은 건너뜀.
const SHEET_WEBHOOK_URL = process.env.SHEET_WEBHOOK_URL || "";

// 가져올 캠퍼스 탭들 (금정 + 학생(부산))
const CAMPUS_URLS = [
  "https://m.pusan.ac.kr/ko/meals/geumjeong",
  "https://m.pusan.ac.kr/ko/meals/pusan",
];

// HTML 엔티티/태그 정리
function clean(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// 한 페이지 HTML → 식당 배열 파싱
function parseMenuPage(html) {
  const cafeterias = [];

  // 날짜 (topbar h4)
  let date = "";
  const dm = /<h4>\s*([\d.]+)\s*<span>([^<]+)<\/span>/.exec(html);
  if (dm) date = `${dm[1].trim()} ${dm[2].trim()}`;

  // 식당 블록: student_list / faculty_list
  const blockRe = /<div class="(?:student|faculty)_list list">([\s\S]*?)<\/ul>/g;
  let bm;
  while ((bm = blockRe.exec(html))) {
    const block = bm[1];
    const titleM = /<h5 class="title">([^<]+)<\/h5>/.exec(block);
    if (!titleM) continue;
    const title = clean(titleM[1]);

    // 운영시간 (part 스팬들)
    const hours = [...block.matchAll(/<span class="part">([^<]+)<\/span>/g)]
      .map((m) => clean(m[1]))
      .filter(Boolean);

    // 끼니 항목들
    const meals = [];
    const itemRe = /<li class="item">([\s\S]*?)<\/li>/g;
    let im;
    while ((im = itemRe.exec(block))) {
      const item = im[1];
      const typeM = /<div class="icon">[\s\S]*?<strong>([^<]+)<\/strong>/.exec(item);
      const type = typeM ? clean(typeM[1]) : "";
      const ctxM = /<div class="context">([\s\S]*?)<\/div>\s*<\/li>?/.exec(item + "</li>");
      const ctx = ctxM ? ctxM[1] : item;

      if (/class="empty"/.test(ctx)) {
        meals.push({ type, empty: true, options: [] });
        continue;
      }

      // 정식-5,000원 + 메뉴 목록 쌍
      const options = [];
      const optRe = /<strong class="blue_text">([^<]+)<\/strong>\s*<p><span>([\s\S]*?)<\/span><\/p>/g;
      let om;
      while ((om = optRe.exec(ctx))) {
        const label = clean(om[1]);
        const items = clean(om[2].replace(/<br\s*\/?>/g, "\n"))
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);
        options.push({ label, items });
      }
      meals.push({ type, empty: options.length === 0, options });
    }

    cafeterias.push({ title, hours, meals });
  }

  return { date, cafeterias };
}

async function fetchAllMenus() {
  const results = await Promise.all(
    CAMPUS_URLS.map((url) =>
      fetch(url, { headers: { "user-agent": UA } })
        .then((r) => r.text())
        .then((html) => parseMenuPage(html))
        .catch(() => ({ date: "", cafeterias: [] }))
    )
  );
  const date = results.map((r) => r.date).find(Boolean) || "";
  const cafeterias = {};
  for (const r of results) {
    for (const c of r.cafeterias) cafeterias[c.title] = c;
  }
  return { date, cafeterias, source: "m.pusan.ac.kr" };
}

// 간단한 메모리 캐시 (10분)
let cache = { ts: 0, data: null };
async function getMenus() {
  const now = fakeNow();
  if (cache.data && now - cache.ts < 10 * 60 * 1000) return cache.data;
  const data = await fetchAllMenus();
  cache = { ts: now, data };
  return data;
}
function fakeNow() {
  // Date.now() 사용 (서버 런타임에서는 정상)
  return Date.now();
}

function sendJson(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s),
  });
  res.end(s);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    fs.readFile(path.join(__dirname, "index.html"), (err, buf) => {
      if (err) {
        res.writeHead(500);
        res.end("index.html 을 찾을 수 없습니다.");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(buf);
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/menu")) {
    try {
      const data = await getMenus();
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, 502, { error: "식단 데이터를 가져오지 못했습니다: " + e.message });
    }
    return;
  }

  // 제보 → 구글시트 기록 (Apps Script 웹앱으로 서버-사이드 전달)
  if (req.method === "POST" && req.url === "/api/report") {
    let bodyStr = "";
    req.on("data", (c) => {
      bodyStr += c;
      if (bodyStr.length > 1e5) req.destroy();
    });
    req.on("end", async () => {
      let input;
      try {
        input = JSON.parse(bodyStr || "{}");
      } catch (_) {
        sendJson(res, 400, { error: "잘못된 요청" });
        return;
      }
      if (!input.place || !input.level) {
        sendJson(res, 400, { error: "place, level 필요" });
        return;
      }
      if (!SHEET_WEBHOOK_URL) {
        // 시트 미연동 상태에서도 앱은 정상 동작
        sendJson(res, 200, { ok: false, skipped: true, note: "SHEET_WEBHOOK_URL 미설정" });
        return;
      }
      try {
        const r = await fetch(SHEET_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            place: String(input.place),
            level: Number(input.level),
            levelWord: String(input.levelWord || ""),
          }),
        });
        const text = await r.text();
        sendJson(res, r.ok ? 200 : 502, { ok: r.ok, response: text.slice(0, 300) });
      } catch (e) {
        sendJson(res, 502, { ok: false, error: e.message });
      }
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n  PNU 학식 혼잡도 + 식단 데모 실행 중`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  식단 출처: m.pusan.ac.kr (10분 캐시)\n`);
  });
}

module.exports = { parseMenuPage, fetchAllMenus };
