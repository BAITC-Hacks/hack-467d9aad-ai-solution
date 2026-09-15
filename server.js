'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  validateLecture,
  validateGenerated,
  extractJsonText
} = require('./lib');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const MAX_BODY_BYTES = 300_000;

const SYSTEM_PROMPT = `You are a study-material generator. Use ONLY facts explicitly present in the supplied lecture. Never add outside facts. If a claim cannot be supported by the lecture, omit it. Answer in the same language as the lecture. Return ONLY valid JSON with exactly this shape:
{
  "notes": [{"title":"...","text":"..."}],
  "key_points": [{"text":"...","source_quote":"verbatim quote from lecture"}],
  "quiz": [{"question":"...","answer":"...","source_quote":"verbatim quote from lecture"}],
  "flashcards": [{"front":"...","back":"...","source_quote":"verbatim quote from lecture"}]
}
Create 3-5 notes, 5-7 key points, 5 quiz items with explicit correct answers, and 6-8 flashcards. Every source_quote must be copied verbatim from the lecture and should be short but sufficient evidence.`;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.output_text === 'string') parts.push(content.output_text);
    }
  }
  return parts.join('\n').trim();
}

async function callOpenAI(lecture) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new Error('OPENAI_API_KEY не настроен на сервере.');
  if (!model) throw new Error('OPENAI_MODEL не настроен на сервере.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `LECTURE:\n${lecture}` }
      ]
    }),
    signal: AbortSignal.timeout(60_000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API вернул HTTP ${response.status}.`;
    throw new Error(message);
  }
  const text = extractResponseText(data);
  if (!text) throw new Error('Модель вернула пустой ответ.');
  return extractJsonText(text);
}

async function handleGenerate(req, res) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return json(res, 413, { error: 'Запрос слишком большой.' });
    chunks.push(chunk);
  }

  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const lecture = validateLecture(payload.lecture);
    const raw = await callOpenAI(lecture);
    const result = validateGenerated(raw, lecture);
    return json(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка.';
    const clientError = /минимум|максимум|строкой|слишком большой/i.test(message);
    return json(res, clientError ? 400 : 502, { error: message });
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res) {
  const rawPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const rel = rawPath === '/' ? 'index.html' : decodeURIComponent(rawPath).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') return handleGenerate(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyForge listening on http://localhost:${PORT}`);
  });
}

module.exports = { server, extractResponseText };
