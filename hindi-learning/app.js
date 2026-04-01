/* OpenAI: browser → POST /api/openai/chat on same origin (npm run dev:hindi). Key only in server .env. */

(function () {
  'use strict';

  var transliterate = window.HindiTransliterate && window.HindiTransliterate.toDevanagari;

  function $(id) { return document.getElementById(id); }
  function qs(s) { return document.querySelector(s); }
  function qsAll(s) { return document.querySelectorAll(s); }

  function tabSwitch() {
    qsAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === this);
    }.bind(this));
    qsAll('.panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === this);
    }.bind(this));
  }

  qsAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabSwitch.call(tab.getAttribute('data-tab'));
    });
  });

  var devanagariOutput = $('devanagariOutput');
  var romanInput = $('romanInput');
  var doTransliterateBtn = $('doTransliterate');
  $('doTransliterate').addEventListener('click', function () {
    var text = romanInput.value.trim();
    if (!text) {
      devanagariOutput.textContent = '';
      return;
    }
    var config = getApiConfig();
    if (config) {
      devanagariOutput.textContent = 'Converting…';
      doTransliterateBtn.disabled = true;
      romanToDevanagariWithLlm(config, text, function (err, devanagari) {
        doTransliterateBtn.disabled = false;
        if (err) {
          devanagariOutput.textContent = 'API error: ' + err;
          return;
        }
        if (!devanagari) {
          devanagariOutput.textContent = 'No result from API.';
          return;
        }
        devanagariOutput.textContent = devanagari;
      });
    } else {
      devanagariOutput.textContent = transliterate(text) || text;
    }
  });
  romanInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('doTransliterate').click();
  });

  function normalizeForCompare(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[।.]/g, '').replace(/\u093C/g, '');
  }

  function toDevanagariIfRoman(s) {
    if (!s || !s.trim()) return '';
    var t = s.trim();
    if (/[\u0900-\u097F]/.test(t)) return t;
    return transliterate(t) || t;
  }

  var phraseInput = $('phraseInput');
  var checkResult = $('checkResult');
  var doCheckBtn = $('doCheck');

  function getHindiApiBase() {
    if (typeof window !== 'undefined' && window.__HINDI_LEARNING_API_BASE__ != null) {
      var b = String(window.__HINDI_LEARNING_API_BASE__).trim();
      if (b) return b.replace(/\/$/, '');
    }
    return '';
  }

  function openaiChatViaProxy(payload, cb) {
    var url = getHindiApiBase() + '/api/openai/chat';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.text().then(function (text) {
          var data;
          try {
            data = text ? JSON.parse(text) : {};
          } catch (e) {
            return cb('Invalid JSON from server');
          }
          if (!r.ok) {
            var msg =
              (data.error && (typeof data.error === 'string' ? data.error : data.error.message)) ||
              data.message ||
              text ||
              'HTTP ' + r.status;
            return cb(typeof msg === 'string' ? msg : JSON.stringify(msg));
          }
          if (data.error) {
            return cb(
              typeof data.error === 'string'
                ? data.error
                : data.error.message || JSON.stringify(data.error)
            );
          }
          cb(null, data);
        });
      })
      .catch(function (e) {
        cb(e.message || 'Network error');
      });
  }

  function getApiConfig() {
    return { provider: 'openai' };
  }

  function getTranslationConfig() {
    return null;
  }

  function looksLikeEnglish(text) {
    if (!text || /[\u0900-\u097F]/.test(text)) return false;
    var latin = text.replace(/[^a-zA-Z\s\'\"\,\?\.\!\-]/g, '');
    return latin.length >= text.length * 0.7;
  }

  function translateWithGoogle(phrase, key, cb, opts) {
    opts = opts || {};
    var source = opts.source || 'en';
    var target = opts.target || 'hi';
    var url = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key) +
      '&q=' + encodeURIComponent(phrase) +
      (source ? '&source=' + encodeURIComponent(source) : '') +
      '&target=' + encodeURIComponent(target);
    fetch(url, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) return cb(data.error.message || 'Google Translate error');
        var t = data.data && data.data.translations && data.data.translations[0];
        cb(null, t ? t.translatedText : null);
      })
      .catch(function (e) { cb(e.message || 'Network error'); });
  }

  function translateWithDeepL(phrase, key, cb, opts) {
    opts = opts || {};
    var source = opts.source || 'EN';
    var target = opts.target || 'HI';
    var url = 'https://api-free.deepl.com/v2/translate';
    var params = { text: phrase, target_lang: target };
    if (source) params.source_lang = source;
    var body = new URLSearchParams(params);
    fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.message) return cb(data.message);
        var t = data.translations && data.translations[0];
        cb(null, t ? t.text : null);
      })
      .catch(function (e) { cb(e.message || 'Network error'); });
  }

  function extractDevanagariFromResponse(str) {
    if (!str || typeof str !== 'string') return '';
    var match = str.replace(/\s+/g, ' ').match(/[\u0900-\u097F\u200C\u200D]+/g);
    return match ? match.join(' ').trim() : str.trim();
  }

  function romanToDevanagariWithLlm(config, roman, cb) {
    void config;
    var systemMsg = 'You convert romanized Hindi (Latin) to Devanagari only. Output ONLY the Devanagari characters, no other text. Use correct Hindi spelling: e.g. "tara" (name/star) = तारा, not तर. Single word or phrase only.';
    var userMsg = 'Convert to Devanagari (output only the Devanagari, nothing else): ' + roman;
    openaiChatViaProxy(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
      },
      function (err, data) {
        if (err) return cb(err);
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        var devanagari = extractDevanagariFromResponse(text);
        cb(null, devanagari || text.trim());
      }
    );
  }

  function devanagariToRomanWithLlm(config, devanagari, cb) {
    void config;
    var prompt = 'Convert this Hindi phrase from Devanagari to Roman/Latin script only. Output ONLY the romanized text, nothing else. No explanation, no quotes. Phrase: ' + devanagari;
    openaiChatViaProxy(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0 },
      function (err, data) {
        if (err) return cb(err);
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        cb(null, text.trim());
      }
    );
  }

  function translateEnglishToHindiRoman(config, english, cb) {
    void config;
    var prompt = 'Translate the following English word or phrase to Hindi. Output ONLY the Hindi translation in roman (Latin) script, nothing else. No explanation, no quotes. Word or phrase: ' + english;
    openaiChatViaProxy(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0 },
      function (err, data) {
        if (err) return cb(err);
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        cb(null, (text || '').trim());
      }
    );
  }

  var ROMAN_ONLY_INSTRUCTION = 'CRITICAL: In your "feedback" text you must write every Hindi phrase using ONLY Roman/Latin letters (a-z). Do NOT use Devanagari script at all (no characters like म न ग ि ट र etc). Example: write "main guitar bajata hoon" or "main guitar bajati hoon" — never the Devanagari form.';

  function checkPhraseWithApi(config, phrase, cb) {
    void config;
    var prompt = ROMAN_ONLY_INSTRUCTION + '\n\nYou are a Hindi language tutor. The user wrote: ' + JSON.stringify(phrase) + '\n\nTranslate it: if it is in English, give the Hindi translation; if it is in Hindi (any script), give the English translation. Reply with ONLY a JSON object, no markdown, with keys "correct" (boolean, always true if you provide a translation) and "feedback" (string). Put the translation and a brief explanation in "feedback". Write any Hindi in ROMAN letters only. Do not add a sentence in Hindi that means "that is how you say [phrase] in Hindi"; only give the translation and a brief English explanation. Never use Devanagari in the feedback.';
    openaiChatViaProxy(
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'When you output Hindi phrases, you must write them only in Roman/Latin script (e.g. main guitar bajata hoon). Never use Devanagari characters (no ॐ-ॿ).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      },
      function (err, data) {
        if (err) return cb(null, err);
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        parseFeedback(text, cb);
      }
    );
  }

  function stripDevanagariFromFeedback(str) {
    if (!str) return str;
    var hasDevanagari = /[\u0900-\u097F]/.test(str);
    if (!hasDevanagari) return str;
    var out;
    try {
      out = str.replace(/\p{Script=Devanagari}+/gu, ' [Hindi in roman letters] ');
    } catch (e) {
      out = str.replace(/[\u0900-\u097F\u200C\u200D]+/g, ' [Hindi in roman letters] ');
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function parseFeedback(text, cb) {
    try {
      var cleaned = text.trim().replace(/^```\w*\n?|\n?```$/g, '');
      var j = JSON.parse(cleaned);
      var feedback = (j.feedback || '').trim() || 'No translation returned.';
      feedback = stripDevanagariFromFeedback(feedback);
      cb({ correct: !!j.correct, feedback: feedback });
    } catch (e) {
      cb({ correct: false, feedback: text.trim() || 'Could not parse response.' });
    }
  }

  var knownPhrases = [
    { roman: 'namaste', devanagari: 'नमस्ते' },
    { roman: 'aap kaise hain', devanagari: 'आप कैसे हैं' },
    { roman: 'main theek hoon', devanagari: 'मैं ठीक हूँ' },
    { roman: 'dhanyavaad', devanagari: 'धन्यवाद' },
    { roman: 'ladka pani pi raha hai', devanagari: 'लड़का पानी पी रहा है' },
    { roman: 'ladki kitaab padh rahi hai', devanagari: 'लड़की किताब पढ़ रही है' }
  ];

  function showListResult() {
    var raw = phraseInput.value.trim();
    var devanagari = toDevanagariIfRoman(raw);
    var normalizedInput = normalizeForCompare(raw);
    var normalizedDev = normalizeForCompare(devanagari);
    for (var i = 0; i < knownPhrases.length; i++) {
      var p = knownPhrases[i];
      if (normalizeForCompare(p.devanagari) === normalizedDev ||
          normalizeForCompare(p.roman) === normalizedInput ||
          normalizeForCompare(transliterate(p.roman)) === normalizedDev) {
        checkResult.innerHTML = 'Translation: <span class="devanagari-part">' + escapeHtml(p.devanagari) + '</span>';
        checkResult.className = 'result-box info';
        return;
      }
    }
    checkResult.innerHTML = 'Translation: <span class="devanagari-part">' + escapeHtml(devanagari) + '</span>. Run <code>npm run dev:hindi</code> (with <code>OPENAI_API_KEY</code> in project <code>.env</code>) for full AI translation.';
    checkResult.className = 'result-box info';
  }

  function checkPhrase() {
    var raw = phraseInput.value.trim();
    if (!raw) {
      checkResult.textContent = 'Type a phrase first.';
      checkResult.className = 'result-box info';
      return;
    }
    var config = getApiConfig();
    var isEnglishInput = looksLikeEnglish(raw);
    doCheckBtn.disabled = true;
    checkResult.textContent = 'Translating…';
    checkResult.className = 'result-box info';
    checkPhraseWithApi(config, raw, function (result, err) {
      doCheckBtn.disabled = false;
      if (err) {
        checkResult.textContent = 'API error: ' + err + '. Falling back to list.';
        checkResult.className = 'result-box info';
        showListResult();
        return;
      }
      var rawFeedback = result.feedback || '';
      if (isEnglishInput && rawFeedback) {
        var hindiThatIsHow = /(यही|yahi|is tarah).*?(हिंदी में|hindi mein).*?(कैसे कहते|kaise kehte)/i;
        if (hindiThatIsHow.test(rawFeedback)) {
          rawFeedback = rawFeedback.split(/\n|[।.]\s+/).filter(function (s) {
            return !/(हिंदी में|hindi mein).*?(कैसे कहते|kaise kehte)|(यही|yahi).*?(हिंदी में|hindi mein)/i.test(s.trim());
          }).join('. ').trim();
        }
      }
      var feedback = rawFeedback ? escapeHtml(rawFeedback) : 'No translation returned.';
      if (isEnglishInput && result.feedback) {
        feedback += ' That is how you say \'' + escapeHtml(raw) + '\' in Hindi.';
      }
      checkResult.innerHTML = feedback;
      checkResult.className = 'result-box info';
    });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  $('doCheck').addEventListener('click', checkPhrase);

  (function initPrepositions() {
    var dropZone = $('prepositionDropZone');
    var draggable = $('prepositionDraggable') || $('prepositionBird');
    var prepositionAnswer = $('prepositionAnswer');
    var prepositionResult = $('prepositionResult');
    var checkPrepositionBtn = $('checkPreposition');
    var prevBtn = $('prepositionPrev');
    var nextBtn = $('prepositionNext');
    var bgImg = $('prepositionBgImg');
    var dragImg = $('prepositionDragImg');
    var dropLabel = $('prepositionDropLabel');
    var titleEl = $('prepositionTitle');
    var hintEl = $('prepositionHint');
    var instructionEl = $('prepositionInstruction');
    var sentenceLabel = document.querySelector('label[for="prepositionAnswer"]');
    if (!dropZone || !draggable) return;

    var BRANCH_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Cpath d='M20 60 Q60 40 100 55 Q140 30 180 50' fill='none' stroke='%236b4423' stroke-width='8' stroke-linecap='round'/%3E%3Cellipse cx='40' cy='55' rx='18' ry='8' fill='%232d5a27'/%3E%3Cellipse cx='100' cy='45' rx='22' ry='10' fill='%232d5a27'/%3E%3Cellipse cx='160' cy='48' rx='16' ry='7' fill='%232d5a27'/%3E%3C/svg%3E";
    var BIRD_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 60'%3E%3Cellipse cx='40' cy='35' rx='18' ry='14' fill='%23d97706'/%3E%3Cellipse cx='40' cy='33' rx='15' ry='11' fill='%23f59e0b'/%3E%3Ccircle cx='52' cy='22' r='10' fill='%23d97706'/%3E%3Ccircle cx='52' cy='21' r='8' fill='%23f59e0b'/%3E%3Ccircle cx='55' cy='19' r='3' fill='%23fff'/%3E%3Ccircle cx='56' cy='19' r='1.5' fill='%23000'/%3E%3Cpath d='M62 21 L72 19 L62 23 Z' fill='%23ea580c'/%3E%3Cpath d='M25 38 L15 45 L18 38 Z' fill='%23d97706'/%3E%3Cpath d='M35 48 L30 58 L38 50 Z' fill='%23d97706'/%3E%3Cpath d='M45 48 L42 58 L48 50 Z' fill='%23d97706'/%3E%3Cpath d='M22 30 Q10 25 5 35' fill='none' stroke='%23d97706' stroke-width='3'/%3E%3Cpath d='M22 35 Q12 32 8 40' fill='none' stroke='%23d97706' stroke-width='2'/%3E%3Cpath d='M48 18 Q52 12 56 14' fill='none' stroke='%23f59e0b' stroke-width='1'/%3E%3C/svg%3E";
    var LION_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 80'%3E%3Ccircle cx='50' cy='40' r='30' fill='%23b45309'/%3E%3Ccircle cx='50' cy='40' r='22' fill='%23d97706'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23f59e0b'/%3E%3Cellipse cx='50' cy='52' rx='10' ry='6' fill='%23fbbf24'/%3E%3Ccircle cx='50' cy='50' r='4' fill='%23d97706'/%3E%3Cellipse cx='44' cy='48' rx='3' ry='2' fill='%23fbbf24'/%3E%3Cellipse cx='56' cy='48' rx='3' ry='2' fill='%23fbbf24'/%3E%3Ccircle cx='42' cy='38' r='4' fill='%23fff'/%3E%3Ccircle cx='58' cy='38' r='4' fill='%23fff'/%3E%3Ccircle cx='43' cy='38' r='2' fill='%23000'/%3E%3Ccircle cx='59' cy='38' r='2' fill='%23000'/%3E%3Cpath d='M35 28 L32 18 L38 25 Z' fill='%23d97706'/%3E%3Cpath d='M65 28 L68 18 L62 25 Z' fill='%23d97706'/%3E%3Cpath d='M45 55 Q50 60 55 55' fill='none' stroke='%23000' stroke-width='1.5'/%3E%3Cpath d='M38 45 Q36 42' fill='none' stroke='%23000' stroke-width='0.8'/%3E%3Cpath d='M62 45 Q64 42' fill='none' stroke='%23000' stroke-width='0.8'/%3E%3Cpath d='M35 44 L28 43 M35 46 L27 47 M35 48 L29 50' stroke='%23000' stroke-width='0.5'/%3E%3Cpath d='M65 44 L72 43 M65 46 L73 47 M65 48 L71 50' stroke='%23000' stroke-width='0.5'/%3E%3C/svg%3E";
    var GRASS_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 60'%3E%3Crect width='200' height='60' fill='%231a472a'/%3E%3Cpath d='M10 60 L15 20 L20 60 M30 60 L35 25 L40 60 M50 60 L55 15 L60 60 M70 60 L75 30 L80 60 M90 60 L95 22 L100 60 M110 60 L115 28 L120 60 M130 60 L135 18 L140 60 M150 60 L155 24 L160 60 M170 60 L175 26 L180 60 M190 60 L195 20 L200 60' fill='none' stroke='%232d5a27' stroke-width='2'/%3E%3C/svg%3E";
    var CLOUD_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 40'%3E%3Cellipse cx='35' cy='24' rx='28' ry='14' fill='%23e6edf3'/%3E%3Cellipse cx='22' cy='26' rx='14' ry='10' fill='%23e6edf3'/%3E%3Cellipse cx='48' cy='26' rx='14' ry='10' fill='%23e6edf3'/%3E%3C/svg%3E";
    var SKY_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%234a6fa5'/%3E%3C/svg%3E";
    var SKY_PLAIN_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%234a6fa5'/%3E%3C/svg%3E";
    var ROAD_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%23555'/%3E%3Crect x='0' y='35' width='200' height='20' fill='%23333'/%3E%3Cpath d='M0 45 L200 45 M0 55 L200 55' stroke='%23fff' stroke-width='2' opacity='0.5'/%3E%3C/svg%3E";
    var SNAKE_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 40'%3E%3Cpath d='M5 20 Q15 8 30 18 Q45 28 60 15 Q75 5 85 18' fill='none' stroke='%2316a34a' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M5 20 Q15 8 30 18 Q45 28 60 15 Q75 5 85 18' fill='none' stroke='%2322c55e' stroke-width='5' stroke-linecap='round'/%3E%3Ccircle cx='88' cy='18' r='6' fill='%2316a34a'/%3E%3Ccircle cx='88' cy='17' r='5' fill='%2322c55e'/%3E%3Ccircle cx='90' cy='15' r='1.5' fill='%23000'/%3E%3Cpath d='M94 18 L98 15 L98 21 Z' fill='%23dc2626'/%3E%3Cpath d='M20 16 Q22 14 24 16 M40 20 Q42 18 44 20 M65 12 Q67 10 69 12' fill='none' stroke='%23166534' stroke-width='1.5'/%3E%3C/svg%3E";
    var LEAVES_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 50'%3E%3Cellipse cx='20' cy='28' rx='12' ry='18' fill='%232d5a27' transform='rotate(-20 20 28)'/%3E%3Cellipse cx='35' cy='25' rx='14' ry='20' fill='%23368a3e' transform='rotate(5 35 25)'/%3E%3Cellipse cx='50' cy='28' rx='11' ry='16' fill='%232d5a27' transform='rotate(25 50 28)'/%3E%3C/svg%3E";
    var SUN_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Ccircle cx='30' cy='30' r='16' fill='%23fbbf24'/%3E%3Cpath d='M30 8 L30 2 M30 52 L30 58 M8 30 L2 30 M52 30 L58 30 M16 16 L12 12 M44 44 L48 48 M16 44 L12 48 M44 16 L48 12' stroke='%23f59e0b' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";
    var BOOK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 55'%3E%3Crect x='10' y='8' width='50' height='40' rx='2' fill='%23dc2626'/%3E%3Crect x='12' y='10' width='46' height='36' rx='1' fill='%23ef4444'/%3E%3Crect x='35' y='8' width='3' height='40' fill='%23b91c1c'/%3E%3Crect x='16' y='14' width='16' height='2' fill='%23fef2f2'/%3E%3Crect x='16' y='19' width='14' height='1.5' fill='%23fecaca'/%3E%3Crect x='16' y='23' width='15' height='1.5' fill='%23fecaca'/%3E%3Crect x='16' y='27' width='12' height='1.5' fill='%23fecaca'/%3E%3Crect x='41' y='14' width='14' height='2' fill='%23fef2f2'/%3E%3Crect x='41' y='19' width='12' height='1.5' fill='%23fecaca'/%3E%3Crect x='41' y='23' width='13' height='1.5' fill='%23fecaca'/%3E%3Crect x='41' y='27' width='10' height='1.5' fill='%23fecaca'/%3E%3Cpath d='M10 12 L10 8 Q10 6 12 6 L33 6 Q35 6 35 8 L35 12' fill='none' stroke='%23b91c1c' stroke-width='1'/%3E%3Cpath d='M60 12 L60 8 Q60 6 58 6 L37 6 Q35 6 35 8 L35 12' fill='none' stroke='%23b91c1c' stroke-width='1'/%3E%3C/svg%3E";
    var HOUSE_BG_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%23cfe8ff'/%3E%3Crect y='55' width='200' height='25' fill='%239ad68a'/%3E%3Crect x='120' y='30' width='60' height='35' rx='2' fill='%23f5d0a9' stroke='%23c98b5b' stroke-width='2'/%3E%3Cpath d='M115 32 L150 12 L185 32' fill='%23d97706' stroke='%23b45309' stroke-width='2'/%3E%3Crect x='145' y='45' width='14' height='20' fill='%239c5a2e'/%3E%3Crect x='128' y='40' width='14' height='12' fill='%23e0f2fe' stroke='%2390cdf4' stroke-width='1.5'/%3E%3Crect x='162' y='40' width='14' height='12' fill='%23e0f2fe' stroke='%2390cdf4' stroke-width='1.5'/%3E%3Ccircle cx='35' cy='18' r='10' fill='%23fbbf24'/%3E%3C/svg%3E";
    var TREE_BG_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%23cfe8ff'/%3E%3Crect y='55' width='200' height='25' fill='%239ad68a'/%3E%3Crect x='95' y='32' width='12' height='32' rx='3' fill='%236b4423'/%3E%3Ccircle cx='101' cy='28' r='18' fill='%232d5a27'/%3E%3Ccircle cx='85' cy='35' r='14' fill='%23368a3e'/%3E%3Ccircle cx='118' cy='38' r='14' fill='%23368a3e'/%3E%3C/svg%3E";
    var TREE_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect x='36' y='38' width='10' height='30' rx='3' fill='%236b4423'/%3E%3Ccircle cx='41' cy='30' r='18' fill='%232d5a27'/%3E%3Ccircle cx='27' cy='38' r='14' fill='%23368a3e'/%3E%3Ccircle cx='55' cy='40' r='14' fill='%23368a3e'/%3E%3C/svg%3E";
    var CAT_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 90 70'%3E%3Cellipse cx='45' cy='45' rx='22' ry='16' fill='%239ca3af'/%3E%3Ccircle cx='58' cy='28' r='12' fill='%239ca3af'/%3E%3Cpath d='M50 20 L52 10 L58 18 Z' fill='%239ca3af'/%3E%3Cpath d='M66 20 L64 10 L58 18 Z' fill='%239ca3af'/%3E%3Ccircle cx='55' cy='27' r='2' fill='%23000'/%3E%3Ccircle cx='62' cy='27' r='2' fill='%23000'/%3E%3Cpath d='M58 30 Q56 32 58 34 Q60 32 58 30' fill='%23000'/%3E%3Cpath d='M22 46 Q10 40 14 30' fill='none' stroke='%239ca3af' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E";
    var DOG_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 90 70'%3E%3Cellipse cx='45' cy='45' rx='24' ry='16' fill='%23a16207'/%3E%3Ccircle cx='60' cy='30' r='12' fill='%23a16207'/%3E%3Cpath d='M52 30 Q46 26 46 18 Q52 20 56 24' fill='%23854d0e'/%3E%3Cpath d='M68 30 Q74 26 74 18 Q68 20 64 24' fill='%23854d0e'/%3E%3Ccircle cx='57' cy='28' r='2' fill='%23000'/%3E%3Ccircle cx='64' cy='28' r='2' fill='%23000'/%3E%3Ccircle cx='60' cy='33' r='3' fill='%23000'/%3E%3Cpath d='M22 52 Q14 56 18 62' fill='none' stroke='%23a16207' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E";
    var TABLE_BG_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 80'%3E%3Crect width='200' height='80' fill='%23f8fafc'/%3E%3Crect y='55' width='200' height='25' fill='%23e2e8f0'/%3E%3Crect x='40' y='35' width='120' height='12' rx='3' fill='%23854d0e'/%3E%3Crect x='50' y='47' width='10' height='22' fill='%236b4423'/%3E%3Crect x='140' y='47' width='10' height='22' fill='%236b4423'/%3E%3C/svg%3E";

    function prepDisplay(ex) {
      if (ex && ex.prepDisplay) return ex.prepDisplay;
      return (ex && ex.prep) || '';
    }
    function tokenMatches(token, word) {
      var w = (word || '').toLowerCase();
      if (!token) return false;
      if (token === 'par') return w === 'par' || w.indexOf('पर') !== -1;
      if (token === 'mein') return w === 'mein' || w.indexOf('में') !== -1;
      if (token === 'neeche') return w === 'neeche' || w.indexOf('नीचे') !== -1;
      if (token === 'upar') return w === 'upar' || w.indexOf('ऊपर') !== -1;
      if (token === 'andar') return w === 'andar' || w.indexOf('अंदर') !== -1;
      if (token === 'bahaar') return w === 'bahaar' || w.indexOf('बाहर') !== -1;
      if (token === 'ke') return w === 'ke' || w.indexOf('के') !== -1;
      return w === token;
    }
    function findPrepIndex(words, ex) {
      var patterns = (ex && ex.prepPatterns) || [[ex.prep]];
      for (var p = 0; p < patterns.length; p++) {
        var pat = patterns[p];
        if (!pat || !pat.length) continue;
        for (var i = 0; i < words.length; i++) {
          var ok = true;
          for (var j = 0; j < pat.length; j++) {
            if (!tokenMatches(pat[j], words[i + j])) { ok = false; break; }
          }
          if (ok) return i;
        }
      }
      return -1;
    }
    var exercises = [
      { title: 'Preposition: par (on)', hint: 'Drag the bird onto the branch.', prep: 'par', subjectRe: /\b(chiriya|chidiya)\b/, objectRe: /\b(perh|daal|dal)\b/, example: 'chiriya perh par hai', exampleDev: '\u091A\u093F\u0921\u093C\u093F\u092F\u093E \u092A\u0947\u0921\u093C \u092A\u0930 \u0939\u0948', bgImg: BRANCH_SVG, dragImg: BIRD_SVG, dropLabel: '↓ drop bird here' },
      { title: 'Preposition: mein (in)', hint: 'Drag the lion into the grass.', prep: 'mein', subjectRe: /\b(sher|lion)\b/, objectRe: /\b(ghaas|ghas|gaas|grass)\b/, example: 'sher ghaas mein hai', exampleDev: '\u0936\u0947\u0930 \u0918\u093E\u0938 \u092E\u0947\u0928 \u0939\u0948', bgImg: GRASS_SVG, dragImg: LION_SVG, dropLabel: '↓ drop lion here' },
      { title: 'Preposition: mein (in)', hint: 'Drag the cloud into the sky.', prep: 'mein', subjectRe: /\b(badal|cloud)\b/, objectRe: /\b(aasman|akash|sky)\b/, example: 'badal aasman mein hai', exampleDev: '\u092C\u093E\u0926\u0932 \u0906\u0938\u092E\u093E\u0928 \u092E\u0947\u0928 \u0939\u0948', bgImg: SKY_PLAIN_SVG, dragImg: CLOUD_SVG, dropLabel: '↓ drop cloud here' },
      { title: 'Preposition: par (on)', hint: 'Drag the snake onto the road.', prep: 'par', subjectRe: /\b(saanp|sarp|snake)\b/, objectRe: /\b(sadak|road)\b/, example: 'saanp sadak par hai', exampleDev: '\u0938\u093E\u0902\u092A \u0938\u0921\u093C\u0915 \u092A\u0930 \u0939\u0948', bgImg: ROAD_SVG, dragImg: SNAKE_SVG, dropLabel: '↓ drop snake here' },
      { title: 'Preposition: par (on)', hint: 'Drag the leaves onto the grass.', prep: 'par', subjectRe: /\b(patte|leaves|patta)\b/, objectRe: /\b(ghaas|ghas|gaas|grass)\b/, example: 'patte ghaas par hain', exampleDev: '\u092A\u0924\u094D\u0924\u0947 \u0918\u093E\u0938 \u092A\u0930 \u0939\u0948\u0902', bgImg: GRASS_SVG, dragImg: LEAVES_SVG, dropLabel: '↓ drop leaves here' },
      { title: 'Preposition: mein (in)', hint: 'Drag the sun into the sky.', prep: 'mein', subjectRe: /\b(suraj|sun)\b/, objectRe: /\b(aasman|akash|sky)\b/, example: 'suraj aasman mein hai', exampleDev: '\u0938\u0942\u0930\u091C \u0906\u0938\u092E\u093E\u0928 \u092E\u0947\u0928 \u0939\u0948', bgImg: SKY_PLAIN_SVG, dragImg: SUN_SVG, dropLabel: '↓ drop sun here' },
      { title: 'Preposition: par (on)', hint: 'Drag the book onto the grass.', prep: 'par', subjectRe: /\b(kitaab|kitab|book|pustak)\b/, objectRe: /\b(ghaas|ghas|gaas|grass)\b/, example: 'kitaab ghaas par hai', exampleDev: '\u0915\u093F\u0924\u093E\u092C \u0918\u093E\u0938 \u092A\u0930 \u0939\u0948', bgImg: GRASS_SVG, dragImg: BOOK_SVG, dropLabel: '↓ drop book here' },
      { title: 'Preposition: ke bahaar (outside)', hint: 'Drag the tree outside the house.', prep: 'bahaar', prepDisplay: 'ke bahaar', prepPatterns: [['ke','bahaar'],['bahaar']], subjectRe: /\b(ped|perh|tree)\b/, objectRe: /\b(ghar|ghaar|house)\b/, example: 'ped ghar ke bahaar hai', exampleDev: '\u092A\u0947\u0921\u093C \u0918\u0930 \u0915\u0947 \u092C\u093E\u0939\u0930 \u0939\u0948', bgImg: HOUSE_BG_SVG, dragImg: TREE_SVG, dropLabel: '↓ drop tree outside' },
      { title: 'Preposition: ke bahaar (outside)', hint: 'Drag the cat outside the house.', prep: 'bahaar', prepDisplay: 'ke bahaar', prepPatterns: [['ke','bahaar'],['bahaar']], subjectRe: /\b(billi|cat)\b/, objectRe: /\b(ghar|ghaar|house)\b/, example: 'billi ghar ke bahaar hai', exampleDev: '\u092C\u093F\u0932\u094D\u0932\u0940 \u0918\u0930 \u0915\u0947 \u092C\u093E\u0939\u0930 \u0939\u0948', bgImg: HOUSE_BG_SVG, dragImg: CAT_SVG, dropLabel: '↓ drop cat outside' },
      { title: 'Preposition: neeche (below)', hint: 'Drag the lion below the tree.', prep: 'neeche', prepPatterns: [['neeche']], subjectRe: /\b(sher|lion)\b/, objectRe: /\b(ped|perh|tree)\b/, example: 'sher ped ke neeche hai', exampleDev: '\u0936\u0947\u0930 \u092A\u0947\u0921\u093C \u0915\u0947 \u0928\u0940\u091A\u0947 \u0939\u0948', bgImg: TREE_BG_SVG, dragImg: LION_SVG, dropLabel: '↓ drop lion below' },
      { title: 'Preposition: mein (in)', hint: 'Drag the dog into the grass.', prep: 'mein', subjectRe: /\b(kutta|dog)\b/, objectRe: /\b(ghaas|ghas|gaas|grass)\b/, example: 'kutta ghaas mein hai', exampleDev: '\u0915\u0941\u0924\u094D\u0924\u093E \u0918\u093E\u0938 \u092E\u0947\u0902 \u0939\u0948', bgImg: GRASS_SVG, dragImg: DOG_SVG, dropLabel: '↓ drop dog here' },
      { title: 'Preposition: par (on)', hint: 'Drag the book onto the table.', prep: 'par', subjectRe: /\b(kitaab|kitab|book|pustak)\b/, objectRe: /\b(mez|maiz|table)\b/, example: 'kitaab mez par hai', exampleDev: '\u0915\u093F\u0924\u093E\u092C \u092E\u0947\u091C \u092A\u0930 \u0939\u0948', bgImg: TABLE_BG_SVG, dragImg: BOOK_SVG, dropLabel: '↓ drop book on table' },
      { title: 'Preposition: andar (inside)', hint: 'Type a sentence using andar (inside).', prep: 'andar', prepPatterns: [['ke','andar'],['andar']], subjectRe: /\b(billi|cat|kutta|dog|sher|lion)\b/, objectRe: /\b(ghar|ghaar|house)\b/, example: 'billi ghar ke andar hai', exampleDev: '\u092C\u093F\u0932\u094D\u0932\u0940 \u0918\u0930 \u0915\u0947 \u0905\u0902\u0926\u0930 \u0939\u0948', bgImg: HOUSE_BG_SVG, dragImg: CAT_SVG, dropLabel: '↓ drop inside' },
      { title: 'Preposition: upar (above)', hint: 'Type a sentence using upar (above).', prep: 'upar', prepPatterns: [['upar']], subjectRe: /\b(badal|cloud|suraj|sun)\b/, objectRe: /\b(ghar|ghaar|house|ped|perh|tree|aasman|sky)\b/, example: 'badal ghar ke upar hai', exampleDev: '\u092C\u093E\u0926\u0932 \u0918\u0930 \u0915\u0947 \u090A\u092A\u0930 \u0939\u0948', bgImg: HOUSE_BG_SVG, dragImg: CLOUD_SVG, dropLabel: '↓ drop above' }
    ];
    var currentPrepositionIndex = 0;
    function renderPrepositionExercise() {
      var ex = exercises[currentPrepositionIndex];
      if (titleEl) titleEl.textContent = ex.title;
      if (hintEl) hintEl.textContent = ex.hint;
      if (instructionEl) instructionEl.textContent = 'Order: subject + noun + preposition. Use "' + prepDisplay(ex) + '".';
      if (sentenceLabel) sentenceLabel.textContent = 'Sentence (use "' + prepDisplay(ex) + '"):';
      if (bgImg) bgImg.src = ex.bgImg;
      if (dragImg) dragImg.src = ex.dragImg;
      if (dropLabel) dropLabel.textContent = ex.dropLabel;
      dropZone.classList.remove('dropped');
      draggable.classList.remove('dropped-in');
      prepositionAnswer.value = '';
      prepositionAnswer.placeholder = '';
      prepositionResult.textContent = '';
      prepositionResult.className = 'result-box';
      if (prevBtn) prevBtn.disabled = currentPrepositionIndex === 0;
      if (nextBtn) nextBtn.disabled = currentPrepositionIndex === exercises.length - 1;
    }

    draggable.setAttribute('draggable', 'true');
    draggable.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', 'item');
      e.dataTransfer.effectAllowed = 'move';
      draggable.classList.add('dragging');
    });
    draggable.addEventListener('dragend', function () {
      draggable.classList.remove('dragging');
    });

    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.getData('text/plain') === 'item') {
        dropZone.classList.add('dropped');
        draggable.classList.add('dropped-in');
      }
    });

    var parAnswerRoman = 'chidiya daal par hai';
    var parAnswerDev = 'चिड़िया डाल पर है';
    function normalizePreposition(s) {
      return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    function levenshtein(a, b) {
      a = (a || '').toLowerCase();
      b = (b || '').toLowerCase();
      if (a === b) return 0;
      if (!a) return b.length;
      if (!b) return a.length;
      var prev = new Array(b.length + 1);
      var curr = new Array(b.length + 1);
      for (var j = 0; j <= b.length; j++) prev[j] = j;
      for (var i = 1; i <= a.length; i++) {
        curr[0] = i;
        var ca = a.charCodeAt(i - 1);
        for (var k = 1; k <= b.length; k++) {
          var cost = ca === b.charCodeAt(k - 1) ? 0 : 1;
          curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
        }
        var tmp = prev; prev = curr; curr = tmp;
      }
      return prev[b.length];
    }
    checkPrepositionBtn.addEventListener('click', function () {
      var raw = prepositionAnswer.value.trim();
      if (!raw) {
        prepositionResult.textContent = 'Type the sentence.';
        prepositionResult.className = 'result-box info';
        return;
      }
      var norm = normalizePreposition(raw);
      var hasPar = /par/.test(norm) || /\u092A\u0930/.test(raw);
      var parSubjectRe = /\b(chiriya|chidiya)\b/;
      var parObjectRe = /\b(perh|daal|dal)\b/;
      function parseWordOrder(n, subR, objR, ex) {
        var words = n.split(/\s+/);
        var si = -1, oi = -1, pi = -1;
        for (var w = 0; w < words.length; w++) {
          if (subR.test(words[w])) si = si < 0 ? w : si;
          if (objR.test(words[w])) oi = oi < 0 ? w : oi;
        }
        pi = findPrepIndex(words, ex);
        return { words: words, si: si, oi: oi, pi: pi };
      }
      var ex = exercises[currentPrepositionIndex];
      var hasPrep = findPrepIndex(norm.split(/\s+/), ex) >= 0;
      if (!hasPrep) {
        prepositionResult.innerHTML = 'Use "' + prepDisplay(ex) + '". Correct order: subject + noun + ' + prepDisplay(ex) + '. Example: <span class="devanagari-part">' + ex.exampleDev + '</span> (' + ex.example + ').';
        prepositionResult.className = 'result-box incorrect';
        return;
      }
      var order = parseWordOrder(norm, ex.subjectRe, ex.objectRe, ex);
      var subjectFound = order.si >= 0;
      var objectFound = order.oi >= 0;
      var prepFound = order.pi >= 0;
      var prepAfterTwoWords = prepFound && order.pi >= 2;

      // If the learner put the preposition in the right spot but misspelled the subject/noun,
      // don't show a misleading "word order" error.
      if ((!subjectFound || !objectFound) && prepAfterTwoWords) {
        var expectedWords = (ex.example || '').trim().split(/\s+/);
        var expectedSubject = expectedWords[0] || '';
        var expectedObject = expectedWords[1] || '';

        // Try to guess the intended word to give a nicer hint (closest word in input).
        function closestWord(target) {
          if (!target) return '';
          var best = { w: '', d: 999 };
          for (var i = 0; i < order.words.length; i++) {
            var w = order.words[i];
            // skip any preposition tokens
            if (findPrepIndex([w], ex) === 0) continue;
            var d = levenshtein(w, target);
            if (d < best.d) best = { w: w, d: d };
          }
          return best;
        }

        var parts = [];
        if (!subjectFound && expectedSubject) {
          var s = closestWord(expectedSubject);
          parts.push('Check the subject spelling' + (s.w ? ' ("' + s.w + '")' : '') + ': try "' + expectedSubject + '".');
        }
        if (!objectFound && expectedObject) {
          var o = closestWord(expectedObject);
          parts.push('Check the noun spelling' + (o.w ? ' ("' + o.w + '")' : '') + ': try "' + expectedObject + '".');
        }
        if (parts.length === 0) {
          parts.push('Word order looks right — check spelling.');
        }
        prepositionResult.innerHTML =
          parts.join(' ') +
          ' Example: <span class="devanagari-part">' +
          ex.exampleDev +
          '</span> (' +
          ex.example +
          ').';
        prepositionResult.className = 'result-box incorrect';
        return;
      }

      // If subject+noun are found but the preposition isn't after them, it's a true order error.
      if (!(prepFound && subjectFound && objectFound && order.pi > order.si && order.pi > order.oi)) {
        prepositionResult.textContent = 'Incorrect order. "' + prepDisplay(ex) + '" must come after subject and noun.';
        prepositionResult.className = 'result-box incorrect';
        return;
      }
      prepositionResult.innerHTML = 'Correct! <span class="devanagari-part">' + (transliterate(ex.example) || ex.exampleDev) + '</span>';
      prepositionResult.className = 'result-box correct';
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { if (currentPrepositionIndex > 0) { currentPrepositionIndex--; renderPrepositionExercise(); } });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (currentPrepositionIndex < exercises.length - 1) { currentPrepositionIndex++; renderPrepositionExercise(); } });
    renderPrepositionExercise();
  })();

  var testSelect = $('testSelect');
  var testArea = $('testArea');
  var imagesRow = $('imagesRow');
  var testAnswer = $('testAnswer');
  var testResult = $('testResult');
  var currentTest = null;

  var defaultTests = [
    { id: 'boy-drinking', title: 'In the morning, he is drinking water.', images: ['https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=120&h=120&fit=crop'], answer: '\u0938\u0941\u092C\u0939 \u092E\u0947\u0928 \u0935\u0939 \u092A\u093E\u0928\u0940 \u092A\u0940 \u0930\u0939\u093E \u0939\u0948', answerRoman: 'subah mein vah pani pi raha hai' },
    { id: 'girl-reading', title: 'In the afternoon, she is reading a book.', images: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop'], answer: '\u0926\u094B\u092A\u0939\u0930 \u092E\u0947\u0928 \u0935\u0939 \u0915\u093F\u0924\u093E\u092C \u092A\u0922\u093C \u0930\u0939\u0940 \u0939\u0948', answerRoman: 'dopahar mein vah kitaab padh rahi hai' },
    { id: 'girl-playing-guitar', title: 'Girl playing guitar', images: ['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=120&h=120&fit=crop'], answer: 'लड़की गिटार बजा रही है', answerRoman: 'ladki guitar baja rahi hai' },
    { id: 'my-name-is', title: 'My name is ___', images: ['https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop'], answer: 'मेरा नाम ___ है', answerRoman: 'mera naam ___ hai' },
    { id: 'i-like-apples', title: 'I like apples', images: ['https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=120&h=120&fit=crop'], answer: 'मुझे सेब पसंद हैं', answerRoman: 'mujhe seb pasand hain' },
    { id: 'namaste', title: 'Greeting (Namaste)', images: ['https://images.unsplash.com/photo-1605640840605-14a117e1b9b0?w=120&h=120&fit=crop'], answer: 'नमस्ते', answerRoman: 'namaste' },
    { id: 'what-sunita-doing', title: 'What is Sunita doing?', images: ['https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&h=120&fit=crop'], answer: '\u0938\u0941\u0928\u0940\u0924\u093E \u0915\u094D\u092F\u093E \u0915\u0930 \u0930\u0939\u0940 \u0939\u0948?', answerRoman: 'Sunita kya kar rahi hai' },
    { id: 'we-sleeping', title: 'We are sleeping.', images: ['https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?w=120&h=120&fit=crop'], answer: '\u0939\u092E \u0938\u094B \u0930\u0939\u0947 \u0939\u0948\u0902', answerRoman: 'hum so rahe hain' },
    { id: 'ravi-flute', title: 'Ravi is playing the flute.', images: ['https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&h=120&fit=crop'], answer: '\u0930\u0935\u093F \u092C\u093E\u0902\u0938\u0941\u0930\u0940 \u092C\u091C\u093E \u0930\u0939\u093E \u0939\u0948', answerRoman: 'Ravi baansuri baja raha hai' },
    { id: 'is-it-raining', title: 'Is it raining there?', images: ['https://images.unsplash.com/photo-1509635022432-0220ac12960b?w=120&h=120&fit=crop'], answer: '\u0935\u0939\u093E\u0902 \u092C\u093E\u0930\u093F\u0936 \u0939\u094B \u0930\u0939\u0940 \u0939\u0948 \u0915\u094D\u092F\u093E?', answerRoman: 'vahaan barish ho rahi hai kya' },
    { id: 'do-you-like-rain', title: 'Do you like the rain?', images: ['https://images.unsplash.com/photo-1509635022432-0220ac12960b?w=120&h=120&fit=crop'], answer: '\u0915\u094D\u092F\u093E \u0906\u092A\u0915\u094B \u092C\u093E\u0930\u093F\u0936 \u092A\u0938\u0902\u0926 \u0939\u0948?', answerRoman: 'kya aapko barish pasand hai' },
    { id: 'my-moms-name-gunjun', title: "My mom's name is Gunjun.", images: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop'], answer: '\u092E\u0947\u0930\u0940 \u092E\u093E\u0902 \u0915\u093E \u0928\u093E\u092E \u0917\u0941\u0902\u091C\u0928 \u0939\u0948', answerRoman: 'meri maa ka naam Gunjun hai' },
    { id: 'i-am-happy', title: 'I am happy', images: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop'], answer: 'मैं खुश हूँ', answerRoman: 'main khush hoon' },
    { id: 'i-like-tea', title: 'I like tea in the evening.', images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=120&h=120&fit=crop'], answer: '\u092E\u0941\u091D\u0947 \u0936\u093E\u092E \u0915\u094B \u091A\u093E\u092F \u092A\u0938\u0902\u0926 \u0939\u0948', answerRoman: 'mujhe shaam ko chai pasand hai' },
    { id: 'cat-sleeping', title: 'The cat is sleeping', images: ['https://images.unsplash.com/photo-1514888286974-6d038452eefb?w=120&h=120&fit=crop'], answer: 'बिल्ली सो रही है', answerRoman: 'billi so rahi hai' },
    { id: 'good-morning', title: 'Good morning', images: ['https://images.unsplash.com/photo-1495616811223-4d98c6e1c869?w=120&h=120&fit=crop'], answer: 'सुप्रभात', answerRoman: 'suprabhaat' },
    { id: 'thank-you', title: 'Thank you', images: ['https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=120&h=120&fit=crop'], answer: 'धन्यवाद', answerRoman: 'dhanyavaad' },
    { id: 'snake-on-road', title: 'The snake is on the road.', images: ['https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=120&h=120&fit=crop'], answer: 'साँप सड़क पर है', answerRoman: 'saanp sadak par hai' },
    { id: 'i-dont-like-oranges', title: "I don't like oranges.", images: ['https://images.unsplash.com/photo-1547514701-42782101795e?w=120&h=120&fit=crop'], answer: 'मुझे संतरे पसंद नहीं हैं', answerRoman: 'mujhe santre pasand nahin hain' },
    { id: 'lion-is-orange', title: 'The lion is orange.', images: ['https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=120&h=120&fit=crop'], answer: 'शेर नारंगी है', answerRoman: 'sher narangi hai' },
    { id: 'sunita-dancing', title: 'Sunita is doing the dance.', images: ['https://images.unsplash.com/photo-1524368535928-5d5e35461bb4?w=120&h=120&fit=crop'], answer: 'सुनीता नाच कर रही है', answerRoman: 'Sunita naach kar rahi hai' },
    { id: 'june-india', title: 'In June we are going to India.', images: ['https://images.unsplash.com/photo-1564507592333-c60657eea523?w=120&h=120&fit=crop'], answer: 'जून में हम भारत जा रहे हैं', answerRoman: 'jun mein hum bharat ja rahe hain' },
    { id: 'what-is-your-name', title: 'What is your name?', images: ['https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop'], answer: 'आपका नाम क्या है?', answerRoman: 'aapka naam kya hai' },
    { id: 'how-are-you', title: 'How are you?', images: ['https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=120&h=120&fit=crop'], answer: 'आप कैसे हैं?', answerRoman: 'aap kaise hain' },
    { id: 'water-is-hot', title: 'The water is hot.', images: ['https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=120&h=120&fit=crop', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=120&h=120&fit=crop'], answer: '\u092A\u093E\u0928\u0940 \u0917\u0930\u094D\u092E \u0939\u0948', answerRoman: 'pani garam hai' },
    { id: 'tea-is-cold', title: 'The tea is cold.', images: ['https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=120&h=120&fit=crop', 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=120&h=120&fit=crop'], answer: '\u091A\u093E\u092F \u0920\u0902\u0921\u0940 \u0939\u0948', answerRoman: 'chai thandi hai' }
  ];
  var tests = defaultTests.slice();

  function fillTestSelect() {
    testSelect.innerHTML = '<option value="">-- Select test --</option>';
    tests.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title;
      testSelect.appendChild(opt);
    });
  }

  function loadTests() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'tests.json?v=2');
    xhr.onload = function () {
      try {
        var loaded = JSON.parse(xhr.responseText);
        if (loaded && loaded.length) tests = loaded;
      } catch (e) {}
      fillTestSelect();
    };
    xhr.onerror = function () {
      tests = defaultTests.slice();
      fillTestSelect();
    };
    xhr.send();
  }
  fillTestSelect();

  $('startTest').addEventListener('click', function () {
    var id = testSelect.value;
    if (!id) return;
    currentTest = tests.find(function (t) { return t.id === id; });
    if (!currentTest) return;
    imagesRow.innerHTML = '';
    currentTest.images.forEach(function (url) {
      var wrap = document.createElement('div');
      wrap.className = 'img-wrap';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      wrap.appendChild(img);
      imagesRow.appendChild(wrap);
    });
    testAnswer.value = '';
    testResult.textContent = '';
    testResult.className = 'result-box';
    testArea.classList.remove('hidden');
  });

  $('submitTest').addEventListener('click', function () {
    if (!currentTest) return;
    var raw = testAnswer.value.trim();
    if (!raw) {
      testResult.textContent = 'Type your answer first.';
      testResult.className = 'result-box info';
      return;
    }
    var userDev = toDevanagariIfRoman(raw);
    var normUser = normalizeForCompare(userDev);
    var normAnswer = normalizeForCompare(currentTest.answer);
    var normAnswerRoman = normalizeForCompare(transliterate(currentTest.answerRoman));

    var correct = normUser === normAnswer || normUser === normAnswerRoman || normalizeForCompare(raw) === normalizeForCompare(currentTest.answerRoman);

    if (currentTest.id === 'my-moms-name-gunjun') {
      var normMaa = normalizeForCompare('meri maa ka naam Gunjun hai');
      var normMummy = normalizeForCompare('meri mummy ka naam Gunjun hai');
      var normMummyka = normalizeForCompare('meri mummyka naam Gunjun hai');
      var rawNorm = normalizeForCompare(raw);
      correct = correct || normUser === normMaa || normUser === normMummy || normUser === normMummyka || rawNorm === normMaa || rawNorm === normMummy || rawNorm === normMummyka;
    }

    if (correct) {
      testResult.innerHTML = 'Correct. <span class="devanagari-part">' + escapeHtml(currentTest.answer) + '</span>';
      testResult.className = 'result-box correct';
    } else {
      testResult.innerHTML = 'Not quite. Correct: <span class="devanagari-part">' + escapeHtml(currentTest.answer) + '</span> (' + escapeHtml(currentTest.answerRoman) + ')';
      testResult.className = 'result-box incorrect';
    }
  });

  (function initPronunciation() {
    var speakBtn = $('speakPronunciation');
    var statusEl = $('pronunciationStatus');
    var heardEl = $('pronunciationHeard');
    var resultEl = $('pronunciationResult');
    var imgEl = $('pronunciationImage');
    var prevBtn = $('pronunciationPrev');
    var nextBtn = $('pronunciationNext');
    if (!speakBtn || !statusEl || !heardEl || !resultEl || !imgEl || !prevBtn || !nextBtn) return;

    var scenes = [
      {
        id: 'fruit-bowl',
        img: 'https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=640&h=360&fit=crop',
        answer: 'कटोरे में बहुत फल हैं। सेब लाल है। केला पीला है। अंगूर हरे हैं।',
        roman: 'katore mein bahut phal hain. seb laal hai. kela peela hai. angoor hare hain'
      },
      {
        id: 'mountain-landscape',
        img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&h=360&fit=crop',
        answer: 'पहाड़ बड़े हैं। आसमान नीला है। बादल सफेद हैं। पेड़ हरे हैं। घास हरी है।',
        roman: 'pahad bade hain. aasmaan neela hai. baadal safed hain. ped hare hain. ghas hari hai'
      },
      {
        id: 'sheep-field',
        img: 'https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=640&h=360&fit=crop',
        answer: 'बहुत भेड़ें हैं। भेड़ें सफेद हैं। घास हरी है। वे खा रही हैं।',
        roman: 'bahut bheden hain. bheden safed hain. ghas hari hai. ve kha rahi hain'
      },
      {
        id: 'birds-flying',
        img: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=640&h=360&fit=crop',
        answer: 'बहुत पक्षी हैं। पक्षी उड़ रहे हैं। आसमान नीला है।',
        roman: 'bahut pakshi hain. pakshi ud rahe hain. aasmaan neela hai'
      },
      {
        id: 'vegetable-market',
        img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=640&h=360&fit=crop',
        answer: 'बहुत सब्ज़ियाँ हैं। गाजर नारंगी है। टमाटर लाल हैं। पत्तागोभी हरी है।',
        roman: 'bahut sabziyan hain. gaajar narangi hai. tamatar laal hain. pattagobhi hari hai'
      },
      {
        id: 'dogs-playing',
        img: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=640&h=360&fit=crop',
        answer: 'दो कुत्ते हैं। कुत्ते खेल रहे हैं। एक कुत्ता भूरा है। घास हरी है।',
        roman: 'do kutte hain. kutte khel rahe hain. ek kutta bhoora hai. ghas hari hai'
      }
    ];
    var currentIndex = 0;

    function renderScene() {
      var scene = scenes[currentIndex];
      imgEl.src = scene.img;
      imgEl.alt = '';
      statusEl.textContent = '';
      heardEl.textContent = '';
      resultEl.textContent = '';
      resultEl.className = 'result-box';
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === scenes.length - 1;
    }

    prevBtn.addEventListener('click', function () {
      if (currentIndex > 0) {
        currentIndex--;
        renderScene();
      }
    });
    nextBtn.addEventListener('click', function () {
      if (currentIndex < scenes.length - 1) {
        currentIndex++;
        renderScene();
      }
    });

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      var recognition = new SpeechRecognition();
      recognition.lang = 'hi-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      var recognizing = false;

      speakBtn.addEventListener('click', function () {
        if (recognizing) {
          recognition.stop();
          return;
        }
        statusEl.textContent = 'Listening…';
        heardEl.textContent = '';
        resultEl.textContent = '';
        resultEl.className = 'result-box';
        recognizing = true;
        recognition.start();
      });

      recognition.onresult = function (event) {
        recognizing = false;
        var res = event.results && event.results[0] && event.results[0][0];
        var transcript = (res && res.transcript) || '';
        if (!transcript) {
          statusEl.textContent = 'Did not catch that. Try again.';
          return;
        }
        statusEl.textContent = 'Heard sentence below.';

        // Prefer to show what we heard in roman script
        var hasDevanagari = /[\u0900-\u097F]/.test(transcript);
        var apiCfg = getApiConfig();
        if (hasDevanagari && apiCfg) {
          heardEl.textContent = 'Converting to roman…';
          devanagariToRomanWithLlm(apiCfg, transcript, function (err, roman) {
            if (err || !roman) {
              heardEl.textContent = transcript;
            } else {
              heardEl.textContent = roman;
            }
          });
        } else {
          heardEl.textContent = transcript;
        }

        var scene = scenes[currentIndex];
        var targetAnswer = scene.answer;
        var targetRoman = scene.roman;

        var userDev = toDevanagariIfRoman(transcript);
        var normUser = normalizeForCompare(userDev);
        var normAnswer = normalizeForCompare(targetAnswer);
        var normAnswerRoman = normalizeForCompare(transliterate(targetRoman) || targetRoman);

        if (normUser === normAnswer || normUser === normAnswerRoman) {
          resultEl.innerHTML = 'Nice! Example sentence: <span class=\"devanagari-part\">' + escapeHtml(targetAnswer) + '</span> (' + escapeHtml(targetRoman) + ').';
          resultEl.className = 'result-box correct';
        } else {
          resultEl.innerHTML = 'Good try. Example sentence: <span class=\"devanagari-part\">' + escapeHtml(targetAnswer) + '</span> (' + escapeHtml(targetRoman) + ').';
          resultEl.className = 'result-box info';
        }

        var tConfig = getTranslationConfig();
        if (tConfig) {
          var provider = tConfig.provider;
          var key = tConfig.key;
          var baseHtml = resultEl.innerHTML;
          resultEl.innerHTML = baseHtml + '<br/>Checking with ' + (provider === 'google' ? 'Google Translate' : 'DeepL') + '…';
          var done = function (err, english) {
            if (err) {
              resultEl.innerHTML = baseHtml + '<br/>Translation error: ' + escapeHtml(err);
              return;
            }
            if (english) {
              resultEl.innerHTML = baseHtml + '<br/>Translation: ' + escapeHtml(english);
            } else {
              resultEl.innerHTML = baseHtml + '<br/>No translation returned.';
            }
          };
          if (provider === 'google') {
            translateWithGoogle(userDev, key, done, { source: 'hi', target: 'en' });
          } else if (provider === 'deepl') {
            translateWithDeepL(userDev, key, done, { source: 'HI', target: 'EN' });
          }
        }
      };

      recognition.onerror = function (event) {
        recognizing = false;
        var msg = event && event.error ? event.error : 'unknown error';
        statusEl.textContent = 'Speech error: ' + msg;
      };

      recognition.onend = function () {
        recognizing = false;
        if (!statusEl.textContent) {
          statusEl.textContent = 'No speech detected. Try again.';
        }
      };
    } else {
      speakBtn.disabled = true;
      statusEl.textContent = 'Speech recognition is not supported in this browser.';
    }

    renderScene();
  })();

  function bindVocabCheck(listId, checkBtnId, resultId, acceptedAlternates) {
    var list = $(listId);
    var checkBtn = $(checkBtnId);
    var resultEl = $(resultId);
    if (!list || !checkBtn || !resultEl) return;
    acceptedAlternates = acceptedAlternates || {};
    list.querySelectorAll('.vocab-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        inp.classList.remove('vocab-correct', 'vocab-incorrect');
        var row = inp.closest('.vocab-row');
        if (row) {
          var hint = row.querySelector('.vocab-correct-answer');
          if (hint) { hint.textContent = ''; hint.classList.remove('visible'); }
        }
      });
    });
    checkBtn.addEventListener('click', function () {
      var inputs = list.querySelectorAll('.vocab-input');
      var correct = 0;
      var total = inputs.length;
      list.querySelectorAll('.vocab-correct-answer').forEach(function (h) {
        h.textContent = '';
        h.classList.remove('visible');
      });
      inputs.forEach(function (inp) {
        var raw = (inp.value || '').trim();
        var answer = (inp.getAttribute('data-answer') || '').trim();
        var answerIsDevanagari = /[\u0900-\u097F]/.test(answer);
        var ok;
        if (answerIsDevanagari) {
          var normUser = normalizeForCompare(toDevanagariIfRoman(raw));
          var normAnswer = normalizeForCompare(answer);
          ok = normUser === normAnswer && normUser !== '';
        } else {
          var norm = raw.toLowerCase().replace(/\s+/g, ' ');
          var answerLower = answer.toLowerCase();
          var english = inp.closest('.vocab-row').querySelector('.vocab-english');
          var enKey = english ? english.textContent.trim().toLowerCase() : '';
          var alts = acceptedAlternates[enKey];
          ok = norm === answerLower || (alts && alts.indexOf(norm) >= 0);
        }
        inp.classList.toggle('vocab-correct', ok && raw !== '');
        inp.classList.toggle('vocab-incorrect', !ok && raw !== '');
        if (!ok && raw !== '') {
          var row = inp.closest('.vocab-row');
          if (row) {
            var hint = row.querySelector('.vocab-correct-answer');
            if (!hint) {
              hint = document.createElement('span');
              hint.className = 'vocab-correct-answer';
              hint.setAttribute('aria-live', 'polite');
              inp.parentNode.insertBefore(hint, inp.nextSibling);
            }
            hint.textContent = 'Correct: ' + answer;
            hint.classList.add('visible');
          }
        }
        if (ok && raw !== '') correct++;
      });
      resultEl.textContent = total > 0 ? (correct + ' / ' + total + ' correct.') : '';
      resultEl.className = 'result-box ' + (correct === total ? 'correct' : correct > 0 ? 'info' : 'incorrect');
    });
  }
  bindVocabCheck('vocabColorsList', 'checkColors', 'vocabColorsResult', { purple: ['baingani', 'jamuni'] });
  bindVocabCheck('vocabFruitsList', 'checkFruits', 'vocabFruitsResult', { orange: ['santra', 'narangi'], plum: ['alubukhara', 'aloo bukhara'], lychee: ['litchi', 'litchee'], lemon: ['nimbu', 'neebu'], lime: ['nimbu', 'neebu', 'kagzi nimbu'] });
  bindVocabCheck('vocabVegetablesList', 'checkVegetables', 'vocabVegetablesResult', { cucumber: ['kheera', 'kakdi'], onion: ['pyaaz', 'kanda'], cauliflower: ['gobhi', 'phool gobhi'], 'chili pepper': ['mirch', 'hari mirch'], 'bell pepper': ['shimla mirch', 'shimla mirch'], 'snap pea': ['matar', 'chhirwa'], gourd: ['lauki', 'ghiya'] });
  bindVocabCheck('vocabNatureList', 'checkNature', 'vocabNatureResult', { grass: ['ghaas', 'ghas'], tree: ['ped', 'perh', 'per'], sky: ['aasman', 'akash'], 'small plant': ['paudha', 'chota paudha', 'paudha'], leaves: ['patte', 'patta'], rain: ['barish', 'barsaat'] });
  bindVocabCheck('vocabActionVerbsList', 'checkActionVerbs', 'vocabActionVerbsResult', { 'to play (a sport)': ['khelna'], 'to play (an instrument)': ['bajana'], 'to sleep': ['sona', 'sone'], 'to sit': ['baithna'], 'to watch': ['dekhna'], 'to make': ['banana', 'banaana'], 'to read': ['padhna'], 'to eat': ['khana', 'khaana'], 'to drink': ['peena', 'pina'], 'to do': ['karna'] });
  bindVocabCheck('vocabAnimalsList', 'checkAnimals', 'vocabAnimalsResult', { cow: ['gaay', 'gai'], snake: ['saanp', 'sarp'], bird: ['chiriya', 'chidiya', 'panchi'], bear: ['bhaloo', 'bhalu'], elephant: ['haathi', 'hathi'], horse: ['ghoda', 'ghorah'], giraffe: ['jiraaf', 'jiraf'], cheetah: ['cheetah', 'chita'], peacock: ['mor', 'mayur'], deer: ['hiran'] });

  (function initCustomVocab() {
    var customInput = $('customVocabInput');
    var customList = $('vocabCustomList');
    var buildCustomBtn = $('buildCustomVocab');
    var customResult = $('vocabCustomResult');
    var checkCustomBtn = $('checkCustomVocab');
    if (!customInput || !customList || !buildCustomBtn || !customResult || !checkCustomBtn) return;

    function addCustomRow(english, hindiAnswer) {
      var li = document.createElement('li');
      li.className = 'vocab-row';
      var enSpan = document.createElement('span');
      enSpan.className = 'vocab-english';
      enSpan.textContent = english;
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'text-input vocab-input';
      inp.setAttribute('data-answer', hindiAnswer);
      inp.placeholder = 'Hindi word';
      inp.autocomplete = 'off';
      li.appendChild(enSpan);
      li.appendChild(inp);
      customList.appendChild(li);
      inp.addEventListener('input', function () { inp.classList.remove('vocab-correct', 'vocab-incorrect'); });
    }

    buildCustomBtn.addEventListener('click', function () {
      var raw = customInput.value || '';
      var lines = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });

      customList.innerHTML = '';
      customResult.textContent = '';
      customResult.className = 'result-box';
      checkCustomBtn.disabled = true;

      if (lines.length === 0) {
        customResult.textContent = 'Enter at least one English word or phrase (one per line).';
        customResult.className = 'result-box info';
        return;
      }

      var translationConfig = getTranslationConfig();
      var apiConfig = getApiConfig();

      if (translationConfig) {
        var provider = translationConfig.provider;
        var key = translationConfig.key;
        var index = 0;
        buildCustomBtn.disabled = true;
        customResult.textContent = 'Translating…';
        customResult.className = 'result-box info';

        function next() {
          if (index >= lines.length) {
            buildCustomBtn.disabled = false;
            customResult.textContent = '';
            checkCustomBtn.disabled = false;
            return;
          }
          var english = lines[index];
          customResult.textContent = 'Translating… ' + (index + 1) + '/' + lines.length;
          var done = function (err, hindi) {
            if (err) {
              customResult.textContent = 'Error: ' + err + (index > 0 ? ' (added ' + index + ' so far)' : '');
              customResult.className = 'result-box incorrect';
              buildCustomBtn.disabled = false;
              checkCustomBtn.disabled = !customList.querySelector('.vocab-input');
              return;
            }
            if (hindi) addCustomRow(english, hindi);
            index++;
            next();
          };
          if (provider === 'google') {
            translateWithGoogle(english, key, done);
          } else {
            translateWithDeepL(english, key, done);
          }
        }
        next();
        return;
      }

      var idx = 0;
      buildCustomBtn.disabled = true;
      customResult.textContent = 'Translating…';
      customResult.className = 'result-box info';

      function nextLlm() {
        if (idx >= lines.length) {
          buildCustomBtn.disabled = false;
          customResult.textContent = '';
          checkCustomBtn.disabled = false;
          return;
        }
        var english = lines[idx];
        customResult.textContent = 'Translating… ' + (idx + 1) + '/' + lines.length;
        translateEnglishToHindiRoman(apiConfig, english, function (err, roman) {
          if (err) {
            customResult.textContent = 'Error: ' + err + (idx > 0 ? ' (added ' + idx + ' so far)' : '');
            customResult.className = 'result-box incorrect';
            buildCustomBtn.disabled = false;
            checkCustomBtn.disabled = !customList.querySelector('.vocab-input');
            return;
          }
          if (roman) addCustomRow(english, roman);
          idx++;
          nextLlm();
        });
      }
      nextLlm();
    });
  })();
  bindVocabCheck('vocabCustomList', 'checkCustomVocab', 'vocabCustomResult');

  loadTests();

  // Handwriting Practice Section
  (function initHandwriting() {
    // Vowels
    var vowels = [
      { roman: 'a', devanagari: 'अ' },
      { roman: 'aa', devanagari: 'आ' },
      { roman: 'i', devanagari: 'इ' },
      { roman: 'ee', devanagari: 'ई' },
      { roman: 'u', devanagari: 'उ' },
      { roman: 'oo', devanagari: 'ऊ' },
      { roman: 'e', devanagari: 'ए' },
      { roman: 'ai', devanagari: 'ऐ' },
      { roman: 'o', devanagari: 'ओ' },
      { roman: 'au', devanagari: 'औ' }
    ];
    // Consonants
    var consonants = [
      { roman: 'ka', devanagari: 'क' },
      { roman: 'kha', devanagari: 'ख' },
      { roman: 'ga', devanagari: 'ग' },
      { roman: 'gha', devanagari: 'घ' },
      { roman: 'nga', devanagari: 'ङ' },
      { roman: 'cha', devanagari: 'च' },
      { roman: 'chha', devanagari: 'छ' },
      { roman: 'ja', devanagari: 'ज' },
      { roman: 'jha', devanagari: 'झ' },
      { roman: 'nya', devanagari: 'ञ' },
      { roman: 'ṭa', devanagari: 'ट' },
      { roman: 'ṭha', devanagari: 'ठ' },
      { roman: 'ḍa', devanagari: 'ड' },
      { roman: 'ḍha', devanagari: 'ढ' },
      { roman: 'ṇa', devanagari: 'ण' },
      { roman: 'ta', devanagari: 'त' },
      { roman: 'tha', devanagari: 'थ' },
      { roman: 'da', devanagari: 'द' },
      { roman: 'dha', devanagari: 'ध' },
      { roman: 'na', devanagari: 'न' },
      { roman: 'pa', devanagari: 'प' },
      { roman: 'pha', devanagari: 'फ' },
      { roman: 'ba', devanagari: 'ब' },
      { roman: 'bha', devanagari: 'भ' },
      { roman: 'ma', devanagari: 'म' },
      { roman: 'ya', devanagari: 'य' },
      { roman: 'ra', devanagari: 'र' },
      { roman: 'la', devanagari: 'ल' },
      { roman: 'va', devanagari: 'व' },
      { roman: 'sha', devanagari: 'श' },
      { roman: 'ṣha', devanagari: 'ष' },
      { roman: 'sa', devanagari: 'स' },
      { roman: 'ha', devanagari: 'ह' }
    ];
    var hindiAlphabet = vowels.concat(consonants);

    var currentIndex = 0;
    var isRevealed = false;
    var attemptCount = 0;
    var canvas = document.getElementById('hwCanvas');
    var ctx = canvas.getContext('2d');
    var isDrawing = false;
    var lastX = 0;
    var lastY = 0;
    var strokes = [];
    var currentStroke = [];

    var romanEl = document.getElementById('hwRoman');
    var devanagariEl = document.getElementById('hwDevanagari');
    var hintEl = document.getElementById('hwHint');
    var letterDisplay = document.querySelector('.letter-display');
    var prevBtn = document.getElementById('hwPrev');
    var nextBtn = document.getElementById('hwNext');
    var clearBtn = document.getElementById('hwClear');
    var checkBtn = document.getElementById('hwCheck');
    var resultEl = document.getElementById('hwResult');

    function updateDisplay() {
      var letter = hindiAlphabet[currentIndex];
      romanEl.textContent = letter.roman;
      devanagariEl.textContent = letter.devanagari;
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === hindiAlphabet.length - 1;
      
      // Reset to hidden state for new letter
      isRevealed = false;
      attemptCount = 0;
      letterDisplay.classList.remove('revealed');
      devanagariEl.classList.add('hidden');
      hintEl.classList.remove('hidden');
      hintEl.textContent = 'Draw from memory!';
      
      clearCanvas();
      resultEl.textContent = '';
      resultEl.className = 'result-box';
    }

    function revealLetter() {
      isRevealed = true;
      letterDisplay.classList.add('revealed');
      devanagariEl.classList.remove('hidden');
      hintEl.classList.add('hidden');
    }

    function clearCanvas() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      strokes = [];
      currentStroke = [];
    }

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      if (e.touches && e.touches.length > 0) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    function startDrawing(e) {
      e.preventDefault();
      isDrawing = true;
      var pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      currentStroke = [{ x: pos.x, y: pos.y }];
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      var pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
      currentStroke.push({ x: pos.x, y: pos.y });
    }

    function stopDrawing() {
      if (isDrawing && currentStroke.length > 0) {
        strokes.push(currentStroke);
      }
      isDrawing = false;
      currentStroke = [];
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    prevBtn.addEventListener('click', function () {
      if (currentIndex > 0) {
        currentIndex--;
        updateDisplay();
      }
    });

    nextBtn.addEventListener('click', function () {
      if (currentIndex < hindiAlphabet.length - 1) {
        currentIndex++;
        updateDisplay();
      }
    });

    clearBtn.addEventListener('click', function () {
      clearCanvas();
      resultEl.textContent = '';
      resultEl.className = 'result-box';
    });

    checkBtn.addEventListener('click', function () {
      var letter = hindiAlphabet[currentIndex];
      var totalPoints = strokes.reduce(function (sum, s) { return sum + s.length; }, 0);
      
      if (totalPoints < 10) {
        resultEl.textContent = 'Please draw the letter "' + letter.roman + '" on the canvas.';
        resultEl.className = 'result-box info';
        return;
      }

      attemptCount++;

      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var pixels = imageData.data;
      var inkPixels = 0;
      var minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;

      for (var i = 0; i < pixels.length; i += 4) {
        var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (r < 200 || g < 200 || b < 200) {
          inkPixels++;
          var px = (i / 4) % canvas.width;
          var py = Math.floor((i / 4) / canvas.width);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }

      var width = maxX - minX;
      var height = maxY - minY;
      var coverage = inkPixels / (canvas.width * canvas.height);
      var hasEnoughStrokes = strokes.length >= 1;
      var hasReasonableSize = width > 30 && height > 30;
      var hasReasonableCoverage = coverage > 0.01 && coverage < 0.5;

      if (isRevealed) {
        // User is copying after seeing the symbol
        if (hasEnoughStrokes && hasReasonableSize && hasReasonableCoverage) {
          resultEl.innerHTML = '✓ Good job copying <span class="devanagari-part">' + letter.devanagari + '</span>! Use the arrows to try the next letter.';
          resultEl.className = 'result-box correct';
        } else if (!hasReasonableSize) {
          resultEl.textContent = 'Try drawing it a bit larger. Look at the symbol above and copy it.';
          resultEl.className = 'result-box info';
        } else {
          resultEl.innerHTML = 'Keep practicing! Try to match <span class="devanagari-part">' + letter.devanagari + '</span> shown above.';
          resultEl.className = 'result-box info';
        }
      } else {
        // First attempt from memory - reveal and let them compare
        revealLetter();
        if (hasEnoughStrokes && hasReasonableSize && hasReasonableCoverage) {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + letter.devanagari + '</span> — compare your drawing. Use arrows for next letter.';
          resultEl.className = 'result-box info';
        } else if (!hasReasonableSize) {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + letter.devanagari + '</span>. Try drawing it a bit larger.';
          resultEl.className = 'result-box info';
        } else {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + letter.devanagari + '</span>. Clear and try drawing it again!';
          resultEl.className = 'result-box info';
        }
      }
    });

    updateDisplay();
  })();

  // Word Practice Section
  (function initWordPractice() {
    var words = [
      { roman: 'raat', devanagari: 'रात', meaning: 'night' },
      { roman: 'maala', devanagari: 'माला', meaning: 'garland' },
      { roman: 'haar', devanagari: 'हार', meaning: 'necklace' },
      { roman: 'tala', devanagari: 'ताला', meaning: 'lock' },
      { roman: 'khana', devanagari: 'खाना', meaning: 'food' },
      { roman: 'kal', devanagari: 'कल', meaning: 'yesterday/tomorrow' },
      { roman: 'kela', devanagari: 'केला', meaning: 'banana' },
      { roman: 'aat', devanagari: 'आठ', meaning: 'eight' },
      { roman: 'kaala', devanagari: 'काला', meaning: 'black' },
      { roman: 'pila', devanagari: 'पीला', meaning: 'yellow' },
      { roman: 'laal', devanagari: 'लाल', meaning: 'red' },
      { roman: 'patte', devanagari: 'पत्ते', meaning: 'leaves' },
      { roman: 'par', devanagari: 'पर', meaning: 'on' },
      { roman: 'kaam', devanagari: 'काम', meaning: 'work' },
      { roman: 'aajka', devanagari: 'आज का', meaning: "today's" },
      { roman: 'kheera', devanagari: 'खीरा', meaning: 'cucumber' }
    ];

    var currentIndex = 0;
    var isRevealed = false;
    var canvas = document.getElementById('wordCanvas');
    var ctx = canvas.getContext('2d');
    var isDrawing = false;
    var lastX = 0;
    var lastY = 0;
    var strokes = [];
    var currentStroke = [];

    var romanEl = document.getElementById('wordRoman');
    var devanagariEl = document.getElementById('wordDevanagari');
    var hintEl = document.getElementById('wordHint');
    var meaningEl = document.getElementById('wordMeaning');
    var wordDisplay = document.getElementById('wordDisplayBox');
    var prevBtn = document.getElementById('wordPrev');
    var nextBtn = document.getElementById('wordNext');
    var clearBtn = document.getElementById('wordClear');
    var checkBtn = document.getElementById('wordCheck');
    var resultEl = document.getElementById('wordResult');

    function updateDisplay() {
      var word = words[currentIndex];
      romanEl.textContent = word.roman;
      devanagariEl.textContent = word.devanagari;
      meaningEl.textContent = word.meaning;
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === words.length - 1;
      
      // Reset to hidden state for new word
      isRevealed = false;
      wordDisplay.classList.remove('revealed');
      devanagariEl.classList.add('hidden');
      hintEl.classList.remove('hidden');
      hintEl.textContent = 'Write from memory!';
      
      clearCanvas();
      resultEl.textContent = '';
      resultEl.className = 'result-box';
    }

    function revealWord() {
      isRevealed = true;
      wordDisplay.classList.add('revealed');
      devanagariEl.classList.remove('hidden');
      hintEl.classList.add('hidden');
    }

    function clearCanvas() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      strokes = [];
      currentStroke = [];
    }

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      if (e.touches && e.touches.length > 0) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    function startDrawing(e) {
      e.preventDefault();
      isDrawing = true;
      var pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
      currentStroke = [{ x: pos.x, y: pos.y }];
    }

    function draw(e) {
      if (!isDrawing) return;
      e.preventDefault();
      var pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
      currentStroke.push({ x: pos.x, y: pos.y });
    }

    function stopDrawing() {
      if (isDrawing && currentStroke.length > 0) {
        strokes.push(currentStroke);
      }
      isDrawing = false;
      currentStroke = [];
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    prevBtn.addEventListener('click', function () {
      if (currentIndex > 0) {
        currentIndex--;
        updateDisplay();
      }
    });

    nextBtn.addEventListener('click', function () {
      if (currentIndex < words.length - 1) {
        currentIndex++;
        updateDisplay();
      }
    });

    clearBtn.addEventListener('click', function () {
      clearCanvas();
      resultEl.textContent = '';
      resultEl.className = 'result-box';
    });

    checkBtn.addEventListener('click', function () {
      var word = words[currentIndex];
      var totalPoints = strokes.reduce(function (sum, s) { return sum + s.length; }, 0);
      
      if (totalPoints < 15) {
        resultEl.textContent = 'Please write "' + word.roman + '" on the canvas.';
        resultEl.className = 'result-box info';
        return;
      }

      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var pixels = imageData.data;
      var inkPixels = 0;
      var minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;

      for (var i = 0; i < pixels.length; i += 4) {
        var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (r < 200 || g < 200 || b < 200) {
          inkPixels++;
          var px = (i / 4) % canvas.width;
          var py = Math.floor((i / 4) / canvas.width);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }

      var width = maxX - minX;
      var height = maxY - minY;
      var coverage = inkPixels / (canvas.width * canvas.height);
      var hasEnoughStrokes = strokes.length >= 1;
      var hasReasonableSize = width > 50 && height > 25;
      var hasReasonableCoverage = coverage > 0.01 && coverage < 0.5;

      if (isRevealed) {
        // User is copying after seeing the word
        if (hasEnoughStrokes && hasReasonableSize && hasReasonableCoverage) {
          resultEl.innerHTML = '✓ Good job copying <span class="devanagari-part">' + word.devanagari + '</span>! Use arrows for next word.';
          resultEl.className = 'result-box correct';
        } else if (!hasReasonableSize) {
          resultEl.textContent = 'Try writing it a bit larger. Look at the word above and copy it.';
          resultEl.className = 'result-box info';
        } else {
          resultEl.innerHTML = 'Keep practicing! Try to match <span class="devanagari-part">' + word.devanagari + '</span> shown above.';
          resultEl.className = 'result-box info';
        }
      } else {
        // First attempt from memory - reveal and let them compare
        revealWord();
        if (hasEnoughStrokes && hasReasonableSize && hasReasonableCoverage) {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + word.devanagari + '</span> — compare your writing. Use arrows for next word.';
          resultEl.className = 'result-box info';
        } else if (!hasReasonableSize) {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + word.devanagari + '</span>. Try writing it a bit larger.';
          resultEl.className = 'result-box info';
        } else {
          resultEl.innerHTML = 'Here\'s <span class="devanagari-part">' + word.devanagari + '</span>. Clear and try copying it!';
          resultEl.className = 'result-box info';
        }
      }
    });

    updateDisplay();
  })();

  // Conversation Section
  var CONVERSATION_SIMPLE_PROMPT = 'You are a friendly Hindi tutor chatting with a learner. Use very simple words and short, clear sentences only. Use only basic, common Hindi vocabulary that beginners know—avoid difficult or formal words. The learner may write in Hindi (roman or Devanagari) or English. Always reply in simple Hindi using ROMAN/Latin letters only (no Devanagari script). Keep replies to 1–2 short sentences. Continue the conversation naturally.';

  function translateSentenceToEnglish(config, sentence, cb) {
    void config;
    var text = (sentence || '').trim();
    if (!text) return cb(null, '');
    var prompt = 'Translate this Hindi sentence to English. Reply with ONLY the English translation, nothing else. Hindi: ' + text;
    openaiChatViaProxy(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0 },
      function (err, data) {
        if (err) return cb(err);
        var t = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        cb(null, (t || '').trim());
      }
    );
  }

  function translateWordToEnglish(config, word, cb) {
    void config;
    var clean = (word || '').trim().toLowerCase().replace(/[.,?!;:]+$/, '');
    if (!clean) return cb(null, '');
    var prompt = 'Give only the English meaning of this Hindi word. Reply with just the English word or short phrase, nothing else. Hindi word: ' + clean;
    openaiChatViaProxy(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 64 },
      function (err, data) {
        if (err) return cb(err);
        var t = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        cb(null, (t || '').trim());
      }
    );
  }

  function chatWithTutor(config, history, cb) {
    void config;
    var systemMsg = CONVERSATION_SIMPLE_PROMPT;
    var messages = [{ role: 'system', content: systemMsg }].concat(history);
    openaiChatViaProxy(
      { model: 'gpt-4o-mini', messages: messages, temperature: 0.7 },
      function (err, data) {
        if (err) return cb(err);
        var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        cb(null, (text || '').trim());
      }
    );
  }

  (function initConversation() {
    var logEl = document.getElementById('conversationLog');
    var inputEl = document.getElementById('conversationInput');
    if (!logEl || !inputEl) return;

    var history = [];
    var sentenceTranslationCache = {};

    var tooltipEl = document.createElement('div');
    tooltipEl.className = 'conversation-tooltip conversation-tooltip-sentence';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipEl);

    function renderBotMessage(text) {
      var div = document.createElement('div');
      div.className = 'conversation-message bot conversation-message-translatable';
      div.textContent = text || '';
      return div;
    }

    function addMessage(role, text) {
      if (role === 'bot') {
        logEl.appendChild(renderBotMessage(text));
      } else {
        var div = document.createElement('div');
        div.className = 'conversation-message ' + role;
        div.textContent = text;
        logEl.appendChild(div);
      }
      logEl.scrollTop = logEl.scrollHeight;
    }

    function showTooltip(content, x, y) {
      tooltipEl.textContent = content || '…';
      tooltipEl.setAttribute('aria-hidden', 'false');
      tooltipEl.style.left = x + 'px';
      tooltipEl.style.top = (y - 8) + 'px';
      tooltipEl.style.transform = 'translate(-50%, -100%)';
      tooltipEl.classList.add('visible');
    }

    function hideTooltip() {
      tooltipEl.classList.remove('visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
    }

    logEl.addEventListener('mouseover', function (e) {
      var msg = e.target.closest('.conversation-message-translatable');
      if (!msg) { hideTooltip(); return; }
      var sentence = (msg.textContent || '').trim();
      if (!sentence) return;
      var rect = msg.getBoundingClientRect();
      if (sentenceTranslationCache[sentence]) {
        showTooltip(sentenceTranslationCache[sentence], rect.left + rect.width / 2, rect.top);
        return;
      }
      showTooltip('Translating…', rect.left + rect.width / 2, rect.top);
      translateSentenceToEnglish(getApiConfig(), sentence, function (err, translation) {
        if (err) {
          tooltipEl.textContent = 'Error: ' + err;
          return;
        }
        sentenceTranslationCache[sentence] = translation;
        if (tooltipEl.classList.contains('visible')) {
          tooltipEl.textContent = translation;
        }
      });
    });

    logEl.addEventListener('mouseout', function (e) {
      var msg = e.target.closest('.conversation-message-translatable');
      if (!msg) return;
      if (e.relatedTarget && (e.relatedTarget === tooltipEl || tooltipEl.contains(e.relatedTarget))) return;
      hideTooltip();
    });

    tooltipEl.addEventListener('mouseenter', function () { tooltipEl.classList.add('visible'); });
    tooltipEl.addEventListener('mouseleave', hideTooltip);

    function sendMessage() {
      var text = inputEl.value.trim();
      if (!text) return;
      addMessage('user', text);
      history.push({ role: 'user', content: text });
      inputEl.value = '';

      chatWithTutor(getApiConfig(), history, function (err, reply) {
        if (err) {
          addMessage('bot', 'API error: ' + err);
          return;
        }
        history.push({ role: 'assistant', content: reply });
        addMessage('bot', reply);
      });
    }

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  })();
})();
