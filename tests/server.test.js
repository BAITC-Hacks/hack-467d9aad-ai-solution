'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { server, hasOpenAIConfig } = require('../server');

const lecture = (`Нейрон получает входные значения и применяет функцию активации. ` +
  `Обучение сети заключается в подборе весов для уменьшения ошибки. ` +
  `Тестовая выборка используется для финальной оценки модели на новых данных. `).repeat(3);

test('OpenAI mode requires both environment values', () => {
  assert.equal(hasOpenAIConfig({}), false);
  assert.equal(hasOpenAIConfig({ OPENAI_API_KEY: 'key' }), false);
  assert.equal(hasOpenAIConfig({ OPENAI_MODEL: 'model' }), false);
  assert.equal(hasOpenAIConfig({ OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model' }), true);
});

test('POST /api/generate returns the local fallback without OpenAI configuration', async t => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  const request = Readable.from([Buffer.from(JSON.stringify({ lecture }))]);
  request.method = 'POST';
  request.url = '/api/generate';
  request.headers = { host: 'localhost' };
  let status;
  let responseBody = '';
  const response = {
    writeHead(value) { status = value; },
    end(value = '') { responseBody += value; }
  };
  const requestListener = server.listeners('request')[0];
  await requestListener(request, response);
  const body = JSON.parse(responseBody);

  assert.equal(status, 200);
  assert.equal(body.meta.mode, 'local-fallback');
  assert.equal(body.notes.length, 3);
  assert.equal(body.key_points.length, 5);
  assert.equal(body.quiz.length, 5);
  assert.equal(body.flashcards.length, 6);
  assert.ok([...body.key_points, ...body.quiz, ...body.flashcards]
    .every(item => lecture.includes(item.source_quote)));
});


test('configured OpenAI failure falls back locally instead of returning 502', async t => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  global.fetch = async () => { throw new Error('simulated network failure'); };

  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
    global.fetch = originalFetch;
  });

  const request = Readable.from([Buffer.from(JSON.stringify({ lecture }))]);
  request.method = 'POST';
  request.url = '/api/generate';
  request.headers = { host: 'localhost' };
  let status;
  let responseBody = '';
  const response = {
    writeHead(value) { status = value; },
    end(value = '') { responseBody += value; }
  };
  const requestListener = server.listeners('request')[0];
  await requestListener(request, response);
  const body = JSON.parse(responseBody);

  assert.equal(status, 200);
  assert.equal(body.meta.mode, 'local-fallback');
  assert.equal(body.key_points.length, 5);
});


test('invalid OpenAI output falls back locally instead of returning 502', async t => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { output_text: JSON.stringify({ notes: [], key_points: [], quiz: [], flashcards: [] }) };
    }
  });

  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
    global.fetch = originalFetch;
  });

  const request = Readable.from([Buffer.from(JSON.stringify({ lecture }))]);
  request.method = 'POST';
  request.url = '/api/generate';
  request.headers = { host: 'localhost' };
  let status;
  let responseBody = '';
  const response = {
    writeHead(value) { status = value; },
    end(value = '') { responseBody += value; }
  };
  await server.listeners('request')[0](request, response);
  const body = JSON.parse(responseBody);

  assert.equal(status, 200);
  assert.equal(body.meta.mode, 'local-fallback');
  assert.equal(body.meta.removedUnsupportedEvidenceCount, 0);
});
