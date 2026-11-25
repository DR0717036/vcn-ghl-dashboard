// The rep dashboard must show the same numbers as the admin Program
// Submissions table (owner request 2026-11-25).
//
// Runs against a RUNNING dashboard (npm run dev, or TEST_BASE_URL) as the
// first admin in config/users.json. Two layers:
//   1. Functions: /api/admin/reconcile compares, for every rep on the roster
//      and for Today / This Week / This Month / Last Month, the admin row
//      (combined, CA 101, IAU App every semester, est. commission) with
//      every figure the rep pages compute for the same range (My
//      submissions; this month also My overview, My pace, the weekly
//      bounty). Any difference fails the test and is printed.
//   2. Rendered pages: for This Month and Last Month, the numbers in the
//      admin page's HTML (data-* hooks on the table cells) must equal the
//      numbers in /me's HTML for each rep.
// A side-by-side table is printed for every range. Nothing here writes
// anywhere, and the secret and cookies are never printed.
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
const RANGES = ["today", "this_week", "this_month", "last_month"];
const PAGE_RANGES = ["this_month", "last_month"];

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
function envVar(name) {
  const line = fs
    .readFileSync(path.join(ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not set in .env`);
  return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, "$1");
}
const secret = envVar(process.env.TEST_AUTH_SECRET_VAR || "AUTH_SECRET");
const users = readJson("config/users.json");
const adminEmail = (users.admins ?? users.allowedEmails ?? [])[0];
assert.ok(adminEmail, "config/users.json lists no admin");

async function get(pathname, cookie) {
  const res = await fetch(BASE + pathname, { headers: { cookie: `${COOKIE}=${cookie}` }, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

const usd = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toLocaleString("en-US")}`);
const num = (v) => (v === null || v === undefined ? "—" : String(v));
const pad = (s, w) => String(s).padEnd(w);

function printReport(r) {
  const lines = [`\n  ${r.label} · data as of ${r.asOf ?? "never synced"}`];
  lines.push(`  ${pad("Rep", 18)}${pad("admin table", 30)}${pad("rep pages", 30)}result`);
  for (const row of r.rows) {
    const a = `${num(row.admin.combined)} (A ${num(row.admin.army)} + V ${num(row.admin.veteran)}) ${usd(row.admin.commission)}`;
    const b = `${num(row.rep.combined)} (A ${num(row.rep.army)} + V ${num(row.rep.veteran)}) ${usd(row.rep.commission)}`;
    lines.push(`  ${pad(row.name, 18)}${pad(a, 30)}${pad(b, 30)}${row.diffs.length === 0 ? "match" : "DIFF: " + row.diffs.join("; ")}`);
  }
  console.log(lines.join("\n"));
}

let admin;
let reports = {};
before(async () => {
  let res;
  try {
    res = await fetch(BASE + "/login", { redirect: "manual" });
  } catch (err) {
    throw new Error(`No dashboard at ${BASE} (${err.message}). Start it with "npm run dev" or set TEST_BASE_URL.`);
  }
  assert.ok(res.status < 500, `The dashboard at ${BASE} answered ${res.status}`);
  admin = await encode({ token: { name: "reconcile test", email: adminEmail, sub: "test" }, secret, salt: COOKIE, maxAge: 1800 });
  const r = await get("/api/admin/reconcile?range=all", admin);
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.ok(r.json?.ok, "reconcile route did not answer ok");
  for (const rep of r.json.reports) reports[rep.range] = rep;
});

describe("admin Program Submissions row = rep pages (same functions, every range)", () => {
  for (const key of RANGES) {
    test(key, () => {
      const r = reports[key];
      assert.ok(r, `no report for ${key}`);
      printReport(r);
      assert.ok(r.rows.length > 0, "no rep on the roster");
      for (const row of r.rows) assert.deepEqual(row.diffs, [], `${row.name} · ${r.label}: ${row.diffs.join("; ")}`);
    });
  }
});

const attr = (html, re, what) => {
  const m = html.match(re);
  assert.ok(m, `${what}: hook not found in the page (${re})`);
  return m[1] === "" ? null : Number(m[1]);
};

describe("rendered admin page = rendered /me (HTML hooks)", () => {
  for (const key of PAGE_RANGES) {
    test(key, async () => {
      const r = reports[key];
      assert.ok(r, `no report for ${key}`);
      const adminPage = await get(`/?range=${key}`, admin);
      assert.equal(adminPage.status, 200, `admin page answered ${adminPage.status}`);
      for (const row of r.rows) {
        const id = row.userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const cell = adminPage.text.match(new RegExp(`data-user="${id}"[^>]*data-ca101="(\\d+)"[^>]*data-iau-all="(\\d+)"[^>]*data-combined="(\\d+)"`));
        assert.ok(cell, `${row.name}: no Program Submissions row in the admin page HTML`);
        const [, ca101, iauAll, combined] = cell.map(Number);
        const commissionCell = adminPage.text.match(new RegExp(`data-user="${id}"[^>]*data-commission="(-?[\\d.]*)"`));
        assert.ok(commissionCell, `${row.name}: no commission cell in the admin page HTML`);
        const commission = commissionCell[1] === "" ? null : Number(commissionCell[1]);
        const me = await get(`/me?as=${encodeURIComponent(row.userId)}&range=${key}`, admin);
        assert.equal(me.status, 200, `/me for ${row.name} answered ${me.status}`);
        const meCombined = attr(me.text, /data-me-combined="(\d*)"/, `${row.name} /me combined`);
        assert.equal(meCombined, combined, `${row.name} · ${r.label}: admin table Combined ${combined}, /me Combined submissions ${meCombined}`);
        assert.equal(combined, row.admin.combined, `${row.name}: the admin HTML (${combined}) differs from the admin function (${row.admin.combined})`);
        const meCommission = attr(me.text, /data-me-commission-range="(-?[\d.]*)"/, `${row.name} /me est. commission line`);
        assert.equal(meCommission, commission, `${row.name} · ${r.label}: admin commission cell ${usd(commission)}, /me est. commission line ${usd(meCommission)}`);
        if (key === "this_month") {
          const mode = me.text.match(/data-me-overview-mode="(momentum|commission)"/);
          assert.ok(mode, `${row.name}: no My overview card in /me`);
          if (mode[1] === "momentum") {
            // Card 1 shows the Army / Veteran tiles only in momentum mode; in commission mode the split is still checked at function level above.
            assert.equal(attr(me.text, /data-me-split-army="(\d*)"/, `${row.name} /me Army tile`), ca101, `${row.name}: Army tile differs from the admin CA 101 cell (${ca101})`);
            assert.equal(attr(me.text, /data-me-split-veteran="(\d*)"/, `${row.name} /me Veteran tile`), iauAll, `${row.name}: Veteran tile differs from the admin IAU App cell (${iauAll})`);
          }
          assert.equal(attr(me.text, /data-me-milestone-mtd="(\d*)"/, `${row.name} /me Next milestone`), combined, `${row.name}: Next milestone count differs from the admin Combined cell (${combined})`);
          assert.equal(attr(me.text, /data-me-pace-mtd="(\d*)"/, `${row.name} /me My pace`), combined, `${row.name}: My pace month-to-date differs from the admin Combined cell (${combined})`);
          assert.equal(attr(me.text, /data-me-commission-mtd="(-?[\d.]*)"/, `${row.name} /me My pace commission`), commission, `${row.name}: My pace commission differs from the admin commission cell (${usd(commission)})`);
          assert.equal(attr(me.text, /data-me-rank="(\d*)"/, `${row.name} /me rank`), row.admin.rank, `${row.name}: /me rank differs from the admin table order (#${row.admin.rank})`);
        }
      }
    });
  }
});
