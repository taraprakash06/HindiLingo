// Initialize Mermaid
mermaid.initialize({ 
    startOnLoad: false,
    theme: 'default',
    flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
    }
});

const textInput = document.getElementById('textInput');
const generateBtn = document.getElementById('generateBtn');
const clearBtn = document.getElementById('clearBtn');
const diagramContainer = document.getElementById('diagramContainer');
const downloadBtn = document.getElementById('downloadBtn');
const downloadPngBtn = document.getElementById('downloadPngBtn');
const showPromptsBtn = document.getElementById('showPromptsBtn');
const promptsDebug = document.getElementById('promptsDebug');
const diagnosticsPanel = document.getElementById('diagnosticsPanel');
const openaiKeyInput = document.getElementById('openaiKey');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const fastPreviewToggle = document.getElementById('fastPreviewToggle');
let learningPanel = null;
let learningTitle = null;
let learningStatus = null;
let learningOverview = null;
let learningQuiz = null;
let learningFeedback = null;
let learningFollowup = null;
let checkQuizBtn = null;
const API_KEY_STORAGE_KEY = 'diagram_generator_openai_api_key';
const FAST_PREVIEW_STORAGE_KEY = 'diagram_generator_fast_preview';
const IMAGE_CACHE_STORAGE_KEY = 'diagram_generator_image_cache_v3';
const IMAGE_CACHE_TTL_MS = 45 * 60 * 1000; // 45 minutes

// Store prompts for debugging
let generatedPrompts = [];
const FLAT_DIAGRAM_CONSTRAINT = 'Flat 2D vector-style educational diagram only. Draw directly on clean white background. Not a photo. No camera angle. No paper sheet. No page border. No drop shadow. No realistic scenery. No mockup.';
const READABLE_TEXT_CONSTRAINT = 'If text labels are included, make them large, high-contrast, and easy to read. Use very short labels (1-3 words), minimum 28px-equivalent size, dark text on light background, no tiny text.';
const TEXTBOOK_REFERENCE_CONSTRAINT = 'Use canonical textbook-style educational layouts (high-school/college) for the topic, especially for biology (cell parts, pathways, cycles), while creating an original diagram (do not copy any exact published image).';
const BIOLOGY_TEXTBOOK_CONSTRAINT = 'Biology mode: textbook-like scientific drawing with clean linework, clear arrows, minimal labels, accurate organelles/pathways, high-school or intro-college style.';
let activeRenderedNodes = [];
let activeSourceText = '';
let activeApiKey = '';
let activeLearningQuestions = [];
let activeLearningNode = null;

function showDiagnostics(message) {
    if (!diagnosticsPanel) return;
    if (!message) {
        diagnosticsPanel.style.display = 'none';
        diagnosticsPanel.textContent = '';
        return;
    }
    diagnosticsPanel.style.display = 'block';
    diagnosticsPanel.textContent = message;
}

window.addEventListener('error', (e) => {
    const msg = e?.message || 'Unknown runtime error';
    showDiagnostics(`Runtime error: ${msg}`);
});

window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || JSON.stringify(reason || {}));
    showDiagnostics(`Unhandled promise error: ${msg}`);
});

// Key from config file (config.local.js) or from the input field
function getOpenAIKey() {
    const fromInput = openaiKeyInput ? openaiKeyInput.value.trim() : '';
    const fromConfig = (typeof window !== 'undefined' && window.OPENAI_API_KEY) ? String(window.OPENAI_API_KEY).trim() : '';
    return fromInput || fromConfig;
}

function loadStoredApiKey() {
    if (!openaiKeyInput) return;
    try {
        const saved = window.localStorage.getItem(API_KEY_STORAGE_KEY);
        if (saved && !openaiKeyInput.value.trim()) {
            openaiKeyInput.value = saved;
        }
    } catch (err) {
        console.warn('Could not load saved API key from localStorage.', err);
    }
}

function saveApiKeyToStorage() {
    if (!openaiKeyInput) return;
    try {
        const key = openaiKeyInput.value.trim();
        if (key) {
            window.localStorage.setItem(API_KEY_STORAGE_KEY, key);
        } else {
            window.localStorage.removeItem(API_KEY_STORAGE_KEY);
        }
    } catch (err) {
        console.warn('Could not save API key to localStorage.', err);
    }
}

function loadFastPreviewPreference() {
    if (!fastPreviewToggle) return;
    try {
        const saved = window.localStorage.getItem(FAST_PREVIEW_STORAGE_KEY);
        if (saved !== null) {
            fastPreviewToggle.checked = saved === '1';
        } else {
            // Default to detailed decomposition mode unless user opts into fast preview.
            fastPreviewToggle.checked = false;
        }
    } catch (err) {
        console.warn('Could not load fast preview preference.', err);
    }
}

function saveFastPreviewPreference() {
    if (!fastPreviewToggle) return;
    try {
        window.localStorage.setItem(FAST_PREVIEW_STORAGE_KEY, fastPreviewToggle.checked ? '1' : '0');
    } catch (err) {
        console.warn('Could not save fast preview preference.', err);
    }
}

function readImageCache() {
    try {
        const raw = window.localStorage.getItem(IMAGE_CACHE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeImageCache(cache) {
    try {
        window.localStorage.setItem(IMAGE_CACHE_STORAGE_KEY, JSON.stringify(cache));
    } catch (_) {
        // ignore quota/storage issues
    }
}

function getCachedImage(prompt) {
    const cache = readImageCache();
    const entry = cache[prompt];
    if (!entry || !entry.url || !entry.ts) return null;
    if (Date.now() - entry.ts > IMAGE_CACHE_TTL_MS) return null;
    return entry.url;
}

function setCachedImage(prompt, url) {
    if (!prompt || !url) return;
    const cache = readImageCache();
    cache[prompt] = { url, ts: Date.now() };
    writeImageCache(cache);
}

// Show API key status
function updateApiKeyStatus() {
    if (!apiKeyStatus) return;
    const key = getOpenAIKey();
    if (key.length === 0) {
        apiKeyStatus.innerHTML = '<span class="status-badge status-none">No API key (enter below or use config.local.js)</span>';
        apiKeyStatus.className = 'api-key-status';
    } else     if (key.startsWith('sk-') && key.length > 20) {
        const masked = 'sk-' + '•'.repeat(Math.min(key.length - 3, 20)) + key.slice(-4);
        const source = (openaiKeyInput && openaiKeyInput.value.trim()) ? '' : ' (from config)';
        apiKeyStatus.innerHTML = `<span class="status-badge status-ok">✓ Key detected${source}: ${masked}</span>`;
        apiKeyStatus.className = 'api-key-status status-ok';
    } else {
        apiKeyStatus.innerHTML = '<span class="status-badge status-error">⚠ Invalid format (should start with sk-)</span>';
        apiKeyStatus.className = 'api-key-status status-error';
    }
}

// Update status when key changes
if (openaiKeyInput) {
    loadStoredApiKey();
    openaiKeyInput.addEventListener('input', updateApiKeyStatus);
    openaiKeyInput.addEventListener('paste', () => setTimeout(updateApiKeyStatus, 100));
    openaiKeyInput.addEventListener('input', saveApiKeyToStorage);
    openaiKeyInput.addEventListener('blur', saveApiKeyToStorage);
    updateApiKeyStatus();
}
if (fastPreviewToggle) {
    loadFastPreviewPreference();
    fastPreviewToggle.addEventListener('change', saveFastPreviewPreference);
}

// ---------- Image URLs (no API key required by default) ----------
function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

function getPicsumUrl(label, width = 200, height = 200) {
    const seed = hashString(label);
    return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

// Use ChatGPT to process study guide text and create optimized DALL-E prompts
async function getChatGPTPrompt(heading, description, apiKey) {
    if (!apiKey || !heading) return null;
    
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-')) return null;
    
    const systemPrompt = `You are an expert at creating precise DALL-E prompts for educational scientific diagrams. 
Your task: Read the study guide content and create a clear, specific DALL-E prompt that will generate an accurate educational diagram.

CRITICAL RULES:
1. Focus EXACTLY on what the heading says. If heading is "Calvin Cycle", the diagram MUST be about Calvin cycle, not photosynthesis or plants.
2. Include ALL specific scientific terms from the heading and description (e.g., chloroplast, thylakoid, stroma, ATP, NADPH, RuBisCO, CO2, glucose, etc.)
3. Make it visual and concrete - describe what can be drawn (structures, molecules, processes)
4. Be VERY specific: "chloroplast showing thylakoid membrane stacks and stroma" NOT just "plant" or "photosynthesis"
5. If heading mentions a specific process (e.g., "Calvin Cycle"), focus on that process diagram, not the general topic
6. Format: "Educational diagram of [EXACT subject from heading], showing [specific components mentioned], [domain] clean vector style, white background, labeled"
7. NEVER include: buildings, coffee, food, people, abstract art, random objects, landscapes, cities
8. If heading is "Photosynthesis", show chloroplast/leaf cell. If heading is "Calvin Cycle", show the Calvin cycle process in stroma.
9. Match the heading EXACTLY - don't generalize to broader topics`;

    const userPrompt = `Heading: "${heading}"
${description ? `Description: "${description}"` : ''}

Create a DALL-E prompt for an educational diagram that shows EXACTLY what the heading describes. 
- If heading is "Calvin Cycle", create a diagram of the Calvin cycle process (carbon fixation in stroma)
- If heading is "Photosynthesis", create a diagram of photosynthesis (chloroplast, light reactions)
- Focus on the SPECIFIC heading, not general topics
- Include all scientific terms mentioned
- Return ONLY the prompt, nothing else.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${trimmedKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3, // Lower temperature for more consistent, focused prompts
                max_tokens: 250
            })
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            let prompt = data.choices[0].message.content.trim();
            
            // Clean up the prompt - remove quotes if ChatGPT wrapped it
            prompt = prompt.replace(/^["']|["']$/g, '').trim();
            
            // Validate prompt is specific enough
            const headingLower = heading.toLowerCase();
            if (!prompt.toLowerCase().includes(headingLower.split(' ')[0])) {
                console.warn(`ChatGPT prompt doesn't match heading "${heading}". Prompt: ${prompt.substring(0, 100)}`);
                // Force include the heading concept
                const mainTerm = headingLower.split(' ')[0];
                if (!prompt.toLowerCase().includes(mainTerm)) {
                    prompt = `Educational diagram of ${heading}, ${prompt}`;
                }
            }
            
            console.log(`ChatGPT prompt for "${heading}":`, prompt);
            // Store for debugging
            generatedPrompts.push({ heading, prompt, description: description || '' });
            return prompt;
        } else if (data.error) {
            console.error('ChatGPT API error:', data.error);
            const errorMsg = data.error.message || 'Unknown error';
            if (errorMsg.includes('api key') || errorMsg.includes('authentication') || errorMsg.includes('invalid')) {
                diagramContainer.innerHTML = `<div class="error">⚠️ API Key Error: ${errorMsg}. Please check your OpenAI API key in Image generation settings.</div>`;
            }
            return null;
        }
    } catch (e) {
        console.error('ChatGPT API request failed', e);
        if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('network'))) {
            diagramContainer.innerHTML = `<div class="error">Network error: ${e.message}. Check your internet connection.</div>`;
        }
        return null;
    }
    return null;
}

