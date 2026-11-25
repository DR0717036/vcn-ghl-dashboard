// Rep views never carry Opportunity Value (owner request 2026-11-24).
//
// Runs against a RUNNING dashboard (start it with `npm run dev`, or point
// TEST_BASE_URL at one) using AUTH_SECRET from .env to mint short-lived
// session cookies: one for the first admin in config/users.json and one for
// every rep who can sign in today (config/sales-reps.json). It then fetches
// the rep pages (/me, /invoices, /invoices/<month>) and every /api/me
// response (each drilldown kind, each milestone, each semester, the calls),
// both as the rep and as the admin viewing as the rep, and fails if any of
// them contains an Opportunity Value field or the words "Opportunity Value"
// (or a call recording id, which reps must not get either). Two sanity
// checks prove the detector itself works on the admin side, where
// Opportunity Value is still shown. Nothing here writes anywhere, and the
// secret and cookies are never printed.
//
//   npm test                 (TEST_BASE_URL defaults to http://localhost:3000)

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";
import { encode } from "@auth/core/jwt";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = (process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECURE = BASE.startsWith("https://");
const COOKIE = SECURE ? "__Secure-authjs.session-token" : "authjs.session-token";

/** Keys that carry Opportunity Value anywhere in the dashboard's data (mirrors src/lib/me/repSafe.ts), plus the recording id. */
const FORBIDDEN_KEYS = ["value", "value_at_event", "monetary_value", "monetaryValue", "opportunityValue", "oppValue", "wonValue", "openValue", "currentValue", "prevValue", "valueMissing", "zeroValue", "recordingId"];
/** The same keys as they would appear serialised inside a page (a client component's props); plain "value" is excluded here because charts legitimately carry {label, value} points. */
const FORBIDDEN_TOKENS = FORBIDDEN_KEYS.filter((k) => k !== "value").map((k) => `"${k}"`);
const FORBIDDEN_PHRASES = [/opportunity value/i, /open value/i, /value at (the )?(time|event)/i];

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
function envVar(name) {
  const line = fs
    .readFileSync(path.join(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not set in .env`);
  return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, "$1");
}

const secret = envVar("AUTH_SECRET");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthKey = today.slice(0, 7);
const users = readJson("config/users.json");
const adminEmail = (users.admins ?? users.allowedEmails ?? [])[0];
assert.ok(adminEmail, "config/users.json lists no admin");
const allReps = readJson("config/sales-reps.json").reps;
const signInReps = allReps.filter((r) => r.signInEmail && (!r.startDate || today >= r.startDate) && (!r.endDate || today <= r.endDate));
const mapping = readJson("config/ghl-mapping.json");
const milestoneKeys = [...(mapping.kpiMilestones ?? []), ...(mapping.milestones ?? [])].map((m) => m.key);
const semesterKeys = (mapping.semesters?.list ?? []).map((s) => s.key);

async function cookieFor(email) {
  return encode({ token: { name: "rep-views test", email, sub: "test" }, secret, salt: COOKIE, maxAge: 1800 });
}

async function get(pathname, cookie) {
  const res = await fetch(BASE + pathname, { headers: { cookie: `${COOKIE}=${cookie}` }, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

/** Every path at which one of the forbidden keys appears in a JSON value. */
function forbiddenKeyPaths(v, at = "$", out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => forbiddenKeyPaths(x, `${at}[${i}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.includes(k)) out.push(`${at}.${k}`);
      forbiddenKeyPaths(x, `${at}.${k}`, out);
    }
  return out;
}

function assertCleanText(text, what) {
  for (const re of FORBIDDEN_PHRASES) assert.ok(!re.test(text), `${what} mentions Opportunity Value (${re})`);
  for (const t of FORBIDDEN_TOKENS) assert.ok(!text.includes(t), `${what} carries the field ${t}`);
}

function assertCleanJson(json, text, what) {
  const paths = forbiddenKeyPaths(json);
  assert.deepEqual([...new Set(paths.map((p) => p.replace(/\[\d+\]/g, "[]")))], [], `${what} carries Opportunity Value or recording fields`);
  assertCleanText(text, what);
}

/** The /api/me/drilldown queries worth checking for one rep (admins add &as=). Milestone and submission lists read contact details from GHL, so they use this month; wons and calls read the cache only and use the year. */
function drilldownQueries() {
  const q = [];
  for (const key of milestoneKeys) q.push(`kind=milestone&key=${encodeURIComponent(key)}&range=this_month`);
  q.push("kind=won&program=army&range=this_year");
  for (const s of semesterKeys) q.push(`kind=won&program=veteran&semester=${encodeURIComponent(s)}&range=this_year`);
  q.push("kind=subs&program=army", "kind=subs&program=veteran", "kind=calls&range=this_year", "kind=calls&range=this_month");
  for (const which of ["booked", "scheduled", "cohort", "lost", "ngt"]) q.push(`kind=appt&which=${which}&range=this_year`);
  q.push("kind=needsCall");
  return q;
}

let admin;
before(async () => {
  let res;
  try {
    res = await fetch(BASE + "/login", { redirect: "manual" });
  } catch (err) {
    throw new Error(`No dashboard at ${BASE} (${err.message}). Start it with "npm run dev" or set TEST_BASE_URL.`);
  }
  assert.ok(res.status < 500, `The dashboard at ${BASE} answered ${res.status}`);
  admin = await cookieFor(adminEmail);
});

describe("detector sanity (admin views still show Opportunity Value)", () => {
  test("the admin scorecard mentions Opportunity Value", async () => {
    const r = await get("/", admin);
    assert.equal(r.status, 200);
    assert.ok(/opportunity value/i.test(r.text), "the admin page should still say Opportunity Value; if it does not, this test's detector is not being exercised");
  });
  test("an admin drilldown carries value fields", async () => {
    const r = await get(`/api/drilldown?kind=won&range=this_year`, admin);
    assert.equal(r.status, 200, r.text.slice(0, 200));
    assert.ok(forbiddenKeyPaths(r.json).length > 0, "the admin won drilldown should carry value fields; the key walker found none");
  });
});

for (const rep of allReps) {
  describe(`admin viewing as ${rep.name}`, () => {
    const as = `as=${encodeURIComponent(rep.userId)}`;
    test("/me", async () => {
      const r = await get(`/me?${as}&range=this_month`, admin);
      assert.equal(r.status, 200, `/me answered ${r.status}`);
      assertCleanText(r.text, "/me");
      assert.ok(!/My scorecard/.test(r.text), "/me still has a My scorecard section");
      assert.ok(!/>My commission</.test(r.text) && !/>My leads</.test(r.text), "/me still has a My commission or My leads section");
      assert.ok(/My activity/.test(r.text), "/me has no My activity section");
      assert.ok(/My appointments/.test(r.text) && /Mark the outcome/.test(r.text), "/me has no My appointments section");
    });
    test("/me for the year", async () => {
      const r = await get(`/me?${as}&range=this_year`, admin);
      assert.equal(r.status, 200);
      assertCleanText(r.text, "/me (this_year)");
    });
    test("/invoices and this month's invoice", async () => {
      const list = await get(`/invoices?${as}`, admin);
      assert.equal(list.status, 200);
      assertCleanText(list.text, "/invoices");
      const month = await get(`/invoices/commission/${monthKey}?${as}`, admin);
      assert.ok(month.status === 200 || month.status === 307, `/invoices/commission/${monthKey} answered ${month.status}`);
      assertCleanText(month.text, `/invoices/commission/${monthKey}`);
      const base = await get(`/invoices/base/2026-11-30?${as}`, admin);
      assert.ok(base.status === 200 || base.status === 307, `/invoices/base/2026-11-30 answered ${base.status}`);
      assertCleanText(base.text, "/invoices/base/2026-11-30");
    });
    for (const q of drilldownQueries()) {
      test(`/api/me/drilldown?${q}`, async () => {
        const r = await get(`/api/me/drilldown?${q}&${as}`, admin);
        assert.equal(r.status, 200, r.text.slice(0, 300));
        assert.ok(r.json && r.json.ok === true, "not a drilldown result");
        assertCleanJson(r.json, r.text, `/api/me/drilldown?${q}`);
        for (const row of r.json.rows) assert.ok("commission" in row || q.startsWith("kind=calls") || q.startsWith("kind=appt") || q.startsWith("kind=needsCall"), "a submission or won row lacks the commission field");
      });
    }
  });
}

for (const rep of signInReps) {
  describe(`signed in as ${rep.name}`, () => {
    let cookie;
    before(async () => {
      cookie = await cookieFor(rep.signInEmail);
    });
    test("/me", async () => {
      const r = await get("/me?range=this_month", cookie);
      assert.equal(r.status, 200, `/me answered ${r.status}`);
      assertCleanText(r.text, "/me");
    });
    test("/invoices", async () => {
      const r = await get("/invoices", cookie);
      assert.equal(r.status, 200);
      assertCleanText(r.text, "/invoices");
      const month = await get(`/invoices/commission/${monthKey}`, cookie);
      assertCleanText(month.text, `/invoices/commission/${monthKey}`);
    });
    test("a rep's ?as= is ignored and the admin drilldown is refused", async () => {
      const other = allReps.find((r) => r.userId !== rep.userId);
      const r = await get(`/api/me/drilldown?kind=calls&range=this_month&as=${encodeURIComponent(other.userId)}`, cookie);
      assert.equal(r.status, 200);
      assertCleanJson(r.json, r.text, "/api/me/drilldown as a rep");
      const denied = await get("/api/drilldown?kind=won&range=this_year", cookie);
      assert.equal(denied.status, 403, "a rep reached the admin drilldown");
    });
    for (const q of drilldownQueries()) {
      test(`/api/me/drilldown?${q}`, async () => {
        const r = await get(`/api/me/drilldown?${q}`, cookie);
        assert.equal(r.status, 200, r.text.slice(0, 300));
        assertCleanJson(r.json, r.text, `/api/me/drilldown?${q}`);
      });
    }
  });
}
