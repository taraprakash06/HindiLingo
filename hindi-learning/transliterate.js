/**
 * Roman (Latin) to Devanagari transliteration for Hindi.
 * Uses a common romanization scheme: aa=आ, ii=ई, uu=ऊ, etc.
 */
(function (global) {
  'use strict';

  var VOWELS = {
    a: '\u0905',   aa: '\u0906',  A: '\u0906',  i: '\u0907',   ii: '\u0908',  I: '\u0908',
    u: '\u0909',   uu: '\u090A',  U: '\u090A',  e: '\u090F',   ai: '\u0910',  o: '\u0913',  au: '\u0914',
    R: '\u090B',   RR: '\u0960',  L: '\u090C',  LL: '\u0961',
    M: '\u0902',   H: '\u0903',   '~': '\u0903',  '.': '\u0964'
  };

  var CONSONANTS = {
    k: '\u0915',   kh: '\u0916',  g: '\u0917',   gh: '\u0918',  ng: '\u0919',  c: '\u091A',
    ch: '\u091B',  j: '\u091C',   jh: '\u091D',  ny: '\u091E',  T: '\u091F',
    Th: '\u0920',  D: '\u0921',  Dh: '\u0922',  N: '\u0923',  t: '\u0924',   th: '\u0925',
    d: '\u0926',   dh: '\u0927',  n: '\u0928',   p: '\u092A',   ph: '\u092B',  f: '\u092B',
    b: '\u092C',   bh: '\u092D',  m: '\u092E',   y: '\u092F',   r: '\u0930',   l: '\u0932',
    v: '\u0935',   w: '\u0935',   sh: '\u0936',  S: '\u0936',  s: '\u0938',   h: '\u0939',
    L: '\u0933',   ksh: '\u0915\u094D\u0937',  tr: '\u0924\u094D\u0930',  jn: '\u091C\u094D\u091E'
  };

  var VOWEL_SIGNS = {
    a: '',         aa: '\u093E',  A: '\u093E',  i: '\u093F',   ii: '\u0940',  I: '\u0940',
    u: '\u0941',   uu: '\u0942',  U: '\u0942',  e: '\u0947',   ai: '\u0948',  o: '\u094B',  au: '\u094C',
    R: '\u0943',   RR: '\u0944',  L: '\u0962',  LL: '\u0963',
    M: '\u0902',   H: '\u0903',   '~': '\u0903'
  };

  var CONSONANT_ORDER = ['ksh', 'tr', 'jn', 'kh', 'gh', 'ch', 'jh', 'Th', 'Dh', 'th', 'dh', 'ph', 'bh', 'ng', 'ny', 'sh', 'aa', 'ii', 'uu', 'ai', 'au', 'M', 'H', 'a', 'i', 'I', 'u', 'U', 'e', 'o', 'k', 'g', 'c', 'j', 'T', 'D', 'N', 't', 'd', 'n', 'p', 'b', 'm', 'y', 'r', 'l', 'v', 'w', 's', 'h'];

  function findNextVowel(input, start) {
    var order = ['aa', 'ii', 'uu', 'ai', 'au', 'i', 'u', 'e', 'o', 'a'];
    for (var o = 0; o < order.length; o++) {
      var v = order[o];
      if (input.substr(start, v.length) === v) return { key: v, sign: VOWEL_SIGNS[v] };
    }
    return null;
  }

  function toDevanagari(roman) {
    if (!roman || typeof roman !== 'string') return '';
    var input = roman.trim().toLowerCase().replace(/\s+/g, ' ');
    var out = [];
    var i = 0;
    var len = input.length;

    while (i < len) {
      var matched = false;
      for (var k = 0; k < CONSONANT_ORDER.length; k++) {
        var key = CONSONANT_ORDER[k];
        if (input.substr(i, key.length) !== key) continue;
        if (CONSONANTS[key] !== undefined) {
          var cons = CONSONANTS[key];
          var nextIdx = i + key.length;
          var vInfo = findNextVowel(input, nextIdx);
          if (vInfo) {
            out.push(cons + vInfo.sign);
            i = nextIdx + vInfo.key.length;
          } else if (nextIdx < len && /[a-z]/.test(input[nextIdx])) {
            out.push(cons + '\u094D');
            i = nextIdx;
          } else {
            out.push(cons);
            i = nextIdx;
          }
          matched = true;
          break;
        }
        if (VOWELS[key] !== undefined) {
          out.push(VOWELS[key]);
          i += key.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      var single = input[i];
      if (single === ' ') { out.push(' '); i += 1; matched = true; }
      if (matched) continue;
      if (VOWELS[single] !== undefined) {
        out.push(VOWELS[single]);
        i += 1;
      } else {
        out.push(single);
        i += 1;
      }
    }
    return out.join('');
  }

  global.HindiTransliterate = { toDevanagari: toDevanagari };
})(typeof window !== 'undefined' ? window : this);