function tryParseJsonArray(text) {
    if (!text) return null;
    const cleaned = text.trim();
    try {
        const direct = JSON.parse(cleaned);
        return Array.isArray(direct) ? direct : null;
    } catch (_) {
        // fall through
    }
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try {
            const sliced = cleaned.slice(start, end + 1);
            const parsed = JSON.parse(sliced);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return null;
}

function tryParseJsonObject(text) {
    if (!text) return null;
    const cleaned = String(text).trim();
    try {
        const direct = JSON.parse(cleaned);
        return direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : null;
    } catch (_) {
        // fall through
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const sliced = cleaned.slice(start, end + 1);
            const parsed = JSON.parse(sliced);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return null;
}

function escapeHtmlText(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
}

function setActiveRenderContext(nodes, sourceText, apiKey) {
    activeRenderedNodes = Array.isArray(nodes) ? nodes.slice() : [];
    activeSourceText = String(sourceText || '');
    activeApiKey = String(apiKey || '');
}

function resetLearningPanel() {
    activeLearningQuestions = [];
    activeLearningNode = null;
    if (learningPanel && learningPanel.parentNode) {
        learningPanel.parentNode.removeChild(learningPanel);
    }
    learningPanel = null;
    learningTitle = null;
    learningStatus = null;
    learningOverview = null;
    learningQuiz = null;
    learningFeedback = null;
    learningFollowup = null;
    checkQuizBtn = null;
}

function createLearningPanel() {
    const section = document.createElement('section');
    section.className = 'learning-panel';
    section.innerHTML = `
        <div class="learning-panel__header">
            <h3 class="learning-title">Concept Deep Dive</h3>
            <span class="learning-status"></span>
        </div>
        <div class="learning-overview"></div>
        <div class="learning-quiz"></div>
        <div class="learning-actions">
            <button class="btn btn-small learning-check-btn">Check Answers</button>
        </div>
        <div class="learning-feedback"></div>
        <div class="learning-followup"></div>
    `;
    learningPanel = section;
    learningTitle = section.querySelector('.learning-title');
    learningStatus = section.querySelector('.learning-status');
    learningOverview = section.querySelector('.learning-overview');
    learningQuiz = section.querySelector('.learning-quiz');
    learningFeedback = section.querySelector('.learning-feedback');
    learningFollowup = section.querySelector('.learning-followup');
    checkQuizBtn = section.querySelector('.learning-check-btn');
    checkQuizBtn.addEventListener('click', handleCheckQuiz);
    return section;
}

function setLearningStatus(msg) {
    if (learningStatus) learningStatus.textContent = msg || '';
}

function renderLearningQuiz(questions) {
    if (!learningQuiz) return;
    learningQuiz.innerHTML = (questions || []).map((q, idx) => `
        <div class="quiz-item">
          <label for="quizAnswer${idx}">${idx + 1}. ${escapeHtmlText(q.question || '')}</label>
          <textarea id="quizAnswer${idx}" data-qid="${escapeHtmlText(q.id || String(idx + 1))}" placeholder="Type your answer here..."></textarea>
        </div>
    `).join('');
}

async function callOpenAIChatWithRetry(apiKey, body, options = {}) {
    const trimmedKey = String(apiKey || '').trim();
    if (!trimmedKey.startsWith('sk-')) {
        const err = new Error('Invalid API key format');
        err.status = 401;
        throw err;
    }
    const attempts = options.attempts || 3;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${trimmedKey}`
                },
                body: JSON.stringify(body)
            });
            let data = null;
            try {
                data = await response.json();
            } catch (_) {
                data = null;
            }
            if (!response.ok) {
                const msg = data?.error?.message || `HTTP ${response.status}`;
                const code = data?.error?.code ? ` | code: ${data.error.code}` : '';
                const type = data?.error?.type ? ` | type: ${data.error.type}` : '';
                const err = new Error(msg);
                err.status = response.status;
                err.details = `${msg}${code}${type}`;
                throw err;
            }
            return data;
        } catch (err) {
            lastError = err;
            const status = Number(err?.status || 0);
            const retryable = status === 429 || status >= 500;
            if (!retryable || attempt === attempts) break;
            const waitMs = 900 * attempt;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    }
    throw lastError || new Error('Chat request failed');
}

async function getChatGPTDeepDive(node, sourceText, apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-') || !node) return null;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Create concise study support. Return ONLY JSON object: {"overview":"...", "questions":[{"id":"q1","question":"..."},{"id":"q2","question":"..."},{"id":"q3","question":"..."}]}. Overview should be 4-7 short lines. Questions should be short-answer and test understanding.'
                },
                {
                    role: 'user',
                    content: `Concept: "${node.label}"\nContext: "${node.description || ''}"\nStudy guide excerpt:\n"""${String(sourceText || '').slice(0, 2500)}"""`
                }
            ],
            temperature: 0.2,
            max_tokens: 700
        })
    });
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    const parsed = tryParseJsonObject(content);
    if (!parsed) return null;
    const questions = Array.isArray(parsed.questions)
        ? parsed.questions.map((q, idx) => ({
            id: String(q.id || `q${idx + 1}`),
            question: String(q.question || '').trim()
        })).filter((q) => q.question).slice(0, 4)
        : [];
    return {
        overview: String(parsed.overview || '').trim(),
        questions
    };
}

async function checkAnswersWithChatGPT(node, questions, answers, apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-')) return null;
    const payload = questions.map((q, idx) => ({
        id: q.id || `q${idx + 1}`,
        question: q.question,
        answer: answers[idx] || ''
    }));
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Grade short-answer biology/science responses. Return ONLY JSON object: {"results":[{"id":"q1","correct":true/false,"feedback":"..."}], "mastery":"strong|mixed|needs_support", "summary":"..."}'
                },
                {
                    role: 'user',
                    content: `Concept: "${node.label}"\nEvaluate answers:\n${JSON.stringify(payload)}`
                }
            ],
            temperature: 0,
            max_tokens: 700
        })
    });
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    return tryParseJsonObject(content);
}

async function getSimplifiedPrompts(node, sourceText, apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-')) return [];
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Return ONLY a JSON array of 2 very simple DALL-E prompts to teach the same concept at a 7th-grade level (13-year-old understanding). Keep each prompt one focused mini-step, minimal labels, high readability, short plain language.'
                },
                {
                    role: 'user',
                    content: `Concept: "${node.label}"\nStudy guide excerpt:\n"""${String(sourceText || '').slice(0, 1800)}"""`
                }
            ],
            temperature: 0.2,
            max_tokens: 400
        })
    });
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    const parsed = tryParseJsonArray(content);
    if (!parsed) return [];
    return parsed.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 2);
}

// Ask ChatGPT for a multi-part diagram plan:
// "What diagrams would best explain this concept?"
async function getChatGPTDiagramPlan(heading, description, sourceText, apiKey) {
    if (!apiKey || !heading) return [];
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-')) return [];

    const systemPrompt = `You design educational diagram plans with adaptive reading complexity.
Return ONLY a JSON array (no markdown, no extra text).
Each array item must have:
- "title": short step/part title
- "explanation": 1 sentence plain-English explanation
- "dalle_prompt": a concrete DALL-E prompt for that exact part
- "level": one of "5th grade", "10th grade", "high school", "college"
- "needs_annotation": true or false
- "annotation": short note (only when needs_annotation is true)

Rules:
- Identify natural mini-concepts within the broader concept.
- For process concepts (like photosynthesis), break into meaningful sub-steps (e.g., light-dependent reactions, Calvin cycle).
- Produce 4 to 7 parts max.
- Keep parts clear and sequential when process-based.
- Infer the best reading level from the complexity of the study guide context.
- If context is short/general/ambiguous (example: single-term prompt like "photosynthesis"), default to "high school".
- Keep wording and detail appropriate for the inferred level while remaining scientifically accurate.
- Keep each diagram focused: one step/idea per diagram, low visual clutter, 1-4 labels max.
- Use your judgment: set needs_annotation=true only when the visual is detail-heavy (many symbols/arrows/formulas/relationships).
- When needs_annotation=true, write annotation as a short learner note about how to read the visual.
- Never include generic headings like "lecture notes", "overview", "summary", or "introduction" as standalone diagram parts.
- Avoid overcrowded scenes and unnecessary objects.
- Make each dalle_prompt specific and visual, clean digital diagram style, plain white background, clear labels and arrows where useful.
- When labels/text appear in the diagram, enforce readability: large, high-contrast, short labels, no tiny print.
- Prefer textbook-style visual conventions (high-school/college), especially for biology concepts and pathways.
- Force flat non-photographic output (vector-like), no paper/page/mockup.
- Keep topic strict to the heading (no unrelated subjects).`;

    const userPrompt = `Concept heading: "${heading}"
${description ? `Context from study guide: "${description}"` : ''}
${sourceText ? `Full study guide text: """${sourceText.slice(0, 2500)}"""` : ''}

Question: What diagrams would best explain this concept?
Audience selection rule:
- Choose "5th grade", "10th grade", "high school", or "college" based on note complexity.
- Default to "high school" if the input is brief or generic.
Requirements:
- 4 to 7 mini diagrams for this concept
- each mini diagram should teach one specific step/sub-concept
- keep language clear and concise, but scientifically correct for the chosen level
- keep drawing instructions focused and uncluttered, 2-5 labels
Return JSON array only.`;

    try {
        const data = await callOpenAIChatWithRetry(trimmedKey, {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
            max_tokens: 700
        }, { attempts: 3 });
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) return [];

        const parsed = tryParseJsonArray(content);
        if (!parsed) {
            console.warn('Could not parse diagram plan JSON for heading:', heading, content);
            return [];
        }

        const normalized = parsed
            .map((item) => ({
                title: String(item.title || '').trim(),
                explanation: String(item.explanation || '').trim(),
                dalle_prompt: String(item.dalle_prompt || '').trim(),
                level: String(item.level || '').trim().toLowerCase(),
                needs_annotation: Boolean(item.needs_annotation),
                annotation: String(item.annotation || '').trim()
            }))
            .filter((item) => item.title && item.dalle_prompt)
            .slice(0, 7)
            .map((item) => ({
                title: item.title.split(':').slice(0, 2).join(':').slice(0, 60),
                explanation: item.explanation.slice(0, 120),
                level: ['5th grade', '10th grade', 'high school', 'college'].includes(item.level) ? item.level : 'high school',
                needs_annotation: item.needs_annotation && item.annotation.length > 0,
                annotation: item.annotation.slice(0, 220),
                // Default to high-school detail unless model explicitly infers otherwise.
                dalle_prompt: `${item.dalle_prompt}. Clear diagram for a ${['5th grade', '10th grade', 'high school', 'college'].includes(item.level) ? item.level : 'high school'} student. One focused step per image. Keep design simple and uncluttered. 2-5 short labels max. Clean digital vector diagram style, plain white background.`
                    .concat(` ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT} ${FLAT_DIAGRAM_CONSTRAINT}`)
                    .replace(/\s+/g, ' ')
                    .slice(0, 420)
            }));

        generatedPrompts.push({
            heading,
            prompt: `Plan with ${normalized.length} parts (${normalized[0]?.level || 'high school'})`,
            description: normalized.map((x) => `${x.title}: ${x.dalle_prompt}${x.needs_annotation ? ` [Annotation: ${x.annotation}]` : ''}`).join(' | ')
        });

        return normalized;
    } catch (err) {
        console.error('ChatGPT diagram plan failed', err);
        showDiagnostics(`Chat planning error: ${err?.details || err?.message || 'unknown error'}`);
        return [];
    }
}

async function inferChatGPTAudienceLevel(heading, description, sourceText, apiKey) {
    if (!apiKey) return 'high school';
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-')) return 'high school';

    try {
        const data = await callOpenAIChatWithRetry(trimmedKey, {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Classify study guide complexity into one audience level. Return exactly one label only: "5th grade", "10th grade", "high school", or "college". Default to "high school" when input is short or generic.'
                },
                {
                    role: 'user',
                    content: `Heading: "${heading || ''}"\n${description ? `Description: "${description}"\n` : ''}${sourceText ? `Study guide text: """${sourceText.slice(0, 1500)}"""` : ''}`
                }
            ],
            temperature: 0,
            max_tokens: 12
        }, { attempts: 2 });
        const label = (data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
        if (['5th grade', '10th grade', 'high school', 'college'].includes(label)) return label;
    } catch (err) {
        showDiagnostics(`Audience-level check limited: ${err?.details || err?.message || 'unknown error'}`);
        // Fallback below
    }
    return 'high school';
}

async function shouldUseMermaidDrawer(sourceText, apiKey) {
    const text = String(sourceText || '').trim();
    if (!text) return false;
    // Heuristic first: long/structured notes are usually clearer as drawn diagrams.
    if (text.length > 1400 || (text.match(/^#{1,4}\s+/gm) || []).length >= 5) return true;
    if (!apiKey || !apiKey.trim().startsWith('sk-')) return false;
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Decide whether a study guide should be rendered as a clean Mermaid diagram rather than illustration cards. Return only "yes" or "no". Choose "yes" when content is dense, multi-step, highly relational, or likely to become visually cluttered as drawings.'
                    },
                    { role: 'user', content: text.slice(0, 1800) }
                ],
                temperature: 0,
                max_tokens: 4
            })
        });
        const data = await response.json();
        const answer = String(data?.choices?.[0]?.message?.content || '').trim().toLowerCase();
        return answer.startsWith('y');
    } catch (_) {
        return false;
    }
}

async function getChatGPTMermaidDiagram(sourceText, apiKey) {
    const text = String(sourceText || '').trim();
    if (!apiKey || !apiKey.trim().startsWith('sk-') || !text) return null;
    try {
        const data = await callOpenAIChatWithRetry(apiKey.trim(), {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You design SIMPLE educational diagrams from study guides.
Return ONLY a JSON object (no markdown) with keys:
- "mermaid": Mermaid syntax string
- "annotations": array of 2-4 short bullets (plain English)

Rules:
- Do NOT use flowchart or sequenceDiagram.
- Prefer "mindmap" for concept/topic overviews.
- Use "stateDiagram-v2" only for process transitions.
- Keep diagram simple: at most 9 nodes and max 2 depth levels.
- Keep labels short (1-4 words each).
- Default to high-school clarity unless notes are clearly more advanced.
- Make annotations directly explain how to read this exact diagram.`
                },
                {
                    role: 'user',
                    content: `Study guide:\n"""${text.slice(0, 3000)}"""\n\nGenerate one simple, useful diagram and matching annotations.`
                }
            ],
            temperature: 0.2,
            max_tokens: 700
        }, { attempts: 2 });
        const content = String(data?.choices?.[0]?.message?.content || '').trim();
        if (!content) return null;
        const parsed = tryParseJsonObject(content);
        if (!parsed) return null;
        const cleaned = String(parsed.mermaid || '').replace(/```mermaid|```/g, '').trim();
        const annotations = Array.isArray(parsed.annotations)
            ? parsed.annotations.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4)
            : [];
        if (!cleaned) return null;
        if (/(flowchart|sequenceDiagram)/i.test(cleaned)) return null;
        if (!/(mindmap|stateDiagram-v2|classDiagram|erDiagram|journey|graph)/i.test(cleaned)) return null;
        generatedPrompts.push({
            heading: 'Mermaid Diagram',
            prompt: 'ChatGPT -> Mermaid rendering path',
            description: `${cleaned.slice(0, 350)}${annotations.length ? ` | Notes: ${annotations.join(' | ')}` : ''}`
        });
        return { mermaid: cleaned, annotations };
    } catch (err) {
        console.error('ChatGPT Mermaid generation failed', err);
        showDiagnostics(`Fallback diagram generation error: ${err?.details || err?.message || 'unknown error'}`);
        return null;
    }
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
        while (true) {
            const current = nextIndex++;
            if (current >= items.length) break;
            results[current] = await worker(items[current], current);
        }
    }
    const workers = Array.from({ length: Math.max(1, limit) }, () => runWorker());
    await Promise.all(workers);
    return results;
}

