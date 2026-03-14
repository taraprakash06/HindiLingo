# HindiLingo

A small browser app to help with Hindi: **transliterate** roman text to Devanagari, **check** if a phrase is in a known list, and **practice** by writing sentences for image sequences.

## Features

- **Type → Hindi**: Type in romanized Hindi (e.g. `namaste`, `aap kaise hain`) and see it in Devanagari.
- **Check phrase**: Enter a phrase and see if it matches a known correct phrase; your text is shown in Hindi for comparison.
- **Image test**: Pick a test, see a sequence of images, type the sentence that describes them (in Hindi or roman), and get feedback.

## How to run

Open `index.html` in a browser. For the **image tests** to load from `tests.json`, serve the folder with a local server, for example:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# Then open http://localhost:8080 (or the port shown)
```

If you open the file directly (`file://`), the app still works with built-in default tests; only the extra tests from `tests.json` may not load.

## Adding your own image tests

Edit `tests.json`:

```json
[
  {
    "id": "my-test",
    "title": "My test",
    "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    "answer": "सही वाक्य हिंदी में",
    "answerRoman": "sahi vaaky hindi mein"
  }
]
```

- `images`: URLs for the images in order.
- `answer`: Correct sentence in Devanagari.
- `answerRoman`: Same sentence in roman script (used for checking typed answers).

## Transliteration

Roman input uses a simple scheme: `aa` = आ, `ii` = ई, `uu` = ऊ, `ch` = छ, `sh` = श, etc. Type words with spaces; no special characters needed.

## Phrase check

The app checks against a short list of common phrases. For full grammar or open-ended checking, use an AI assistant or add your own API integration.
