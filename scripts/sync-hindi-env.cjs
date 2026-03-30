'use strict';

/**
 * Legacy script: API keys no longer go to the browser.
 * Writes an optional config stub for split hosting (API base URL only).
 * Run the app with: npm run dev:hindi (OPENAI_API_KEY stays in repo .env).
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var outPath = path.join(root, 'hindi-learning', 'config.local.js');
var body =
  '// Optional: set if the Hindi app is hosted separately from the API (see npm run dev:hindi).\n' +
  '// window.__HINDI_LEARNING_API_BASE__ = "https://your-api-host.example";\n';

fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote ' + outPath + ' (API base stub only — no API keys in the client).');