// Generate multiple AI drawing variations with TRULY different styles and focuses
async function generateDrawingVariations(basePrompt, apiKey, count = 2, options = {}) {
    if (!apiKey || !basePrompt || basePrompt.length < 10) {
        console.warn('Missing API key or invalid prompt');
        return [];
    }
    
    const trimmedKey = apiKey.trim();
    if (!trimmedKey.startsWith('sk-')) {
        console.warn('Invalid API key format');
        return [];
    }
    
    async function requestOpenAIImage(promptText) {
        let lastError = null;
        const attempts = 3;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const response = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${trimmedKey}`
                    },
                    body: JSON.stringify({
                        model: 'dall-e-3',
                        prompt: promptText,
                        n: 1,
                        size: '1024x1024',
                        quality: 'standard',
                        style: 'vivid'
                    })
                });
                let data = null;
                try {
                    data = await response.json();
                } catch (_) {
                    data = null;
                }
                if (!response.ok) {
                    const msg = data?.error?.message || `HTTP ${response.status}`;
                    const code = data?.error?.code ? ` | code: ${data.error.code}` : '';
                    const type = data?.error?.type ? ` | type: ${data.error.type}` : '';
                    const err = new Error(msg);
                    err.status = response.status;
                    err.details = `${msg}${code}${type}`;
                    throw err;
                }
                const url = data?.data?.[0]?.url;
                if (!url) throw new Error('No image URL returned by API');
                return url;
            } catch (err) {
                lastError = err;
                const status = Number(err?.status || 0);
                const retryable = status >= 500 || status === 429 || String(err?.message || '').toLowerCase().includes('timeout');
                if (!retryable || attempt === attempts) break;
                const waitMs = 800 * attempt;
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
        }
        throw lastError || new Error('Image generation failed');
    }

    // If one image is requested, keep prompt as-is for maximum control/simplicity.
    const biologyBoost = options.biologyMode ? ` ${BIOLOGY_TEXTBOOK_CONSTRAINT}` : '';
    if (count <= 1) {
        const single = `${basePrompt}. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}${biologyBoost} ${FLAT_DIAGRAM_CONSTRAINT}`
            .replace(/\s+/g, ' ')
            .slice(0, 1100)
            .trim();
        const cached = getCachedImage(single);
        if (cached) return [cached];
        try {
            const url = await requestOpenAIImage(single);
            setCachedImage(single, url);
            return [url];
        } catch (e) {
            // Retry once with a shorter safer prompt for 400/policy-ish failures.
            if (e && (e.status === 400 || String(e.message || '').toLowerCase().includes('policy'))) {
                const safePrompt = `Simple educational ${options.biologyMode ? 'biology ' : ''}diagram of ${basePrompt.split('.')[0].slice(0, 120)}. White background, 1-3 readable labels, clean vector style. ${FLAT_DIAGRAM_CONSTRAINT}`
                    .replace(/\s+/g, ' ')
                    .slice(0, 700)
                    .trim();
                try {
                    const safeUrl = await requestOpenAIImage(safePrompt);
                    setCachedImage(safePrompt, safeUrl);
                    return [safeUrl];
                } catch (e2) {
                    console.error('DALL-E retry failed:', e2?.message || e2);
                    showDiagnostics(`OpenAI images retry failed: ${e2?.details || e2?.message || 'unknown error'}`);
                    if (diagramContainer) {
                        diagramContainer.innerHTML = `<div class="error">⚠️ Image generation failed (${e2?.message || 'request rejected'}). Showing fallback visuals. Try a shorter prompt, or check OpenAI billing/model access.</div>`;
                    }
                }
            }
            return [];
        }
    }

    // If ChatGPT generated the prompt, create variations by modifying style/focus
    // Otherwise, extract core subject and create variations
    const isChatGPTPrompt = basePrompt.length > 100 && !basePrompt.includes('Specifically for:');
    
    let variations = [];
    if (isChatGPTPrompt) {
        // ChatGPT prompt - create variations by adding style modifiers
        const base = basePrompt;
        variations = [
            `${base.replace(/diagram/g, 'simple vector diagram').replace(/style/g, 'clean vector style')}. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}${biologyBoost} ${FLAT_DIAGRAM_CONSTRAINT}`,
            `${base.replace(/diagram/g, 'simplified schematic diagram').replace(/style/g, 'clean line drawing style with arrows')}. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}${biologyBoost} ${FLAT_DIAGRAM_CONSTRAINT}`,
        ].slice(0, count);
    } else {
        // Fallback: extract core subject and create variations
        const coreSubject = basePrompt.split('.')[0].replace('Educational diagram of', '').trim();
        const domain = basePrompt.includes('biology') ? 'biology' : (basePrompt.includes('chemistry') ? 'chemistry' : (basePrompt.includes('physics') ? 'physics' : 'science'));
        
        variations = [
            `Simple vector ${domain} diagram of ${coreSubject}, clear labeled parts, white background. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}${biologyBoost} ${FLAT_DIAGRAM_CONSTRAINT}`,
            `Simplified schematic ${domain} diagram of ${coreSubject}, clean line drawing style, arrows showing process flow, minimal labels. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}${biologyBoost} ${FLAT_DIAGRAM_CONSTRAINT}`,
        ].slice(0, count);
    }
    
    const results = [];
    for (let i = 0; i < variations.length; i++) {
        const prompt = variations[i];
        try {
            const cached = getCachedImage(prompt);
            if (cached) {
                results.push(cached);
                continue;
            }
            const url = await requestOpenAIImage(prompt.slice(0, 1100));
            if (url) {
                results.push(url);
                setCachedImage(prompt, url);
                setCachedImage(prompt, url);
                console.log(`Generated variation ${i + 1}/${variations.length}`);
            }
            // Rate limit: wait between requests (DALL-E 3 has rate limits)
            if (i < variations.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (e) {
            console.error('OpenAI API request failed', e);
            showDiagnostics(`OpenAI images error: ${e?.details || e?.message || 'unknown error'}`);
            if (i === 0) {
                const msg = String(e?.message || '');
                if (msg.toLowerCase().includes('billing') || msg.toLowerCase().includes('quota')) {
                    diagramContainer.innerHTML = `<div class="error">⚠️ OpenAI billing/quota issue: ${msg}</div>`;
                } else if (msg.toLowerCase().includes('rate')) {
                    diagramContainer.innerHTML = `<div class="error">⚠️ Rate limit reached: ${msg}</div>`;
                } else {
                    diagramContainer.innerHTML = `<div class="error">⚠️ Image generation error: ${msg}</div>`;
                }
            }
        }
    }
    return results;
}

// Map abstract/fuzzy terms to ONE concrete diagram subject so DALL-E stays on topic
const CONCRETE_DIAGRAM_MAP = {
    photosynthesis: 'chloroplast inside a plant leaf cell with thylakoid stacks and stroma',
    'light-dependent reactions': 'chloroplast thylakoid membrane with light absorption and ATP production',
    'calvin cycle': 'biology diagram of the Calvin cycle: carbon fixation in chloroplast stroma, RuBisCO, CO2 in, sugar molecules out, labeled steps',
    calvin: 'biology diagram of the Calvin cycle in chloroplast stroma showing carbon fixation and glucose synthesis',
    'light-independent reactions': 'Calvin cycle diagram in chloroplast stroma, carbon fixation, biology textbook',
    chloroplast: 'chloroplast organelle with thylakoid membranes and stroma',
    thylakoid: 'thylakoid membrane stacks inside chloroplast',
    stroma: 'stroma fluid in chloroplast',
    atp: 'ATP molecule structure',
    nadph: 'NADPH molecule',
    glucose: 'glucose molecule structure',
    mitochondria: 'mitochondria organelle in cell',
    overview: null,
    introduction: null,
    summary: null,
    main: null,
    process: null,
    cycle: null,
    energy: null,
    water: null,
    light: null
};

// Detect domain for style
function detectDomain(heading, description) {
    const text = (heading + ' ' + (description || '')).toLowerCase();
    if (text.match(/\b(plant|leaf|chloroplast|photosynthesis|thylakoid|stroma|cell|biology|dna|rna|protein|enzyme|mitochondria|nucleus|ribosome|membrane)\b/)) return 'biology';
    if (text.match(/\b(atom|molecule|compound|reaction|chemical|bond|element|acid|base|ion|electron|proton)\b/)) return 'chemistry';
    if (text.match(/\b(force|energy|motion|velocity|gravity|electric|magnetic|wave|physics)\b/)) return 'physics';
    return 'science';
}

function isBiologySourceText(sourceText) {
    const text = String(sourceText || '').toLowerCase();
    return /\b(biology|cell|cells|chloroplast|photosynthesis|thylakoid|stroma|dna|rna|protein|enzyme|mitochondria|nucleus|ribosome|membrane|genetics|evolution|respiration)\b/.test(text);
}

// Build ONE short, focused prompt so DALL-E draws the right thing (no long lists or "do not")
function buildDrawingPrompt(heading, description, context = '') {
    const headingClean = heading.replace(/[#\-]/g, ' ').trim();
    const headingLower = headingClean.toLowerCase();
    const desc = (description || '').toLowerCase();
    const domain = detectDomain(heading, description);

    // 1) Resolve to one concrete diagram subject - prioritize exact heading match
    let subject = null;
    if (CONCRETE_DIAGRAM_MAP[headingLower]) {
        subject = CONCRETE_DIAGRAM_MAP[headingLower];
    }
    if (!subject) {
        // Check if heading contains any mapped term
        for (const [key, value] of Object.entries(CONCRETE_DIAGRAM_MAP)) {
            if (value && headingLower.includes(key)) {
                subject = value;
                break;
            }
        }
    }
    if (!subject && desc) {
        // Check description for mapped terms
        for (const [key, value] of Object.entries(CONCRETE_DIAGRAM_MAP)) {
            if (value && desc.includes(key)) {
                subject = value;
                break;
            }
        }
    }
    if (!subject) {
        const concreteTerms = [];
        const want = ['chloroplast', 'thylakoid', 'stroma', 'leaf', 'plant cell', 'mitochondria', 'nucleus', 'membrane', 'molecule', 'dna', 'protein', 'enzyme', 'atom', 'cell'];
        for (const w of want) {
            if (headingLower.includes(w) || desc.includes(w)) concreteTerms.push(w);
        }
        subject = concreteTerms.length
            ? concreteTerms.slice(0, 3).join(' and ')
            : headingClean; // Use original heading if no matches
    }

    // 2) Make prompt VERY explicit and relevant - add key details from description
    let detail = '';
    if (desc) {
        const keyDetails = [];
        if (desc.match(/\b(produces|creates|generates)\s+(\w+)/i)) {
            const match = desc.match(/\b(produces|creates|generates)\s+(\w+)/i);
            if (match && match[2] && match[2].length > 3) keyDetails.push(`output: ${match[2]}`);
        }
        if (desc.match(/\b(uses|requires|needs)\s+(\w+)/i)) {
            const match = desc.match(/\b(uses|requires|needs)\s+(\w+)/i);
            if (match && match[2] && match[2].length > 3) keyDetails.push(`input: ${match[2]}`);
        }
        if (desc.match(/\b(inside|in|within|found in|located in)\s+([^.!?]+)/i)) {
            const match = desc.match(/\b(inside|in|within|found in|located in)\s+([^.!?]+)/i);
            if (match && match[2]) {
                const loc = match[2].split(/\s+/).slice(0, 2).join(' ');
                if (loc.length < 20) keyDetails.push(`location: ${loc}`);
            }
        }
        if (keyDetails.length) detail = ', ' + keyDetails.join(', ');
    }

    // 3) Include the specific heading name to make each concept unique
    const headingPart = headingClean !== subject ? `for ${headingClean}` : '';
    
    // 4) Single short sentence: educational diagram of [subject] [for heading] with [details]. style.
    const style = `${domain} textbook-style diagram, white background, labeled, educational only, no people no buildings no objects no food no coffee. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT}`;
    const prompt = `Educational diagram of ${subject}${headingPart ? ' ' + headingPart : ''}${detail}. ${style}.`;
    return prompt.replace(/\s+/g, ' ').trim().slice(0, 400);
}

// Extract a short explanation from content (what the study guide is actually saying)
function getShortDescription(contentArray, maxLength = 160) {
    if (!contentArray || contentArray.length === 0) return '';
    const text = contentArray.join(' ').trim();
    if (!text) return '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    let out = '';
    for (const s of sentences) {
        if ((out + ' ' + s).trim().length > maxLength) break;
        out = (out + ' ' + s).trim();
        if (out.length >= 80) break;
    }
    return (out || text.slice(0, maxLength)).trim();
}

// Scientific/concept terms that often have no direct photos -> map to visual search terms
const VISUAL_SEARCH_MAP = {
    atp: 'cell energy biology', nadph: 'biology molecule', glucose: 'sugar molecule',
    stroma: 'chloroplast cell', thylakoid: 'chloroplast membrane leaf',
    calvin: 'plant leaf biology', chlorophyll: 'chlorophyll leaf green',
    photosynthesis: 'photosynthesis leaf plant', mitochondria: 'cell biology',
    membrane: 'cell membrane biology', reaction: 'chemistry science',
    overview: 'study concept', introduction: 'learning education'
};

// Build a short, visual-first search query so Unsplash returns descriptive photos
function getSearchTermsForImage(heading, description) {
    const stop = new Set('the a an is are was were in on at to for of with by from as into through take place produces creates occurs happens'.split(' '));
    const seen = new Set();
    const add = (word) => {
        const w = word.trim().toLowerCase();
        if (w.length < 2 || stop.has(w)) return;
        if (VISUAL_SEARCH_MAP[w]) {
            VISUAL_SEARCH_MAP[w].split(' ').forEach(part => { if (part.length > 2) seen.add(part); });
            return;
        }
        seen.add(w);
    };

    const headingWords = heading.split(/\s+/).filter(w => w.length > 1);
    headingWords.forEach(w => add(w.replace(/[^a-zA-Z]/g, '')));

    if (description) {
        const text = description.replace(/[.!?,;:()]/g, ' ');
        const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
        capitalized.forEach(phrase => add(phrase));
        const words = text.split(/\s+/).filter(w => w.length > 3 && !stop.has(w.toLowerCase()));
        words.filter(w => w.length > 4 || /[A-Z]/.test(w)).forEach(w => add(w));
    }

    const ordered = [];
    const headingSet = new Set(headingWords.map(w => w.toLowerCase()));
    [...seen].forEach(w => {
        if (headingSet.has(w)) ordered.unshift(w);
        else ordered.push(w);
    });
    return ordered.slice(0, 5).join(' ').trim() || heading.split(/\s+/).slice(0, 3).join(' ');
}

// Icon mapping for different concepts
const iconMap = {
    // Science & Biology
    'photosynthesis': '🌱', 'plant': '🌿', 'cell': '🔬', 'dna': '🧬', 'atom': '⚛️',
    'molecule': '⚗️', 'reaction': '⚡', 'energy': '⚡', 'chemical': '🧪',
    
    // Processes & Systems
    'process': '⚙️', 'system': '🔧', 'cycle': '🔄', 'stage': '📊', 'step': '👣',
    'method': '📋', 'procedure': '📝', 'mechanism': '⚙️',
    
    // Learning & Study
    'concept': '💡', 'idea': '💭', 'theory': '📚', 'principle': '📖', 'definition': '📘',
    'example': '💡', 'topic': '📑', 'subject': '📚',
    
    // Technology
    'computer': '💻', 'software': '💾', 'network': '🌐', 'data': '📊', 'algorithm': '🔢',
    'code': '💻', 'program': '⚙️',
    
    // General
    'overview': '👁️', 'introduction': '🚪', 'summary': '📄', 'conclusion': '✅',
    'main': '⭐', 'important': '⚠️', 'key': '🔑'
};

// Get icon for a concept
function getIcon(text) {
    const lowerText = text.toLowerCase();
    for (const [keyword, icon] of Object.entries(iconMap)) {
        if (lowerText.includes(keyword)) {
            return icon;
        }
    }
    // Default icons based on first letter or common patterns
    if (lowerText.match(/\b(what|how|why|when|where)\b/)) return '❓';
    if (lowerText.match(/\b(example|instance|case)\b/)) return '💡';
    if (lowerText.match(/\b(result|outcome|effect)\b/)) return '📊';
    return '📌'; // Default icon
}

// Parse text with headings and structure
function parseTextWithHeadings(text) {
    const lines = text.split('\n');
    const nonEmptyLines = lines.map((l) => l.trim()).filter(Boolean);
    const structure = {
        title: null,
        sections: []
    };

    // If user pastes a plain line list (no markdown/numbered headings),
    // treat each line as its own concept heading.
    const hasExplicitHeadingSyntax = nonEmptyLines.some((line) =>
        /^#{1,4}\s+/.test(line) ||
        /^\d+(\.\d+)?\s+/.test(line) ||
        /^([A-Z]|[IVX]+)\.\s+/.test(line)
    );
    const looksLikeConceptList =
        !hasExplicitHeadingSyntax &&
        nonEmptyLines.length >= 2 &&
        nonEmptyLines.every((line) =>
            line.length <= 60 &&
            !/[.!?]/.test(line) &&
            line.split(/\s+/).length <= 6
        );

    if (looksLikeConceptList) {
        const uniqueHeadings = [...new Set(nonEmptyLines)];
        return {
            title: 'Study Concepts',
            sections: uniqueHeadings.map((heading) => ({
                heading,
                level: 1,
                icon: getIcon(heading),
                subsections: [],
                content: []
            }))
        };
    }
    
    let currentSection = null;
    let currentSubsection = null;
    
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        // Markdown headings
        const h1Match = trimmed.match(/^#\s+(.+)$/);
        const h2Match = trimmed.match(/^##\s+(.+)$/);
        const h3Match = trimmed.match(/^###\s+(.+)$/);
        const h4Match = trimmed.match(/^####\s+(.+)$/);
        
        // Numbered headings (1., 2., etc.)
        const numH1Match = trimmed.match(/^(\d+)\.\s+(.+)$/);
        const numH2Match = trimmed.match(/^(\d+)\.(\d+)\s+(.+)$/);
        
        // Letter headings (A., B., etc.)
        const letterH1Match = trimmed.match(/^([A-Z])\.\s+(.+)$/);
        const letterH2Match = trimmed.match(/^([A-Z])\.([a-z])\s+(.+)$/);
        
        // Roman numerals
        const romanMatch = trimmed.match(/^([IVX]+)\.\s+(.+)$/i);
        
        if (h1Match || (numH1Match && !numH2Match && !letterH2Match)) {
            // Main heading
            const title = h1Match ? h1Match[1] : (numH1Match ? numH1Match[2] : (letterH1Match ? letterH1Match[2] : (romanMatch ? romanMatch[2] : null)));
            if (title) {
                if (!structure.title) {
                    structure.title = title;
                } else {
                    // New main section
                    if (currentSection) {
                        structure.sections.push(currentSection);
                    }
                    currentSection = {
                        heading: title,
                        level: 1,
                        icon: getIcon(title),
                        subsections: [],
                        content: []
                    };
                    currentSubsection = null;
                }
            }
        } else if (h2Match || numH2Match || letterH2Match) {
            // Subheading
            const heading = h2Match ? h2Match[1] : 
                          (numH2Match ? numH2Match[3] : 
                          (letterH2Match ? letterH2Match[3] : null));
            if (heading) {
                if (!currentSection) {
                    currentSection = {
                        heading: structure.title || 'Main Topic',
                        level: 1,
                        icon: getIcon(heading),
                        subsections: [],
                        content: []
                    };
                }
                currentSubsection = {
                    heading: heading,
                    level: 2,
                    icon: getIcon(heading),
                    subsubsections: [],
                    content: []
                };
                currentSection.subsections.push(currentSubsection);
            }
        } else if (h3Match || h4Match) {
            // Sub-subheading
            const heading = h3Match ? h3Match[1] : h4Match[1];
            if (heading) {
                if (!currentSection) {
                    currentSection = {
                        heading: structure.title || 'Main Topic',
                        level: 1,
                        icon: getIcon(heading),
                        subsections: [],
                        content: []
                    };
                }
                if (!currentSubsection) {
                    currentSubsection = {
                        heading: heading,
                        level: 2,
                        icon: getIcon(heading),
                        subsubsections: [],
                        content: []
                    };
                    currentSection.subsections.push(currentSubsection);
                }
                currentSubsection.subsubsections.push({
                    heading: heading,
                    level: 3,
                    icon: getIcon(heading),
                    content: []
                });
            }
        } else {
            // Regular content
            if (currentSubsection) {
                if (currentSubsection.subsubsections.length > 0) {
                    currentSubsection.subsubsections[currentSubsection.subsubsections.length - 1].content.push(trimmed);
                } else {
                    currentSubsection.content.push(trimmed);
                }
            } else if (currentSection) {
                currentSection.content.push(trimmed);
            } else {
                // No structure yet, create a default section
                if (!structure.title) {
                    // Try to extract a title from first line
                    const firstLine = trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed;
                    structure.title = firstLine;
                }
                if (!currentSection) {
                    currentSection = {
                        heading: structure.title,
                        level: 1,
                        icon: getIcon(trimmed),
                        subsections: [],
                        content: [trimmed]
                    };
                }
            }
        }
    });
    
    // Add last section
    if (currentSection) {
        structure.sections.push(currentSection);
    }
    
    // If no sections but we have a title, create a default section
    if (structure.sections.length === 0 && structure.title) {
        structure.sections.push({
            heading: structure.title,
            level: 1,
            icon: getIcon(structure.title),
            subsections: [],
            content: text.split('\n').filter(l => l.trim()).slice(1)
        });
    }
    
    return structure;
}

// Extract concepts and relationships from content
function extractConcepts(content) {
    const concepts = new Set();
    const relationships = [];
    
    // Find capitalized terms
    const capitalizedTerms = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    capitalizedTerms.forEach(term => {
        if (term.length > 2 && !['The', 'This', 'That', 'These', 'Those'].includes(term)) {
            concepts.add(term);
        }
    });
    
    // Find relationships
    const relationshipKeywords = {
        'contains': ['contains', 'includes', 'consists of', 'comprises', 'has'],
        'leads_to': ['leads to', 'results in', 'produces', 'creates', 'generates', 'causes'],
        'uses': ['uses', 'utilizes', 'employs', 'requires', 'needs'],
        'occurs_in': ['occurs in', 'happens in', 'takes place in', 'found in'],
        'part_of': ['part of', 'component of', 'element of']
    };
    
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        Object.keys(relationshipKeywords).forEach(relType => {
            relationshipKeywords[relType].forEach(keyword => {
                if (lowerSentence.includes(keyword)) {
                    const parts = sentence.split(new RegExp(keyword, 'i'));
                    if (parts.length >= 2) {
                        const subject = extractConcept(parts[0]);
                        const object = extractConcept(parts[1]);
                        if (subject && object) {
                            concepts.add(subject);
                            concepts.add(object);
                            relationships.push({
                                from: subject,
                                to: object,
                                type: relType
                            });
                        }
                    }
                }
            });
        });
    });
    
    return { concepts: Array.from(concepts), relationships };
}

function extractConcept(text) {
    const trimmed = text.trim();
    const capMatch = trimmed.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    if (capMatch) return capMatch[1];
    const words = trimmed.split(/\s+/);
    if (words.length <= 5) {
        return words.join(' ').replace(/[^\w\s]/g, '').trim();
    }
    return words.slice(-3).join(' ').replace(/[^\w\s]/g, '').trim();
}

function normalizeConceptKey(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isGenericConceptHeading(label) {
    const key = normalizeConceptKey(label);
    return [
        'lecture notes',
        'notes',
        'study concepts',
        'main topic',
        'overview',
        'introduction',
        'summary'
    ].includes(key);
}

function getDisplayCaption(label) {
    const raw = String(label || '').trim();
    if (!raw) return '';
    // Prefer the descriptive part after " - ", e.g. "Lecture notes - Restriction enzyme"
    const parts = raw.split(' - ').map((p) => p.trim()).filter(Boolean);
    let caption = parts.length > 1 ? parts.slice(1).join(' - ') : raw;
    // Remove generic leading wrappers if still present.
    caption = caption.replace(/^lecture notes\s*[:\-]?\s*/i, '').trim();
    caption = caption.replace(/^study concepts\s*[:\-]?\s*/i, '').trim();
    return caption || raw;
}

function getDisplayDescription(desc, label) {
    let out = String(desc || '').trim();
    if (!out) return '';
    out = out.replace(/^lecture notes\s*[:\-]?\s*/i, '').trim();
    out = out.replace(/^study concepts\s*[:\-]?\s*/i, '').trim();
    const labelKey = normalizeConceptKey(label);
    const outKey = normalizeConceptKey(out);
    if (labelKey && outKey.startsWith(labelKey)) {
        out = out.slice(label.length).replace(/^[:\-\s]+/, '').trim();
    }
    return out.length > 180 ? `${out.slice(0, 177)}...` : out;
}

function getDisplayAnnotation(note) {
    const text = String(note || '').trim();
    if (!text) return '';
    return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function getProcessSteps(label, description) {
    const key = normalizeConceptKey(label);
    if (key.includes('photosynthesis')) {
        return [
            {
                title: 'Step 1: Light Absorption',
                description: 'Chlorophyll in thylakoid membranes absorbs sunlight.',
                prompt: `Educational biology diagram of photosynthesis step 1, chlorophyll in thylakoid membrane absorbing sunlight, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 2: Water Splitting',
                description: 'Water is split, releasing oxygen and transferring electrons.',
                prompt: `Educational biology diagram of photosynthesis step 2, water splitting in thylakoid, oxygen released, electron flow, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 3: ATP and NADPH',
                description: 'Electron transport produces ATP and NADPH.',
                prompt: `Educational biology diagram of photosynthesis step 3, electron transport chain in thylakoid producing ATP and NADPH, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 4: Sugar Formation',
                description: 'Calvin cycle in stroma uses CO2, ATP, and NADPH to produce sugars.',
                prompt: `Educational biology diagram of photosynthesis step 4, Calvin cycle in chloroplast stroma, CO2 fixation to glucose, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            }
        ];
    }

    if (key.includes('calvin cycle') || key.includes('light-independent')) {
        return [
            {
                title: 'Step 1: Carbon Fixation',
                description: 'CO2 combines with RuBP using RuBisCO in the stroma.',
                prompt: `Educational biology diagram of Calvin cycle step 1, carbon fixation with CO2 and RuBP via RuBisCO in chloroplast stroma, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 2: Reduction',
                description: 'ATP and NADPH convert intermediates into G3P.',
                prompt: `Educational biology diagram of Calvin cycle step 2, ATP and NADPH reducing intermediates to G3P, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 3: Regeneration',
                description: 'RuBP is regenerated so the cycle can continue.',
                prompt: `Educational biology diagram of Calvin cycle step 3, regeneration of RuBP, cyclic pathway with arrows, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            }
        ];
    }

    if (key.includes('cellular respiration')) {
        return [
            {
                title: 'Step 1: Glycolysis',
                description: 'Glucose is split into pyruvate in the cytoplasm.',
                prompt: `Educational biology diagram of cellular respiration step 1, glycolysis in cytoplasm, glucose to pyruvate, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 2: Krebs Cycle',
                description: 'Pyruvate products enter mitochondria and cycle generates carriers.',
                prompt: `Educational biology diagram of cellular respiration step 2, Krebs cycle in mitochondria matrix, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            },
            {
                title: 'Step 3: Electron Transport',
                description: 'Electron transport chain produces most ATP and releases water.',
                prompt: `Educational biology diagram of cellular respiration step 3, electron transport chain in inner mitochondrial membrane, ATP production, labeled, clean vector style, white background. ${FLAT_DIAGRAM_CONSTRAINT}`
            }
        ];
    }

    return [];
}

