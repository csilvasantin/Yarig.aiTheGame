/**
 * Yarig.aiTheGame — Proxy server
 *
 * Serves the game and proxies Yarig.ai API calls with session management.
 * Handles PHP session cookie rotation automatically.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');

// yarig.ai has an incomplete SSL certificate chain
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && !key.startsWith('#')) process.env[key.trim()] = val.join('=').trim();
  });
}

const PORT = parseInt(process.env.PORT || '9124');
const YARIG_EMAIL = process.env.YARIG_EMAIL || '';
const YARIG_PASSWORD = process.env.YARIG_PASSWORD || '';
const YARIG_HOST = 'yarig.ai';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DIARIO_REPO = 'csilvasantin/18.-diario';

// ── Philips Hue ────────────────────────────────────────────
const HUE_BRIDGE_IP = process.env.HUE_BRIDGE_IP || '';
const HUE_API_KEY = process.env.HUE_API_KEY || '';
let hueSessionOwner = ''; // tab ID of the active controller

function hueRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: HUE_BRIDGE_IP,
      port: 443,
      path: `/api/${HUE_API_KEY}${endpoint}`,
      method,
      rejectAuthorized: false,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    if (body) {
      const bodyStr = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      req.on('error', reject);
      req.write(bodyStr);
    } else {
      req.on('error', reject);
    }
    req.end();
  });
}

// ── Session management ─────────────────────────────────────

let yarigCookies = {};
let loggedIn = false;

function cookieHeader() {
  return Object.entries(yarigCookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseCookies(headers) {
  const setCookies = headers['set-cookie'] || [];
  (Array.isArray(setCookies) ? setCookies : [setCookies]).forEach(sc => {
    const [pair] = sc.split(';');
    const [name, ...valParts] = pair.split('=');
    if (name) yarigCookies[name.trim()] = valParts.join('=').trim();
  });
}

function yarigRequest(method, urlPath, postData) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: YARIG_HOST,
      port: 443,
      path: urlPath,
      method,
      rejectAuthorized: false,
      headers: {
        'Cookie': cookieHeader(),
        'User-Agent': 'YarigTheGame/1.0',
      },
    };

    if (postData) {
      const body = typeof postData === 'string' ? postData : new URLSearchParams(postData).toString();
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(opts, res => {
      parseCookies(res.headers);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });

    req.on('error', reject);
    if (postData) {
      const body = typeof postData === 'string' ? postData : new URLSearchParams(postData).toString();
      req.write(body);
    }
    req.end();
  });
}

async function yarigLogin() {
  if (!YARIG_EMAIL || !YARIG_PASSWORD) {
    console.error('[yarig] No credentials configured');
    return false;
  }
  try {
    // Get login page first (establish session)
    await yarigRequest('GET', '/registration/login');
    // POST login
    const res = await yarigRequest('POST', '/registration/login', {
      email: YARIG_EMAIL,
      password: YARIG_PASSWORD,
      submit: 'Entrar',
    });
    // Check redirect to /tasks (login successful)
    if (res.status === 302 || res.status === 301) {
      const loc = res.headers.location || '';
      if (loc.includes('/tasks') || loc.includes('/dashboard')) {
        // Follow redirect to complete session
        await yarigRequest('GET', loc.replace('https://yarig.ai', ''));
        loggedIn = true;
        console.log('[yarig] Login successful');
        return true;
      }
    }
    // Some servers return 200 with the tasks page directly
    if (res.status === 200 && (res.data.includes('Mis tareas') || res.data.includes('task-day-resume'))) {
      loggedIn = true;
      console.log('[yarig] Login successful (200)');
      return true;
    }
    console.error('[yarig] Login failed:', res.status, res.headers.location || '');
    return false;
  } catch (e) {
    console.error('[yarig] Login error:', e.message);
    return false;
  }
}

async function yarigAPI(urlPath, postData) {
  if (!loggedIn) {
    if (!await yarigLogin()) return null;
  }

  try {
    const res = await yarigRequest('POST', urlPath, postData);
    if (res.status === 200) {
      try { return JSON.parse(res.data); } catch { return res.data; }
    }
    // Session expired — retry login
    loggedIn = false;
    if (await yarigLogin()) {
      const retry = await yarigRequest('POST', urlPath, postData);
      if (retry.status === 200) {
        try { return JSON.parse(retry.data); } catch { return retry.data; }
      }
    }
    return null;
  } catch (e) {
    console.error('[yarig] API error:', e.message);
    return null;
  }
}

// ── Diario (GitHub) integration ────────────────────────────

function githubRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      port: 443,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'YarigTheGame/1.0',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function todayMadrid() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

function monthNameES(isoDate) {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [, m, d] = isoDate.split('-');
  return `${parseInt(d)} de ${months[parseInt(m) - 1]}`;
}

function taskText(t) {
  return t.description || t.name || t.text || t.title || JSON.stringify(t);
}

async function pushDiaryEntry(taskList, userEmail) {
  if (!GITHUB_TOKEN) { console.error('[diario] No GITHUB_TOKEN configured'); return false; }
  const date = todayMadrid();
  const year = date.split('-')[0];
  const titleDate = `${monthNameES(date)} de ${year}`;

  const indexRes = await githubRequest('GET', `/repos/${DIARIO_REPO}/contents/index.html`);
  if (indexRes.status !== 200) { console.error('[diario] Could not fetch index.html:', indexRes.status); return false; }
  const indexSha = indexRes.data.sha;
  let indexContent = Buffer.from(indexRes.data.content, 'base64').toString('utf8');

  const completed = taskList.filter(t => t.finished || t.completed || t.done);
  const pending   = taskList.filter(t => !t.finished && !t.completed && !t.done);
  const sections  = [];
  if (completed.length) sections.push({ heading: 'Tareas completadas', items: completed.map(taskText) });
  if (pending.length)   sections.push({ heading: 'Tareas pendientes',  items: pending.map(taskText) });
  if (!sections.length) sections.push({ heading: 'Actividad', items: [`Sin tareas registradas por ${userEmail}`] });

  const sectionsJs = sections.map(s =>
    `      {\n        heading: ${JSON.stringify(s.heading)},\n        items: [\n${s.items.map(i => `          ${JSON.stringify(i)}`).join(',\n')}\n        ]\n      }`
  ).join(',\n');
  const newEntry = `  {\n    date: "${date}",\n    title: "${titleDate}",\n    author: "Yarig.ai",\n    sections: [\n${sectionsJs}\n    ]\n  },`;

  // Replace existing entry for today or prepend
  const marker = `date: "${date}"`;
  const markerIdx = indexContent.indexOf(marker);
  if (markerIdx !== -1) {
    const start = indexContent.lastIndexOf('  {', markerIdx);
    const end   = indexContent.indexOf('  },', markerIdx) + 4;
    indexContent = indexContent.substring(0, start) + newEntry + indexContent.substring(end);
  } else {
    indexContent = indexContent.replace('const entries = [', `const entries = [\n${newEntry}`);
  }

  const pushRes = await githubRequest('PUT', `/repos/${DIARIO_REPO}/contents/index.html`, {
    message: `Diario ${date} [Yarig.ai] — ${userEmail}`,
    content: Buffer.from(indexContent).toString('base64'),
    sha: indexSha,
  });
  if (pushRes.status !== 200 && pushRes.status !== 201) {
    console.error('[diario] Push index.html failed:', pushRes.status); return false;
  }

  // Build and push .md
  const mdLines = [
    `# Diario - ${titleDate} [Yarig.ai]`, '',
    ...sections.flatMap((s, si) => [
      `${si + 1}. ${s.heading}`,
      ...s.items.map((item, ii) => `   ${String.fromCharCode(97 + ii)}. ${item}`),
    ]),
  ];
  const mdRes = await githubRequest('GET', `/repos/${DIARIO_REPO}/contents/${date}.md`);
  const mdBody = {
    message: `Diario ${date} [Yarig.ai] — ${userEmail}`,
    content: Buffer.from(mdLines.join('\n') + '\n').toString('base64'),
  };
  if (mdRes.status === 200) mdBody.sha = mdRes.data.sha;
  await githubRequest('PUT', `/repos/${DIARIO_REPO}/contents/${date}.md`, mdBody);

  console.log(`[diario] Entry ${date} pushed for ${userEmail}`);
  return true;
}

// ── HTTP Server ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve(Object.fromEntries(new URLSearchParams(body))); }
    });
  });
}

function jsonResponse(res, data) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // ── Yarig API routes ──

  if (url === '/yarig/today') {
    const data = await yarigAPI('/tasks/json_get_current_day_tasks_and_journey_info');
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/team') {
    const data = await yarigAPI('/user/json_get_customers_and_mates_like', { term: '' });
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/score') {
    const data = await yarigAPI('/score/json_user_score');
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/notifications') {
    const data = await yarigAPI('/system_notification/json_get_user_notifications');
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/task/open' && req.method === 'POST') {
    const body = await readBody(req);
    const data = await yarigAPI('/tasks/json_get_and_open_task', { id: body.id });
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/task/close' && req.method === 'POST') {
    const body = await readBody(req);
    const data = await yarigAPI('/tasks/json_close_task', {
      tid: body.tid,
      finished: body.finished || 0,
    });
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/task/add' && req.method === 'POST') {
    const body = await readBody(req);
    const tmpId = Date.now();
    const est = body.estimation || 1;
    const proj = body.project || 312;
    const taskStr = `${tmpId}#$#${est}#$#${body.description}#$#${proj}@$@`;
    const data = await yarigAPI('/tasks/json_add_tasks', { tasks: taskStr });
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/clocking' && req.method === 'POST') {
    const body = await readBody(req);
    const data = await yarigAPI('/clocking/json_add_clocking', {
      type: body.type || 0,
      todo: body.todo || '',
    });
    jsonResponse(res, data);
    return;
  }

  if (url === '/yarig/diary/push' && req.method === 'POST') {
    const todayData = await yarigAPI('/tasks/json_get_current_day_tasks_and_journey_info');
    if (!todayData) { jsonResponse(res, { ok: false, error: 'Could not fetch Yarig tasks' }); return; }
    const tasks = Array.isArray(todayData.tasks) ? todayData.tasks
      : Array.isArray(todayData) ? todayData : [];
    const ok = await pushDiaryEntry(tasks, YARIG_EMAIL);
    jsonResponse(res, { ok });
    return;
  }

  if (url === '/yarig/status') {
    jsonResponse(res, { connected: loggedIn, email: YARIG_EMAIL });
    return;
  }

  // ── Hue session lock: last tab to claim wins ──

  if (url === '/hue/claim' && req.method === 'POST') {
    const body = await readBody(req);
    hueSessionOwner = body.tabId || '';
    console.log(`[Hue] Session claimed by tab: ${hueSessionOwner}`);
    jsonResponse(res, { ok: true, owner: hueSessionOwner });
    return;
  }

  // ── Hue API routes ──

  if (url === '/hue/lights') {
    if (!HUE_BRIDGE_IP) { jsonResponse(res, { error: 'Hue not configured' }); return; }
    try {
      const data = await hueRequest('GET', '/lights');
      jsonResponse(res, data);
    } catch (e) { jsonResponse(res, { error: e.message }); }
    return;
  }

  if (url === '/hue/groups') {
    if (!HUE_BRIDGE_IP) { jsonResponse(res, { error: 'Hue not configured' }); return; }
    try {
      const data = await hueRequest('GET', '/groups');
      jsonResponse(res, data);
    } catch (e) { jsonResponse(res, { error: e.message }); }
    return;
  }

  // PUT /hue/lights/:id/state — set light state (only from session owner)
  if (url.match(/^\/hue\/lights\/\d+\/state$/) && req.method === 'PUT') {
    if (!HUE_BRIDGE_IP) { jsonResponse(res, { error: 'Hue not configured' }); return; }
    const lightId = url.split('/')[3];
    const body = await readBody(req);
    // Check session lock — reject writes from non-owner tabs
    const tabId = req.headers['x-hue-tab'] || '';
    if (hueSessionOwner && tabId && tabId !== hueSessionOwner) {
      jsonResponse(res, [{ error: { type: 901, description: 'Not session owner' } }]);
      return;
    }
    try {
      const data = await hueRequest('PUT', `/lights/${lightId}/state`, body);
      jsonResponse(res, data);
    } catch (e) { jsonResponse(res, { error: e.message }); }
    return;
  }

  // PUT /hue/groups/:id/action — set group action
  if (url.match(/^\/hue\/groups\/\d+\/action$/) && req.method === 'PUT') {
    if (!HUE_BRIDGE_IP) { jsonResponse(res, { error: 'Hue not configured' }); return; }
    const groupId = url.split('/')[3];
    const body = await readBody(req);
    try {
      const data = await hueRequest('PUT', `/groups/${groupId}/action`, body);
      jsonResponse(res, data);
    } catch (e) { jsonResponse(res, { error: e.message }); }
    return;
  }

  if (url === '/hue/status') {
    jsonResponse(res, {
      configured: !!HUE_BRIDGE_IP,
      bridge: HUE_BRIDGE_IP || null,
    });
    return;
  }

  // ── Static files ──
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  🎮 Yarig.aiTheGame running at http://localhost:${PORT}\n`);
  // Pre-login to Yarig
  yarigLogin().then(ok => {
    if (ok) console.log('  ✅ Connected to Yarig.ai');
    else console.log('  ⚠️  Could not connect to Yarig.ai (check .env)');
  });
});
