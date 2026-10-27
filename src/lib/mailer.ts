// Outbound email over Gmail SMTP (smtp.gmail.com, port 465, implicit TLS)
// using the account in GMAIL_USER with the app password in GMAIL_APP_PASSWORD.
// A small SMTP client on Node's built-in tls module, so no mail library is
// added to the project. Builds a multipart message with a plain-text part,
// an HTML part, optional inline images (referenced as cid:<id>), and
// optional file attachments (e.g. an invoice PDF).
// Never logs or returns the credentials. Server-only.

import { randomUUID } from "node:crypto";
import tls from "node:tls";

export interface InlineImage {
  cid: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

/** A file attached to the message (shown as a download, not inline). */
export interface Attachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MailMessage {
  from: { name: string; address: string };
  to: string[];
  subject: string;
  text: string;
  html: string;
  inline?: InlineImage[];
  attachments?: Attachment[];
}

export interface MailResult {
  messageId: string;
  /** The server's final reply to DATA, e.g. "250 2.0.0 OK ... - gsmtp". */
  response: string;
}

export function gmailConfigured(): { ok: boolean; reason?: string } {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user) return { ok: false, reason: "GMAIL_USER is not set" };
  if (!pass) return { ok: false, reason: "GMAIL_APP_PASSWORD is not set" };
  return { ok: true };
}

const CRLF = "\r\n";

function b64(data: Buffer | string): string {
  const s = Buffer.isBuffer(data) ? data.toString("base64") : Buffer.from(data, "utf8").toString("base64");
  return s.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd();
}

/**
 * Quoted-printable (RFC 2045) for the text parts: readable ASCII stays as it is, so the encoded part is
 * barely larger than the text itself. Base64 would add a third, and Gmail's clipping limit (about 102 KB)
 * is measured on the encoded HTML part. Lines are kept to 76 characters with soft breaks.
 */
export function qp(text: string): string {
  const bytes = Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8");
  const lines: string[] = [];
  let line = "";
  const endLine = () => {
    // Trailing whitespace is not allowed to end a line in quoted-printable.
    if (line.endsWith(" ")) line = line.slice(0, -1) + "=20";
    else if (line.endsWith("\t")) line = line.slice(0, -1) + "=09";
    lines.push(line);
    line = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13 && bytes[i + 1] === 10) {
      endLine();
      i++;
      continue;
    }
    const tok = (b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9 ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
    if (line.length + tok.length > 75) {
      lines.push(line + "=");
      line = "";
    }
    line += tok;
  }
  if (line) endLine();
  // A text that ends with a line break keeps it (the loop consumed the CRLF without opening a new line).
  return lines.join(CRLF) + (bytes.length >= 2 && bytes[bytes.length - 2] === 13 && bytes[bytes.length - 1] === 10 ? CRLF : "");
}

/**
 * For an 8BITMIME session the text parts go as UTF-8 exactly as they are (no "=3D" for every equals sign,
 * no soft breaks), which keeps the HTML part the same size Gmail will measure. SMTP lines may not exceed
 * 998 bytes, so a long line is split between two tags (or at a space) well before that.
 */
