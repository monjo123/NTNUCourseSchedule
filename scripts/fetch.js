import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import fs from "fs";

// =====================
// CONFIG
// =====================
const BASE = "https://courseap2.itc.ntnu.edu.tw";
const INDEX = `${BASE}/acadmOpenCourse/CofopdlCtrl?language=chinese`;
const API = `${BASE}/acadmOpenCourse/CofopdlCtrl`;
const DEPT_API = `${BASE}/acadmOpenCourse/CofnameCtrl`;

// =====================
// utils
// =====================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cleanText(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/<\/?br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCourse(course) {
  const normalized = {};

  for (const [key, value] of Object.entries(course)) {
    normalized[key] = cleanText(value);
  }

  return normalized;
}

function sortCourses(a, b) {
  return (
    (a.course_code || "").localeCompare(b.course_code || "", "en", { numeric: true }) ||
    (a.course_group || "").localeCompare(b.course_group || "", "en", { numeric: true }) ||
    (a.serial_no || "").localeCompare(b.serial_no || "", "en", { numeric: true })
  );
}

// async pool
async function asyncPool(limit, items, fn) {
  const ret = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    ret.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

// =====================
// client
// =====================
async function createClient() {
  const jar = new CookieJar();

  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 60000,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": INDEX,
      "Accept-Language": "zh-TW,zh;q=0.9"
    }
  }));

  await client.get(INDEX);
  await sleep(500);

  return client;
}

// =====================
// params builder
// =====================
function baseParams(year, term, dept) {
  return {
    _dc: Date.now(),
    acadmYear: year,
    acadmTerm: term,
    deptCode: dept,
    action: "showGrid",
    language: "chinese",
    start: 0,
    limit: 2000,
    page: 1
  };
}

// =====================
// safe request
// =====================
async function safeGet(client, url, params) {
  try {
    const res = await client.get(url, { params });
    await sleep(200);
    return res.data;
  } catch {
    return null;
  }
}

// =====================
// main
// =====================
export async function fetchAll(year, term) {
  const client = await createClient();

  console.log("📡 fetching departments...");

  const deptRes = await safeGet(client, DEPT_API, {
    action: "cof",
    type: "chn",
    year,
    term,
    start: 0,
    limit: 100
  });

  const deptList = JSON.parse(deptRes.replace(/'/g, '"'));
  const depts = deptList.map(d => d[0]);

  console.log(`📚 departments: ${depts.length}`);

  // =====================
  // async pool fetch
  // =====================
  const results = await asyncPool(5, depts, async (dept) => {
    const data = await safeGet(client, API, baseParams(year, term, dept));

    const list = data?.List || [];

    console.log(`→ ${dept}: ${list.length}`);

    return list;
  });

  // =====================
  // flatten + dedup
  // =====================
  const all = results.flat();

  const map = new Map();
  for (const c of all) {
    const key = c.serial_no || `${c.course_code}-${c.course_group}`;
    map.set(key, c);
  }

  const uniq = [...map.values()];

  const organized = uniq
    .map(normalizeCourse)
    .sort(sortCourses);

  console.log(`🧹 total: ${all.length} → ${organized.length}`);

  return organized;
}

// =====================
// CLI run
// =====================
if (import.meta.url === `file://${process.argv[1]}`) {
  // Fetch multiple semester options and save each under public/{year}_{term}/courses.json
  const semesters = [
    { year: 113, term: 1 },
    { year: 113, term: 2 },
    { year: 114, term: 1 },
    { year: 114, term: 2 }
  ];

  for (const sem of semesters) {
    try {
      console.log(`\n🔎 fetching ${sem.year}-${sem.term} ...`);
      const data = await fetchAll(sem.year, sem.term);
      const dir = `public/${sem.year}_${sem.term}`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/courses.json`, JSON.stringify(data, null, 2));
      console.log(`✅ saved: ${dir}/courses.json`);
    } catch (err) {
      console.error(`❌ failed to fetch ${sem.year}-${sem.term}:`, err && err.message ? err.message : err);
    }
  }
}