// ---------- Drawing diagram: collect nodes with descriptions and drawing prompts ----------
function collectNodesForPhotoDiagram(structure) {
    const nodes = [];
    let id = 0;
    const rootLabel = structure.title || 'Main Topic';
    const rootContent = structure.sections.length
        ? structure.sections[0].content.length
            ? structure.sections[0].content
            : [structure.sections[0].heading]
        : [];
    const rootDesc = getShortDescription(rootContent);
    nodes.push({
        id: String(id++),
        label: rootLabel,
        level: 0,
        parentId: null,
        description: rootDesc,
        drawingPrompt: buildDrawingPrompt(rootLabel, rootDesc)
    });

    structure.sections.forEach(section => {
        const sectionId = String(id++);
        const sectionDesc = getShortDescription(section.content);
        nodes.push({
            id: sectionId,
            label: section.heading,
            level: 1,
            parentId: '0',
            description: sectionDesc,
            drawingPrompt: buildDrawingPrompt(section.heading, sectionDesc, rootLabel)
        });

        // For process topics, force a simple step-by-step breakdown.
        const processSteps = getProcessSteps(section.heading, sectionDesc);
        if (processSteps.length > 0) {
            processSteps.forEach((step) => {
                nodes.push({
                    id: String(id++),
                    label: `${section.heading} - ${step.title}`,
                    level: 2,
                    parentId: sectionId,
                    description: step.description,
                    drawingPrompt: step.prompt
                });
            });
            return;
        }

        section.subsections.forEach(subsection => {
            const subId = String(id++);
            const subDesc = getShortDescription(subsection.content);
            nodes.push({
                id: subId,
                label: subsection.heading,
                level: 2,
                parentId: sectionId,
                description: subDesc,
                drawingPrompt: buildDrawingPrompt(subsection.heading, subDesc, section.heading)
            });
            const content = subsection.content.join(' ');
            const { concepts } = extractConcepts(content);
            concepts.slice(0, 3).forEach(concept => {
                nodes.push({
                    id: String(id++),
                    label: concept,
                    level: 3,
                    parentId: subId,
                    description: subDesc ? subDesc.slice(0, 100) : '',
                    drawingPrompt: buildDrawingPrompt(concept, subDesc, subsection.heading)
                });
            });
        });
        if (section.subsections.length === 0 && section.content.length > 0) {
            const content = section.content.join(' ');
            const { concepts } = extractConcepts(content);
            const sectionDesc2 = getShortDescription(section.content);
            concepts.slice(0, 3).forEach(concept => {
                nodes.push({
                    id: String(id++),
                    label: concept,
                    level: 3,
                    parentId: sectionId,
                    description: sectionDesc2.slice(0, 100),
                    drawingPrompt: buildDrawingPrompt(concept, sectionDesc2, section.heading)
                });
            });
        }
    });
    return nodes;
}

