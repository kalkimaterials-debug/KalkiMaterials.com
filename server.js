// Serves the static site and handles the two forms by emailing them through
// Resend (https://resend.com).
//
// Environment variables (set them in Railway → Variables):
//   RESEND_API_KEY      required for the forms to send anything
//   RESEND_FROM         sender, e.g. "Kalki Materials <hello@kalkimaterials.com>".
//                       Must be on a domain verified in Resend. Defaults to
//                       Resend's test sender, which only delivers to the
//                       Resend account owner's own address.
//   CONTACT_EMAIL       where enquiries go (default Kalkimaterials@gmail.com)
//   SITE_URL            public address of the site, used for the catalogue
//                       link (default https://www.kalkimaterials.com)
//   CATALOGUE_URL       optional override for the catalogue link; by default
//                       it is assets/kalki-catalogue.pdf on SITE_URL
//   RESEND_AUDIENCE_ID  optional; newsletter sign-ups are added to this
//                       Resend audience
const http = require('node:http');
const fs = require('node:fs');
const nodePath = require('node:path');
const handler = require('serve-handler');
const config = require('./serve.json');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Kalki Materials <onboarding@resend.dev>';
const TO = process.env.CONTACT_EMAIL || 'Kalkimaterials@gmail.com';
const SITE_URL = (process.env.SITE_URL || 'https://www.kalkimaterials.com').replace(/\/$/, '');
const CATALOGUE_FILE = nodePath.join(__dirname, 'assets', 'kalki-catalogue.pdf');
const HAS_CATALOGUE = fs.existsSync(CATALOGUE_FILE);
const CATALOGUE_URL = process.env.CATALOGUE_URL || (HAS_CATALOGUE ? SITE_URL + '/assets/kalki-catalogue.pdf' : '');
// Attach the PDF too when it is small enough to sit comfortably in an email.
const CATALOGUE_ATTACHMENT = HAS_CATALOGUE && fs.statSync(CATALOGUE_FILE).size < 10 * 1024 * 1024
  ? fs.readFileSync(CATALOGUE_FILE).toString('base64') : null;
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID || '';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Basic abuse guard: at most 5 submissions per IP per 10 minutes.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

async function resend(path, body) {
  const res = await fetch('https://api.resend.com' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

function table(rows) {
  return '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">' +
    rows.filter(([, v]) => v).map(([k, v]) =>
      `<tr><td style="color:#5C5548;vertical-align:top"><b>${esc(k)}</b></td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    '</table>';
}

async function handleCatalogue(d) {
  const f = {
    name: clean(d.name, 200), email: clean(d.email, 200), role: clean(d.role, 100),
    company: clean(d.company, 200), island: clean(d.island, 100), phone: clean(d.phone, 100),
    project: clean(d.project, 3000), monthlyDrop: d.monthlyDrop ? 'Yes' : 'No',
  };
  if (!f.name || !EMAIL_RE.test(f.email)) return 400;
  await resend('/emails', {
    from: FROM, to: [TO], reply_to: f.email,
    subject: `Catalogue request — ${f.name}${f.company ? ' (' + f.company + ')' : ''}`,
    html: table([['Name', f.name], ['Email', f.email], ['Role', f.role], ['Company', f.company],
      ['Island', f.island], ['Phone', f.phone], ['Project', f.project], ['Monthly drop', f.monthlyDrop]]),
  });
  if (CATALOGUE_URL) {
    await resend('/emails', {
      from: FROM, to: [f.email], reply_to: TO,
      subject: 'Your Kalki Materials catalogue',
      html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#26221B">` +
        `<p>Hi ${esc(f.name)},</p><p>Thanks for your interest. Here is the full catalogue — all four lines, with formats, finishes and technical data${CATALOGUE_ATTACHMENT ? '. It is attached to this email, and you can also download it here' : ''}:</p>` +
        `<p><a href="${esc(CATALOGUE_URL)}" style="display:inline-block;background:#B8623E;color:#FBF6EC;padding:12px 24px;text-decoration:none">Download the catalogue</a></p>` +
        `<p>Reply to this email with any questions about your project.</p><p>Kalki Materials</p></div>`,
      ...(CATALOGUE_ATTACHMENT && { attachments: [{ filename: 'Kalki-Materials-Catalogue.pdf', content: CATALOGUE_ATTACHMENT }] }),
    });
  }
  if (d.monthlyDrop) await addToAudience(f.email, f.name);
  return 200;
}

async function addToAudience(email, name) {
  if (!AUDIENCE_ID) return false;
  const [first_name, ...rest] = (name || '').split(' ');
  await resend(`/audiences/${AUDIENCE_ID}/contacts`, { email, first_name, last_name: rest.join(' '), unsubscribed: false })
    .catch(e => console.error(e.message)); // already subscribed etc. is not the visitor's problem
  return true;
}

async function handleNewsletter(d) {
  const email = clean(d.email, 200);
  if (!EMAIL_RE.test(email)) return 400;
  const added = await addToAudience(email, '');
  if (!added) {
    await resend('/emails', {
      from: FROM, to: [TO], reply_to: email,
      subject: `Monthly drop sign-up — ${email}`,
      html: table([['Email', email]]),
    });
  }
  return 200;
}

const ROUTES = { '/api/catalogue': handleCatalogue, '/api/newsletter': handleNewsletter };

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, status) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: status === 200 }));
}

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const route = ROUTES[path];
  if (!route) return handler(req, res, config);
  if (req.method !== 'POST') return send(res, 405);
  if (!API_KEY) { console.error('RESEND_API_KEY is not set'); return send(res, 503); }
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return send(res, 429);
  try {
    const data = await readJson(req);
    if (data.website) return send(res, 200); // honeypot: bots fill hidden fields
    send(res, await route(data));
  } catch (e) {
    console.error(path, e.message);
    send(res, 500);
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Listening on ${PORT}`));
