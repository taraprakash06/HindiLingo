'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

var PORT = parseInt(process.env.PORT || process.env.HINDI_LEARNING_PORT || '3847', 10);
var STATIC_ROOT = path.resolve(__dirname, '..', 'hindi-learning');
var OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// --- Minimal protections (public link safe-ish defaults) ---
var LIMITS = {
  bodyBytes: 256 * 1024,
  messagesMax: 30,
  messageCharsMax: 4000,
  totalCharsMax: 20000,
  ipPerMinute: 20,
  globalPerMinute: 200,
};

var ALLOWED_OPENAI_MODELS = { 'gpt-4o-mini': true };

function getClientIp(req) {
  // On Render we are behind a proxy; x-forwarded-for is a comma-separated list.
  var xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  var ra = req.socket && req.socket.remoteAddress;
  return ra ? String(ra) : 'unknown';
}

function isString(x) {
  return typeof x === 'string' || x instanceof String;
}

function validateChatPayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  if (!Array.isArray(body.messages)) return 'Missing messages array';
  if (body.messages.length < 1) return 'messages must be non-empty';
  if (body.messages.length > LIMITS.messagesMax) return 'Too many messages (max ' + LIMITS.messagesMax + ')';

  var totalChars = 0;
  for (var i = 0; i < body.messages.length; i++) {
    var m = body.messages[i];
    if (!m || typeof m !== 'object') return 'Invalid message at index ' + i;
    if (!isString(m.role) || !m.role) return 'Invalid role at index ' + i;
    var c = m.content;
    if (!isString(c)) return 'Invalid content at index ' + i;
    var s = String(c);
    if (s.length > LIMITS.messageCharsMax) return 'Message too long (max ' + LIMITS.messageCharsMax + ' chars)';
    totalChars += s.length;
    if (totalChars > LIMITS.totalCharsMax) return 'Conversation too long (max ' + LIMITS.totalCharsMax + ' chars)';
  }

  if (body.model != null && !isString(body.model)) return 'Invalid model';
  var model = (isString(body.model) && String(body.model).trim()) || 'gpt-4o-mini';
  if (!ALLOWED_OPENAI_MODELS[model]) return 'Model not allowed';

  if (body.temperature != null && typeof body.temperature !== 'number') return 'Invalid temperature';
  if (body.max_tokens != null && typeof body.max_tokens !== 'number') return 'Invalid max_tokens';

  return null;
}

function makeFixedWindowLimiter(maxPerWindow, windowMs) {
  var buckets = new Map();
  return function (key) {
    var now = Date.now();
    var b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > maxPerWindow) {
      var retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      return { ok: false, retryAfterSec: retryAfterSec };
    }
    // Opportunistic cleanup to prevent unbounded growth
    if (buckets.size > 5000) {
      buckets.forEach(function (val, k) {
        if (now >= val.resetAt) buckets.delete(k);
      });
    }
    return { ok: true };
  };
}

var allowIp = makeFixedWindowLimiter(LIMITS.ipPerMinute, 60 * 1000);
var allowGlobal = makeFixedWindowLimiter(LIMITS.globalPerMinute, 60 * 1000);

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

function sendJson(res, status, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit) {
  limit = limit || LIMITS.bodyBytes;
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var len = 0;
    req.on('data', function (chunk) {
      len += chunk.length;
      if (len > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function forwardOpenAIChat(bodyObj, cb) {
  if (!OPENAI_KEY) {
    process.nextTick(function () {
      cb(null, 503, { error: { message: 'Server is not configured with OPENAI_API_KEY' } });
    });
    return;
  }
  var postData = JSON.stringify(bodyObj);
  var opts = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + OPENAI_KEY,
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  var req = https.request(opts, function (res) {
    var chunks = [];
    res.on('data', function (c) {
      chunks.push(c);
    });
    res.on('end', function () {
      var text = Buffer.concat(chunks).toString('utf8');
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        cb(null, res.statusCode || 502, { error: { message: 'Invalid response from OpenAI' } });
        return;
      }
      cb(null, res.statusCode, data);
    });
  });
  req.on('error', function (e) {
    cb(e);
  });
  req.write(postData);
  req.end();
}

function safeFilePath(requestPath) {
  var decoded = decodeURIComponent((requestPath || '/').split('?')[0]);
  if (decoded.includes('\0')) return null;
  var rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.indexOf('..') !== -1) return null;
  var root = path.resolve(STATIC_ROOT);
  var joined = path.resolve(root, rel);
  if (joined !== root && joined.indexOf(root + path.sep) !== 0) return null;
  return joined;
}

var server = http.createServer(function (req, res) {
  var pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch (e) {
    pathname = '/';
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, openai: !!OPENAI_KEY });
    return;
  }

  if (pathname === '/api/openai/chat' && req.method === 'POST') {
    var ip = getClientIp(req);
    var ipLimit = allowIp(ip);
    if (!ipLimit.ok) {
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(ipLimit.retryAfterSec),
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded (per IP). Try again soon.' }));
      return;
    }
    var globalLimit = allowGlobal('global');
    if (!globalLimit.ok) {
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(globalLimit.retryAfterSec),
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded (global). Try again soon.' }));
      return;
    }

    readBody(req)
      .then(function (raw) {
        var body;
        try {
          body = JSON.parse(raw || '{}');
        } catch (e) {
          sendJson(res, 400, { error: 'Invalid JSON' });
          return;
        }
        var validationError = validateChatPayload(body);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        var model = (typeof body.model === 'string' && body.model.trim()) || 'gpt-4o-mini';
        var payload = {
          model: model,
          messages: body.messages,
          temperature: typeof body.temperature === 'number' ? body.temperature : 0,
        };
        if (typeof body.max_tokens === 'number') {
          payload.max_tokens = body.max_tokens;
        }

        forwardOpenAIChat(payload, function (err, statusCode, data) {
          if (err) {
            sendJson(res, 502, { error: err.message || 'Upstream error' });
            return;
          }
          var code = statusCode >= 200 && statusCode < 300 ? 200 : statusCode;
          sendJson(res, code, data);
        });
      })
      .catch(function () {
        sendJson(res, 400, { error: 'Bad request' });
      });
    return;
  }

  var filePath = pathname === '/' ? path.join(STATIC_ROOT, 'index.html') : safeFilePath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  var ext = path.extname(filePath).toLowerCase();
  var type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, function (err, buf) {
    if (err) {
      res.writeHead(500);
      res.end('Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use (another dev:hindi server?).');
    console.error('Stop it:  lsof -ti :' + PORT + ' | xargs kill');
    console.error('Or use another port:  HINDI_LEARNING_PORT=3848 npm run dev:hindi');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, function () {
  console.log('Hindi learning: http://localhost:' + PORT);
  console.log('Serves hindi-learning/ and POST /api/openai/chat (key from repo .env only).');
  if (!OPENAI_KEY) {
    console.warn('OPENAI_API_KEY is missing; configure .env for AI features.');
  }
});