function buildPhotoDiagramHTML(nodes, imageVariationsByNode, options = {}) {
    const live = Boolean(options.live);
    const fallback = options.fallback !== false;
    const getUrls = (n) => {
        // Use node ID to get unique images per concept
        if (imageVariationsByNode[n.id]) return imageVariationsByNode[n.id];
        if (live && !fallback) return [];
        return [getPicsumUrl(n.label)];
    };
    const root = nodes.find(n => n.level === 0);
    const byParent = {};
    nodes.forEach(n => {
        const pid = n.parentId || 'root';
        if (!byParent[pid]) byParent[pid] = [];
        byParent[pid].push(n);
    });

    function renderNode(n) {
        const cleanCaption = getDisplayCaption(n.label);
        const label = cleanCaption.length > 64 ? cleanCaption.substring(0, 61) + '...' : cleanCaption;
        const imgUrls = getUrls(n);
        const levelClass = `photo-node--level-${n.level}`;
        const cleanDescription = getDisplayDescription(n.description, n.label);
        const descHtml = cleanDescription
            ? `<div class="photo-node__description">${escapeHtml(cleanDescription)}</div>`
            : '';
        const cleanAnnotation = getDisplayAnnotation(n.annotation);
        const annotationHtml = cleanAnnotation
            ? `<div class="photo-node__annotation"><strong>Annotation:</strong> ${escapeHtml(cleanAnnotation)}</div>`
            : '';
        
        // Render multiple images
        const imagesHtml = imgUrls.length
            ? imgUrls.map((url, idx) =>
                `<div class="photo-node__image-variant">
                  <div class="photo-node__image-wrap"><img class="photo-node__image photo-node__image--reveal" src="${url}" alt="${escapeHtml(label)} - variation ${idx + 1}" loading="lazy" /></div>
                </div>`
            ).join('')
            : `<div class="photo-node__image-variant">
                 <div class="photo-node__image-wrap photo-node__image-wrap--sketch">
                   <div class="sketch-lines"></div>
                   <div class="sketch-label">Sketching...</div>
                 </div>
               </div>`;
        
        return `<div class="photo-node ${levelClass}" data-id="${n.id}">
          <div class="photo-node__images">${imagesHtml}</div>
          <div class="photo-node__label">${escapeHtml(label)}</div>
          ${descHtml}
          ${annotationHtml}
        </div>`;
    }

    function escapeHtml(s) {
        if (!s) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function renderLevel(pid) {
        const children = byParent[pid] || [];
        if (children.length === 0) return '';
        return `<div class="photo-diagram__row">${children.map(n => {
            const childHtml = renderLevel(n.id);
            return `<div class="photo-diagram__cell">${renderNode(n)}${childHtml ? `<div class="photo-diagram__children">${childHtml}</div>` : ''}</div>`;
        }).join('')}</div>`;
    }

    const rootHtml = root ? `<div class="photo-diagram__root">${renderNode(root)}</div>` : '';
    const childrenHtml = renderLevel('0');
    return `<div class="photo-diagram" id="photoDiagramRoot">${rootHtml}<div class="photo-diagram__children">${childrenHtml}</div></div>`;
}

async function renderPhotoDiagram(structure, openaiApiKey, sourceText = '') {
    // Reset prompts debug
    generatedPrompts = [];
    setActiveRenderContext([], sourceText, openaiApiKey || '');
    resetLearningPanel();
    
    const nodes = collectNodesForPhotoDiagram(structure);
    if (nodes.length === 0) {
        diagramContainer.innerHTML = '<div class="error">Could not build diagram. Add headings (e.g. # Topic, ## Section).</div>';
        return;
    }

    const key = openaiApiKey ? openaiApiKey.trim() : '';
    const hasKey = key.length > 0 && key.startsWith('sk-');
    
    if (!hasKey) {
        const fallbackNodes = nodes.filter((n) => n.level >= 1 && !isGenericConceptHeading(n.label));
        const renderNodes = fallbackNodes.length > 0 ? fallbackNodes : nodes;
        const placeholderImages = {};
        renderNodes.forEach((n) => {
            placeholderImages[n.id] = [getPicsumUrl(n.label, 480, 480)];
        });
        diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, placeholderImages);
        setActiveRenderContext(renderNodes, sourceText, '');
        resetLearningPanel();
        downloadBtn.style.display = 'none';
        downloadPngBtn.style.display = 'inline-block';
        if (showPromptsBtn) showPromptsBtn.style.display = 'none';
        if (promptsDebug) {
            promptsDebug.innerHTML = '<h3>Generated Prompts (for debugging)</h3><div class="prompt-item"><strong>OpenAI key missing.</strong><br><small>Rendered placeholder visuals. Add a valid key to generate AI textbook-style diagrams.</small></div>';
        }
        return;
    }

    // Preferred path: simple picture+diagram generation via ChatGPT + DALL-E.
    // Mermaid is kept as backup only if image generation fails unexpectedly.
    diagramContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Generating simple pictures and diagrams...</p></div>';

    const imageVariationsByNode = {}; // Key by node ID, so each concept/part gets unique images
    const biologyMode = isBiologySourceText(sourceText);
    if (hasKey) {
        // Build from concept headings (skip generic wrappers like "Lecture notes").
        const conceptNodesRaw = nodes.filter((n) => n.level >= 1);
        const conceptNodes = conceptNodesRaw.filter((n) => !isGenericConceptHeading(n.label));
        const nonGenericDeepNodes = nodes.filter((n) => n.level >= 2 && !isGenericConceptHeading(n.label));
        let conceptsForPlanning = conceptNodes.length > 0
            ? conceptNodes
            : (nonGenericDeepNodes.length > 0 ? nonGenericDeepNodes : conceptNodesRaw);
        // Safety fallback: if parsing yields no drawable concept nodes, use root topic.
        if (conceptsForPlanning.length === 0 && nodes[0]) {
            const root = nodes[0];
            conceptsForPlanning = [{
                id: `${root.id}-root-fallback`,
                label: root.label || 'Main Topic',
                level: 1,
                parentId: '0',
                description: root.description || sourceText.slice(0, 180),
                drawingPrompt: root.drawingPrompt || buildDrawingPrompt(root.label || 'Main Topic', root.description || sourceText.slice(0, 180))
            }];
        }
        // Keep ChatGPT planning load low to avoid 429s.
        conceptsForPlanning = conceptsForPlanning.slice(0, 3);
        const plannedPartNodes = [];

        // Fast path: skip ChatGPT planning and generate one simple diagram per concept.
        if (fastPreviewToggle && fastPreviewToggle.checked) {
            const renderNodes = [...conceptsForPlanning];
            const drawableNodes = conceptsForPlanning.length > 0 ? conceptsForPlanning : nodes.filter((n) => n.level > 0);
            const sampleNode = drawableNodes[0] || nodes[0] || { label: '', description: '' };
            const inferredLevel = await inferChatGPTAudienceLevel(sampleNode.label, sampleNode.description, sourceText, key);
            const totalImages = drawableNodes.length;
            diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode, { live: true, fallback: false });
            setActiveRenderContext(renderNodes, sourceText, key);

            let generated = 0;
            let aiSuccessCount = 0;
            await mapWithConcurrency(drawableNodes, 2, async (node) => {
                const finalPrompt = (node.drawingPrompt || `Educational diagram of ${node.label}, labeled, clean vector style, white background.`)
                    .concat(` Clear diagram for a ${inferredLevel} student. One focused idea per image. Keep design simple and uncluttered. 2-5 short labels max. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT} ${FLAT_DIAGRAM_CONSTRAINT}`)
                    .replace(/\s+/g, ' ')
                    .trim();
                generatedPrompts.push({
                    heading: node.label,
                    prompt: finalPrompt,
                    description: `${node.description || ''}${node.description ? ' | ' : ''}Audience: ${inferredLevel}`
                });
                const urls = await generateDrawingVariations(finalPrompt, key, 1, { biologyMode });
                if (urls.length > 0) aiSuccessCount += 1;
                imageVariationsByNode[node.id] = urls.length > 0 ? urls : [getPicsumUrl(node.label)];
                generated += 1;
                diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode, { live: true, fallback: false });
                return null;
            });

            if (aiSuccessCount === 0) {
                const mermaidResult = await getChatGPTMermaidDiagram(sourceText, key);
                if (mermaidResult && mermaidResult.mermaid) {
                    await renderDiagram(mermaidResult.mermaid);
                    appendDiagramAnnotations(mermaidResult.annotations || []);
                    setLearningStatus('Image API unavailable; showing fallback diagram.');
                    return;
                }
            }

            diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode);
            setActiveRenderContext(renderNodes, sourceText, key);
            downloadBtn.style.display = 'none';
            downloadPngBtn.style.display = 'inline-block';
            if (showPromptsBtn) showPromptsBtn.style.display = 'inline-block';
            diagramContainer.dataset.svg = '';
            if (promptsDebug) {
                if (generatedPrompts.length > 0) {
                    const promptsHtml = generatedPrompts.map((p, i) =>
                        `<div class="prompt-item">
                          <strong>${i + 1}. ${p.heading}</strong><br>
                          <code>${p.prompt}</code><br>
                          ${p.description ? `<small>From: ${p.description.substring(0, 300)}...</small>` : ''}
                        </div>`
                    ).join('');
                    promptsDebug.innerHTML = `<h3>Generated Prompts (for debugging)</h3>${promptsHtml}`;
                } else {
                    promptsDebug.innerHTML = `<h3>Generated Prompts (for debugging)</h3><div class="prompt-item"><strong>No prompts captured yet.</strong><br><small>Try generating again after entering at least one concept.</small></div>`;
                }
            }
            return;
        }

        diagramContainer.innerHTML = `<div class="loading"><div class="spinner"></div><p>Planning diagrams with ChatGPT...</p></div>`;
        const plannedByConcept = await mapWithConcurrency(conceptsForPlanning, 1, async (concept) => {
            const keyConcepts = extractConcepts(concept.description || '').concepts.slice(0, 3).join(', ');
            const planningHeading = isGenericConceptHeading(concept.label) && keyConcepts
                ? `Key concepts: ${keyConcepts}`
                : concept.label;
            const plan = await getChatGPTDiagramPlan(planningHeading, concept.description, sourceText, key);
            if (plan.length > 0) {
                return plan.map((part, idx) => ({
                    id: `${concept.id}-part-${idx + 1}`,
                    label: `${concept.label} - ${part.title}`,
                    level: 2,
                    parentId: isGenericConceptHeading(concept.label) ? '0' : concept.id,
                    description: part.explanation,
                    annotation: part.needs_annotation ? part.annotation : '',
                    drawingPrompt: part.dalle_prompt
                }));
            }
            // Fallback: single part from previous prompt builder
            return [{
                id: `${concept.id}-part-1`,
                label: `${concept.label} - Main Diagram`,
                level: 2,
                parentId: isGenericConceptHeading(concept.label) ? '0' : concept.id,
                description: concept.description || '',
                drawingPrompt: `Simple educational vector diagram about ${concept.label}. One main idea only. Minimal drawing. 2-5 short labels. Plain white background. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT} ${FLAT_DIAGRAM_CONSTRAINT}`
            }];
        });
        plannedByConcept.forEach((parts) => {
            if (Array.isArray(parts)) plannedPartNodes.push(...parts);
        });

        const conceptNodesToRender = conceptsForPlanning.filter((c) => !isGenericConceptHeading(c.label));
        const renderNodes = [...conceptNodesToRender, ...plannedPartNodes];
        const drawableNodes = plannedPartNodes.length ? plannedPartNodes : conceptsForPlanning;
        const totalImages = drawableNodes.length; // one simple image per part
        diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode, { live: true, fallback: false });
        setActiveRenderContext(renderNodes, sourceText, key);

        let generated = 0;
        let aiSuccessCount = 0;
        await mapWithConcurrency(drawableNodes, 1, async (node) => {
            const finalPrompt = node.drawingPrompt || `Educational diagram of ${node.label}, labeled, clean vector style, white background. ${READABLE_TEXT_CONSTRAINT} ${TEXTBOOK_REFERENCE_CONSTRAINT} ${FLAT_DIAGRAM_CONSTRAINT}`;
            const urls = await generateDrawingVariations(finalPrompt, key, 1, { biologyMode });
            if (urls.length > 0) {
                imageVariationsByNode[node.id] = urls;
                aiSuccessCount += 1;
            } else {
                imageVariationsByNode[node.id] = [getPicsumUrl(node.label)];
            }
            generated += 1;
            // Live progressive update so users can watch diagrams appear.
            diagramContainer.innerHTML = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode, { live: true, fallback: false });
            return null;
        });

        if (aiSuccessCount === 0) {
            const mermaidResult = await getChatGPTMermaidDiagram(sourceText, key);
            if (mermaidResult && mermaidResult.mermaid) {
                await renderDiagram(mermaidResult.mermaid);
                appendDiagramAnnotations(mermaidResult.annotations || []);
                setLearningStatus('Image API unavailable; showing fallback diagram.');
                return;
            }
        }

        const html = buildPhotoDiagramHTML(renderNodes, imageVariationsByNode);
        diagramContainer.innerHTML = html;
        setActiveRenderContext(renderNodes, sourceText, key);
        downloadBtn.style.display = 'none';
        downloadPngBtn.style.display = 'inline-block';
        if (showPromptsBtn) showPromptsBtn.style.display = 'inline-block';
        diagramContainer.dataset.svg = '';

        if (promptsDebug && generatedPrompts.length > 0) {
            const promptsHtml = generatedPrompts.map((p, i) =>
                `<div class="prompt-item">
                  <strong>${i + 1}. ${p.heading}</strong><br>
                  <code>${p.prompt}</code><br>
                  ${p.description ? `<small>From: ${p.description.substring(0, 300)}...</small>` : ''}
                </div>`
            ).join('');
            promptsDebug.innerHTML = `<h3>Generated Prompts (for debugging)</h3>${promptsHtml}`;
        } else if (promptsDebug) {
            promptsDebug.innerHTML = `<h3>Generated Prompts (for debugging)</h3><div class="prompt-item"><strong>No prompts captured yet.</strong><br><small>Planning may have returned empty. Try regenerating.</small></div>`;
        }
        return;
    }

    const html = buildPhotoDiagramHTML(nodes, imageVariationsByNode);
    diagramContainer.innerHTML = html;
    setActiveRenderContext(nodes, sourceText, key);
    downloadBtn.style.display = 'none';
    downloadPngBtn.style.display = 'inline-block';
    if (showPromptsBtn) showPromptsBtn.style.display = 'inline-block';
    diagramContainer.dataset.svg = '';
    
    // Update prompts debug display
    if (promptsDebug && generatedPrompts.length > 0) {
        const promptsHtml = generatedPrompts.map((p, i) => 
            `<div class="prompt-item">
              <strong>${i + 1}. ${p.heading}</strong><br>
              <code>${p.prompt}</code><br>
              ${p.description ? `<small>From: ${p.description.substring(0, 100)}...</small>` : ''}
            </div>`
        ).join('');
        promptsDebug.innerHTML = `<h3>Generated Prompts (for debugging)</h3>${promptsHtml}`;
    }
}

