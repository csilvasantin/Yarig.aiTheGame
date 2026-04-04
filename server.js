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

// ── HTTP Server ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  if (url === '/yarig/status') {
    jsonResponse(res, { connected: loggedIn, email: YARIG_EMAIL });
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