export function wrap8bit(text: string, maxChars = 700): string {
  return text
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .flatMap((line) => {
      const out: string[] = [];
      while (Buffer.byteLength(line) > 990) {
        let cut = line.lastIndexOf("><", maxChars) + 1;
        if (cut <= 0) cut = line.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = Math.min(maxChars, line.length - 1);
        while (cut > 1 && Buffer.byteLength(line.slice(0, cut)) > 990) cut = Math.floor(cut / 2);
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
      out.push(line);
      return out;
    })
    .join(CRLF);
}

function encodeHeaderText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function addr(name: string, address: string): string {
  const safe = name.replace(/["\r\n]/g, "");
  return safe ? `"${encodeHeaderText(safe)}" <${address}>` : address;
}

/** The raw RFC 5322 message, CRLF line endings, ready for DATA. */
export function buildMime(msg: MailMessage, messageId: string, opts: { eightBit?: boolean } = {}): string {
  const textEncoding = opts.eightBit ? "8bit" : "quoted-printable";
  const encodeText = (s: string) => (opts.eightBit ? wrap8bit(s) : qp(s));
  const alt = `alt-${randomUUID()}`;
  const rel = `rel-${randomUUID()}`;
  const domain = msg.from.address.split("@")[1] || "localhost";
  const headers = [
    `From: ${addr(msg.from.name, msg.from.address)}`,
    `To: ${msg.to.join(", ")}`,
    `Subject: ${encodeHeaderText(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  const alternative = [
    `--${alt}`,
    "Content-Type: text/plain; charset=utf-8",
    `Content-Transfer-Encoding: ${textEncoding}`,
    "",
    encodeText(msg.text),
    `--${alt}`,
    "Content-Type: text/html; charset=utf-8",
    `Content-Transfer-Encoding: ${textEncoding}`,
    "",
    encodeText(msg.html),
    `--${alt}--`,
  ];
  const inline = msg.inline ?? [];
  const attachments = msg.attachments ?? [];
  // The text/HTML pair, wrapped in multipart/related when there are inline images.
  const inner: { type: string; lines: string[] } = inline.length === 0 ? { type: `multipart/alternative; boundary="${alt}"`, lines: alternative } : { type: `multipart/related; boundary="${rel}"; type="multipart/alternative"`, lines: [] };
  if (inline.length > 0) inner.lines = [
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    ...alternative,
    ...inline.flatMap((img) => [
      `--${rel}`,
      `Content-Type: ${img.contentType}; name="${img.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${img.filename}"`,
      "",
      b64(img.data),
    ]),
    `--${rel}--`,
  ];
  if (attachments.length === 0) return [...headers, `Content-Type: ${inner.type}`, "", ...inner.lines, ""].join(CRLF);
  // Attachments: multipart/mixed around the message body plus one part per file.
  const mixed = `mixed-${randomUUID()}`;
  const safeName = (n: string) => n.replace(/["\r\n]/g, "");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: ${inner.type}`,
    "",
    ...inner.lines,
    ...attachments.flatMap((a) => [`--${mixed}`, `Content-Type: ${a.contentType}; name="${safeName(a.filename)}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${safeName(a.filename)}"`, "", b64(a.data)]),
    `--${mixed}--`,
    "",
  ].join(CRLF);
}

class SmtpError extends Error {
  readonly step: string;
  readonly code: number;
  constructor(step: string, code: number, reply: string) {
    super(`SMTP ${step} failed: ${code} ${reply.replace(/\r?\n/g, " ").slice(0, 200)}`);
    this.step = step;
    this.code = code;
  }
}

interface SmtpReply {
  code: number;
  text: string;
}

interface SmtpSession {
  expect: (step: string, ok: (code: number) => boolean, send?: string) => Promise<SmtpReply>;
  write: (line: string) => void;
  close: () => void;
}

const is2xx = (c: number) => c >= 200 && c < 300;

/** Opens a TLS connection and reads the greeting; the caller drives the rest of the conversation. */
async function openSmtp(host: string, port: number, timeoutMs: number): Promise<SmtpSession> {
  const socket = tls.connect({ host, port, servername: host });
  socket.setEncoding("utf8");
  let buffer = "";
  let waiter: { resolve: (r: SmtpReply) => void; reject: (e: Error) => void } | null = null;
  const fail = (e: Error) => {
    const w = waiter;
    waiter = null;
    if (w) w.reject(e);
  };
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    // A reply ends with a line "NNN text" (space after the code); "NNN-text" lines continue it.
    const lines = buffer.split(CRLF);
    const endIdx = lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
    if (endIdx < 0) return;
    const reply = lines.slice(0, endIdx + 1);
    buffer = lines.slice(endIdx + 1).join(CRLF);
    const code = Number(reply[reply.length - 1].slice(0, 3));
    const w = waiter;
    waiter = null;
    if (w) w.resolve({ code, text: reply.map((l) => l.slice(4)).join("\n") });
  });
  socket.on("error", (e) => fail(e));
  socket.on("close", () => fail(new Error("SMTP connection closed")));
  const read = (step: string): Promise<SmtpReply> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter = null;
        reject(new Error(`SMTP ${step}: no reply within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      waiter = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  const expect = async (step: string, ok: (code: number) => boolean, send?: string) => {
    if (send !== undefined) socket.write(send + CRLF);
    const r = await read(step);
    if (!ok(r.code)) throw new SmtpError(step, r.code, r.text);
    return r;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
      setTimeout(() => reject(new Error(`SMTP connect: no TLS handshake within ${timeoutMs / 1000}s`)), timeoutMs);
    });
    await expect("greeting", (c) => c === 220);
  } catch (e) {
    socket.destroy();
    throw e;
  }
  return {
    expect,
    write: (line) => {
      try {
        socket.write(line + CRLF);
      } catch {
        // best effort (QUIT after the message is accepted)
      }
    },
    close: () => socket.destroy(),
  };
}

function credentials(): { user: string; plain: string } {
  const user = process.env.GMAIL_USER?.trim() ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") ?? "";
  return { user, plain: Buffer.from(`\u0000${user}\u0000${pass}`, "utf8").toString("base64") };
}

/** One SMTP session: connect, EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT. */
export async function sendGmail(msg: MailMessage, opts: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<MailResult> {
  const configured = gmailConfigured();
  if (!configured.ok) throw new Error(configured.reason);
  if (msg.to.length === 0) throw new Error("no recipients");
  const host = opts.host ?? "smtp.gmail.com";
  const port = opts.port ?? 465;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const messageId = randomUUID();
  const { plain } = credentials();
  const s = await openSmtp(host, port, timeoutMs);
  try {
    const ehlo = await s.expect("EHLO", is2xx, `EHLO ${msg.from.address.split("@")[1] || "localhost"}`);
    // Gmail advertises 8BITMIME; with it the text parts go unencoded, which keeps the HTML part at its real size.
    const eightBit = /^8BITMIME$/im.test(ehlo.text);
    const raw = buildMime(msg, messageId, { eightBit });
    await s.expect("AUTH", (c) => c === 235, `AUTH PLAIN ${plain}`);
    await s.expect("MAIL FROM", is2xx, `MAIL FROM:<${msg.from.address}>${eightBit ? " BODY=8BITMIME" : ""}`);
    for (const to of msg.to) await s.expect(`RCPT TO ${to}`, is2xx, `RCPT TO:<${to}>`);
    await s.expect("DATA", (c) => c === 354, "DATA");
    // Dot-stuffing: a line starting with "." must be sent as "..".
    const body = raw.replace(/\r\n\./g, "\r\n..");
    const final = await s.expect("message", is2xx, body + CRLF + ".");
    s.write("QUIT");
    return { messageId, response: final.text.split("\n")[0] };
  } finally {
    s.close();
  }
}

/** Connects, says hello, and authenticates with the Gmail credentials, then quits: proves this host can send, without sending anything. */
export async function verifyGmail(opts: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<{ ok: boolean; detail: string; eightBit: boolean; durationMs: number }> {
  const t0 = Date.now();
  const configured = gmailConfigured();
  if (!configured.ok) return { ok: false, detail: configured.reason ?? "Gmail is not configured", eightBit: false, durationMs: 0 };
  const host = opts.host ?? "smtp.gmail.com";
  const port = opts.port ?? 465;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const { user, plain } = credentials();
  try {
    const s = await openSmtp(host, port, timeoutMs);
    try {
      const ehlo = await s.expect("EHLO", is2xx, `EHLO ${user.split("@")[1] || "localhost"}`);
      const eightBit = /^8BITMIME$/im.test(ehlo.text);
      const auth = await s.expect("AUTH", (c) => c === 235, `AUTH PLAIN ${plain}`);
      s.write("QUIT");
      return { ok: true, detail: `${host}:${port} accepted the credentials (${auth.text.split("\n")[0]})`, eightBit, durationMs: Date.now() - t0 };
    } finally {
      s.close();
    }
  } catch (e) {
    return { ok: false, detail: (e as Error).message, eightBit: false, durationMs: Date.now() - t0 };
  }
}