// Show/hide prompts debug
if (showPromptsBtn) {
    showPromptsBtn.addEventListener('click', () => {
        if (promptsDebug) {
            promptsDebug.style.display = promptsDebug.style.display === 'none' ? 'block' : 'none';
            showPromptsBtn.textContent = promptsDebug.style.display === 'none' ? 'Show Prompts' : 'Hide Prompts';
        }
    });
}

// Generate hierarchical diagram
function generateHierarchicalDiagram(structure) {
    let mermaid = 'flowchart TD\n';
    const nodeIds = {};
    let nodeCounter = 0;
    
    function createNode(text, level = 1) {
        const id = `N${nodeCounter++}`;
        const icon = getIcon(text);
        const displayText = text.length > 30 ? text.substring(0, 27) + '...' : text;
        const label = level === 1 ? `${icon} ${displayText}` : displayText;
        
        // Different node styles for different levels
        let nodeStyle = '["' + label + '"]';
        if (level === 1) {
            nodeStyle = '(("' + label + '"))';
        } else if (level === 2) {
            nodeStyle = '["' + label + '"]';
        } else {
            nodeStyle = '("' + label + '")';
        }
        
        nodeIds[text] = id;
        mermaid += `    ${id}${nodeStyle}\n`;
        return id;
    }
    
    // Create root node
    const rootText = structure.title || 'Main Topic';
    const rootId = createNode(rootText, 1);
    
    // Process sections
    structure.sections.forEach(section => {
        const sectionId = createNode(section.heading, 2);
        mermaid += `    ${rootId} --> ${sectionId}\n`;
        
        // Process subsections
        section.subsections.forEach(subsection => {
            const subsectionId = createNode(subsection.heading, 3);
            mermaid += `    ${sectionId} --> ${subsectionId}\n`;
            
            // Extract concepts from subsection content
            const content = subsection.content.join(' ');
            const { concepts } = extractConcepts(content);
            concepts.slice(0, 3).forEach(concept => {
                const conceptId = createNode(concept, 4);
                mermaid += `    ${subsectionId} --> ${conceptId}\n`;
            });
            
            // Process sub-subsections
            subsection.subsubsections.forEach(subsubsection => {
                const subsubsectionId = createNode(subsubsection.heading, 3);
                mermaid += `    ${subsectionId} --> ${subsubsectionId}\n`;
            });
        });
        
        // Extract concepts from section content if no subsections
        if (section.subsections.length === 0 && section.content.length > 0) {
            const content = section.content.join(' ');
            const { concepts } = extractConcepts(content);
            concepts.slice(0, 4).forEach(concept => {
                const conceptId = createNode(concept, 3);
                mermaid += `    ${sectionId} --> ${conceptId}\n`;
            });
        }
    });
    
    return mermaid;
}

