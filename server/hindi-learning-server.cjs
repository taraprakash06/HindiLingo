'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

var PORT = parseInt(process.env.HINDI_LEARNING_PORT || '3847', 10);
var STATIC_ROOT = path.resolve(__dirname, '..', 'hindi-learning');
var OPENAI_KEY = process.env.OPENAI_API_KEY || '';

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
  limit = limit || 512 * 1024;
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
    readBody(req)
      .then(function (raw) {
        var body;
        try {
          body = JSON.parse(raw || '{}');
        } catch (e) {
          sendJson(res, 400, { error: 'Invalid JSON' });
          return;
        }
        if (!body.messages || !Array.isArray(body.messages)) {
          sendJson(res, 400, { error: 'Missing messages array' });
          return;
        }
        if (!body.model || typeof body.model !== 'string') {
          body.model = 'gpt-4o-mini';
        }
        var payload = {
          model: body.model,
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