// Generate Mermaid diagram syntax
function generateMermaidDiagram(structure, type) {
    switch (type) {
        case 'hierarchical':
            return generateHierarchicalDiagram(structure);
        case 'flowchart':
            return generateFlowchartFromStructure(structure);
        case 'mindmap':
            return generateMindmapFromStructure(structure);
        case 'graph':
            return generateGraphFromStructure(structure);
        case 'sequence':
            return generateSequenceFromStructure(structure);
        default:
            return generateHierarchicalDiagram(structure);
    }
}

function generateFlowchartFromStructure(structure) {
    let mermaid = 'flowchart TD\n';
    const nodeIds = {};
    let nodeCounter = 0;
    
    function addNode(text, level) {
        const id = `N${nodeCounter++}`;
        const icon = getIcon(text);
        const displayText = text.length > 25 ? text.substring(0, 22) + '...' : text;
        nodeIds[text] = id;
        mermaid += `    ${id}["${icon} ${displayText}"]\n`;
        return id;
    }
    
    const rootId = addNode(structure.title || 'Main Topic', 1);
    let prevId = rootId;
    
    structure.sections.forEach(section => {
        const sectionId = addNode(section.heading, 2);
        mermaid += `    ${prevId} --> ${sectionId}\n`;
        prevId = sectionId;
        
        section.subsections.forEach(subsection => {
            const subsectionId = addNode(subsection.heading, 3);
            mermaid += `    ${sectionId} --> ${subsectionId}\n`;
        });
    });
    
    return mermaid;
}

function generateMindmapFromStructure(structure) {
    let mermaid = 'mindmap\n';
    const rootText = structure.title || 'Main Topic';
    const icon = getIcon(rootText);
    mermaid += `  root((${icon} ${rootText}))\n`;
    
    structure.sections.forEach(section => {
        const sectionIcon = getIcon(section.heading);
        const shortHeading = section.heading.length > 20 ? section.heading.substring(0, 17) + '...' : section.heading;
        mermaid += `    ${sectionIcon}${shortHeading}\n`;
        
        section.subsections.slice(0, 4).forEach(subsection => {
            const subIcon = getIcon(subsection.heading);
            const shortSub = subsection.heading.length > 15 ? subsection.heading.substring(0, 12) + '...' : subsection.heading;
            mermaid += `      ${subIcon}${shortSub}\n`;
        });
    });
    
    return mermaid;
}

function generateGraphFromStructure(structure) {
    let mermaid = 'graph LR\n';
    const nodeIds = {};
    let nodeCounter = 0;
    
    function addNode(text) {
        const id = `N${nodeCounter++}`;
        const icon = getIcon(text);
        const displayText = text.length > 20 ? text.substring(0, 17) + '...' : text;
        nodeIds[text] = id;
        mermaid += `    ${id}["${icon} ${displayText}"]\n`;
        return id;
    }
    
    const rootId = addNode(structure.title || 'Main Topic');
    
    structure.sections.forEach(section => {
        const sectionId = addNode(section.heading);
        mermaid += `    ${rootId} --> ${sectionId}\n`;
        
        section.subsections.forEach(subsection => {
            const subsectionId = addNode(subsection.heading);
            mermaid += `    ${sectionId} --> ${subsectionId}\n`;
        });
    });
    
    return mermaid;
}

function generateSequenceFromStructure(structure) {
    let mermaid = 'sequenceDiagram\n';
    
    const participants = [];
    if (structure.title) {
        participants.push(structure.title.replace(/\s+/g, '').substring(0, 15));
        mermaid += `    participant ${participants[0]} as ${structure.title.substring(0, 20)}\n`;
    }
    
    structure.sections.slice(0, 5).forEach(section => {
        const id = section.heading.replace(/\s+/g, '').substring(0, 15);
        participants.push(id);
        mermaid += `    participant ${id} as ${section.heading.substring(0, 20)}\n`;
    });
    
    for (let i = 0; i < participants.length - 1; i++) {
        mermaid += `    ${participants[i]}->>${participants[i + 1]}: relates to\n`;
    }
    
    return mermaid;
}

// Render diagram
async function renderDiagram(mermaidSyntax) {
    if (!mermaidSyntax) {
        diagramContainer.innerHTML = '<div class="error">Could not generate diagram. Please try with more detailed text.</div>';
        return;
    }
    
    diagramContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Generating diagram...</p></div>';
    
    try {
        const id = 'diagram-' + Date.now();
        const { svg } = await mermaid.render(id, mermaidSyntax);
        diagramContainer.innerHTML = svg;
        setActiveRenderContext([], activeSourceText, activeApiKey);
        resetLearningPanel();
        
        // Store SVG for download
        diagramContainer.dataset.svg = svg;
        downloadBtn.style.display = 'block';
    } catch (error) {
        console.error('Mermaid rendering error:', error);
        diagramContainer.innerHTML = `<div class="error">Error generating diagram: ${error.message}. Try a different diagram type or simplify your text.</div>`;
        downloadBtn.style.display = 'none';
    }
}

function appendDiagramAnnotations(annotations) {
    if (!diagramContainer || !Array.isArray(annotations) || annotations.length === 0) return;
    const panel = document.createElement('div');
    panel.className = 'diagram-annotations';
    const listItems = annotations
        .map((a) => `<li>${a.replace(/[<>]/g, '')}</li>`)
        .join('');
    panel.innerHTML = `<h3>How to read this diagram</h3><ul>${listItems}</ul>`;
    diagramContainer.appendChild(panel);
}

async function openLearningForNode(node, anchorCard) {
    if (!node) return;

    resetLearningPanel();
    const panel = createLearningPanel();

    if (anchorCard && anchorCard.parentElement) {
        anchorCard.parentElement.insertBefore(panel, anchorCard.nextSibling);
    } else {
        diagramContainer.appendChild(panel);
    }

    const key = getOpenAIKey().trim();
    if (!key || !key.startsWith('sk-')) {
        if (learningTitle) learningTitle.textContent = `Concept Deep Dive: ${node.label}`;
        if (learningOverview) learningOverview.textContent = 'Add a valid OpenAI API key to generate overview + practice questions.';
        return;
    }

    activeLearningNode = node;
    activeLearningQuestions = [];
    if (learningTitle) learningTitle.textContent = `Concept Deep Dive: ${node.label}`;
    setLearningStatus('Building overview and quiz...');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const deepDive = await getChatGPTDeepDive(node, activeSourceText, key);
        if (!deepDive) {
            setLearningStatus('Could not build deep dive right now.');
            return;
        }
        activeLearningQuestions = deepDive.questions || [];
        if (learningOverview) learningOverview.textContent = deepDive.overview || (node.description || 'No overview available.');
        renderLearningQuiz(activeLearningQuestions);
        setLearningStatus(activeLearningQuestions.length ? 'Answer the questions, then click "Check Answers".' : 'Overview ready.');
    } catch (err) {
        console.error('Deep dive generation failed', err);
        setLearningStatus('Deep dive unavailable. Please try again.');
    }
}

if (diagramContainer) {
    diagramContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.photo-node');
        if (!card) return;
        const nodeId = card.getAttribute('data-id');
        if (!nodeId) return;
        const node = activeRenderedNodes.find((n) => String(n.id) === String(nodeId));
        if (!node) return;
        openLearningForNode(node, card);
    });
}

async function handleCheckQuiz() {
    if (!activeLearningNode || !activeLearningQuestions.length) {
        setLearningStatus('Select a diagram and load questions first.');
        return;
    }
    const key = getOpenAIKey().trim();
    if (!key || !key.startsWith('sk-')) {
        setLearningStatus('Valid API key required to check answers.');
        return;
    }
    const answers = activeLearningQuestions.map((_, idx) => {
        const el = learningQuiz ? learningQuiz.querySelector(`#quizAnswer${idx}`) : document.getElementById(`quizAnswer${idx}`);
        return el ? el.value.trim() : '';
    });
    setLearningStatus('Checking answers...');
    if (learningFeedback) learningFeedback.innerHTML = '';
    if (learningFollowup) learningFollowup.innerHTML = '';
    try {
        const result = await checkAnswersWithChatGPT(activeLearningNode, activeLearningQuestions, answers, key);
        if (!result) {
            setLearningStatus('Could not evaluate answers right now.');
            return;
        }
        const results = Array.isArray(result.results) ? result.results : [];
        const feedbackLines = results.map((r, idx) => {
            const mark = r.correct ? '✅' : '❌';
            const text = r.feedback ? String(r.feedback) : (r.correct ? 'Correct.' : 'Needs improvement.');
            return `${mark} Q${idx + 1}: ${text}`;
        });
        if (learningFeedback) {
            learningFeedback.textContent = `${result.summary || 'Review complete.'}\n\n${feedbackLines.join('\n')}`;
        }
        const incorrectCount = results.filter((r) => !r.correct).length;
        const mastery = String(result.mastery || '').toLowerCase();
        if (incorrectCount > 0 || mastery === 'needs_support' || mastery === 'mixed') {
            setLearningStatus('Generating simpler follow-up visuals...');
            const prompts = await getSimplifiedPrompts(activeLearningNode, activeSourceText, key);
            const bioMode = isBiologySourceText(activeSourceText);
            const urls = [];
            for (const prompt of prompts) {
                const generated = await generateDrawingVariations(
                    `${prompt}. 7th-grade level (13-year-old understanding). Simpler than previous diagram. Use one key idea only.`,
                    key,
                    1,
                    { biologyMode: bioMode }
                );
                if (generated[0]) urls.push(generated[0]);
            }
            if (learningFollowup) {
                if (urls.length > 0) {
                    learningFollowup.innerHTML = `
                        <h4>Simplified follow-up visuals</h4>
                        <div class="followup-images">${urls.map((u) => `<img src="${u}" alt="Simplified concept visual" loading="lazy" />`).join('')}</div>
                    `;
                } else {
                    learningFollowup.innerHTML = '<h4>Simplified follow-up visuals</h4><p>No follow-up visuals available right now.</p>';
                }
            }
            setLearningStatus('Review follow-up visuals and retry questions.');
        } else {
            setLearningStatus('Great work — strong understanding.');
        }
    } catch (err) {
        console.error('Quiz checking failed', err);
        setLearningStatus('Could not check answers right now.');
    }
}

// Event listeners
generateBtn.addEventListener('click', async () => {
    showDiagnostics('');
    const text = textInput.value.trim();
    if (!text) {
        alert('Please enter some text to generate a diagram.');
        return;
    }

    const structure = parseTextWithHeadings(text);
    const openaiKey = getOpenAIKey();
    await renderPhotoDiagram(structure, openaiKey, text);
});

clearBtn.addEventListener('click', () => {
    textInput.value = '';
    diagramContainer.innerHTML = '<div class="placeholder"><p>Enter text above and click "Generate Visual" to create a visual representation</p></div>';
    downloadBtn.style.display = 'none';
    downloadPngBtn.style.display = 'none';
    setActiveRenderContext([], '', '');
    resetLearningPanel();
});

downloadBtn.addEventListener('click', () => {
    const svg = diagramContainer.dataset.svg;
    if (!svg) return;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram-' + Date.now() + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

downloadPngBtn.addEventListener('click', () => {
    const el = document.getElementById('photoDiagramRoot') || diagramContainer.querySelector('.photo-diagram');
    if (!el || typeof html2canvas === 'undefined') return;
    html2canvas(el, { useCORS: true, scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'diagram-' + Date.now() + '.png';
        a.click();
    });
});

// Allow Enter+Ctrl/Cmd to generate
textInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        generateBtn.click();
    }
});

function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = `${before}${text}${after}`;
    const nextPos = start + text.length;
    textarea.selectionStart = nextPos;
    textarea.selectionEnd = nextPos;
}

function toNumber(value) {
    if (!value) return 0;
    const m = String(value).match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : 0;
}

function convertHtmlToStructuredText(html, plainFallback) {
    if (!html) return plainFallback || '';
    // If plain text already contains clear indentation, keep it exactly as pasted.
    if (plainFallback) {
        const plainLines = plainFallback.split('\n');
        const plainLooksOutlined = plainLines.length >= 4 && plainLines.some((l) => /^\t+/.test(l) || /^ {2,}\S/.test(l));
        if (plainLooksOutlined) return plainFallback;
    }
    const root = document.createElement('div');
    root.innerHTML = html;
    const lines = [];
    const seen = new Set();

    const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const normalizeContentOnly = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const TAB = '\t';

    const getStyleStats = (el) => {
        const styleTargets = [el, ...el.querySelectorAll('span,strong,b,font')];
        let maxFontSize = 0;
        let hasBold = false;
        styleTargets.forEach((node) => {
            const inlineStyle = node.getAttribute?.('style') || '';
            const fontSize = toNumber(inlineStyle.match(/font-size:\s*([^;]+)/i)?.[1]);
            const fontWeightRaw = inlineStyle.match(/font-weight:\s*([^;]+)/i)?.[1] || '';
            const fontWeight = fontWeightRaw.toLowerCase() === 'bold' ? 700 : toNumber(fontWeightRaw);
            if (fontSize > maxFontSize) maxFontSize = fontSize;
            if (fontWeight >= 600 || node.tagName?.toLowerCase() === 'strong' || node.tagName?.toLowerCase() === 'b') {
                hasBold = true;
            }
        });
        return { maxFontSize, hasBold };
    };

    const getTextWithoutNestedLists = (el) => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('ul,ol').forEach((list) => list.remove());
        return normalize(clone.textContent || '');
    };

    const getIndentLevelFromStyle = (el) => {
        const style = el.getAttribute?.('style') || '';
        const marginLeft = toNumber(style.match(/margin-left:\s*([^;]+)/i)?.[1]);
        const paddingLeft = toNumber(style.match(/padding-left:\s*([^;]+)/i)?.[1]);
        const textIndent = toNumber(style.match(/text-indent:\s*([^;]+)/i)?.[1]);
        const px = Math.max(marginLeft, paddingLeft, textIndent);
        if (!px) return 0;
        return Math.max(0, Math.floor(px / 20));
    };

    const getHeadingLevel = (el, text) => {
        const tag = el.tagName.toLowerCase();
        if (tag.startsWith('h')) return Math.min(4, Math.max(1, Number(tag[1]) || 1));
        const { maxFontSize, hasBold } = getStyleStats(el);
        const shortLine = text.length <= 120;
        if (!shortLine) return 0;
        if (maxFontSize >= 26) return 1;
        if (maxFontSize >= 22) return 2;
        if (maxFontSize >= 18) return 3;
        if (hasBold && text.length <= 90) return 3;
        return 0;
    };

    const pushLine = (line) => {
        const cleaned = String(line || '').replace(/[ \t]+$/g, '');
        if (!cleaned) return;
        const leadingTabs = (cleaned.match(/^\t+/) || [''])[0].length;
        const key = `${leadingTabs}:${normalizeContentOnly(cleaned).toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        lines.push(cleaned);
    };

    const walk = (node, listDepth = 0) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const el = node;
        const tag = el.tagName.toLowerCase();

        if (tag === 'ul' || tag === 'ol') {
            [...el.children].forEach((child) => walk(child, listDepth + 1));
            return;
        }

        if (tag === 'li') {
            const text = getTextWithoutNestedLists(el);
            const styleIndent = getIndentLevelFromStyle(el);
            const indent = TAB.repeat(Math.max(0, listDepth - 1 + styleIndent));
            pushLine(`${indent}- ${text}`);
            [...el.children].forEach((child) => {
                const childTag = child.tagName?.toLowerCase();
                if (childTag === 'ul' || childTag === 'ol') walk(child, listDepth + 1);
            });
            return;
        }

        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'].includes(tag)) {
            const text = getTextWithoutNestedLists(el);
            if (text) {
                const level = getHeadingLevel(el, text);
                if (level > 0) {
                    pushLine(`${'#'.repeat(level)} ${text}`);
                    lines.push('');
                } else {
                    const styleIndent = getIndentLevelFromStyle(el);
                    const indent = TAB.repeat(Math.max(0, styleIndent));
                    pushLine(`${indent}${text}`);
                }
            }
            [...el.children].forEach((child) => {
                const childTag = child.tagName?.toLowerCase();
                if (childTag === 'ul' || childTag === 'ol') walk(child, listDepth + 1);
            });
            return;
        }

        [...el.children].forEach((child) => walk(child, listDepth));
    };

    [...root.childNodes].forEach((node) => walk(node, 0));

    const output = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return output || plainFallback || normalize(root.textContent || '');
}

// Preserve structure when pasting (including Google Docs headings -> markdown headings)
textInput.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html') || '';
    const plain = e.clipboardData?.getData('text/plain') || '';
    if (!html) return; // Let default plain paste continue when no HTML payload exists.

    e.preventDefault();
    const structured = convertHtmlToStructuredText(html, plain);
    insertTextAtCursor(textInput, structured);
});
