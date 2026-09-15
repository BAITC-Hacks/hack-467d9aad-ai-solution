'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateLecture,
  quoteInLecture,
  validateGenerated,
  extractJsonText,
  buildLocalFallback,
  splitLectureSentences,
  normalizeText
} = require('../lib');

const lecture = (`Нейрон получает входные значения и применяет функцию активации. ` +
  `Обучение сети заключается в подборе весов для уменьшения ошибки. ` +
  `Тестовая выборка используется для финальной оценки модели на новых данных. `).repeat(3);

test('validateLecture rejects short input', () => {
  assert.throws(() => validateLecture('слишком коротко'), /минимум/);
});

test('quoteInLecture normalizes spaces and case', () => {
  assert.equal(quoteInLecture('ТЕСТОВАЯ   выборка используется для финальной оценки модели', lecture), true);
  assert.equal(quoteInLecture('Этого факта в лекции нет вообще', lecture), false);
});

test('validateGenerated filters unsupported evidence and preserves four outputs', () => {
  const raw = {
    notes: [{ title: 'Суть', text: 'Лекция объясняет базовые элементы обучения сети.' }],
    key_points: [
      { text: 'Есть функция активации', source_quote: 'Нейрон получает входные значения и применяет функцию активации.' },
      { text: 'Веса подбираются при обучении', source_quote: 'Обучение сети заключается в подборе весов для уменьшения ошибки.' },
      { text: 'Выдумка', source_quote: 'Такой цитаты в лекции нет и быть не может.' }
    ],
    quiz: [
      { question: 'Для чего нужна тестовая выборка?', answer: 'Для финальной оценки.', source_quote: 'Тестовая выборка используется для финальной оценки модели на новых данных.' },
      { question: 'Что делает нейрон?', answer: 'Применяет функцию активации.', source_quote: 'Нейрон получает входные значения и применяет функцию активации.' }
    ],
    flashcards: [
      { front: 'Обучение', back: 'Подбор весов.', source_quote: 'Обучение сети заключается в подборе весов для уменьшения ошибки.' },
      { front: 'Тестовая выборка', back: 'Финальная оценка.', source_quote: 'Тестовая выборка используется для финальной оценки модели на новых данных.' }
    ]
  };
  const out = validateGenerated(raw, lecture);
  assert.equal(out.key_points.length, 2);
  assert.equal(out.meta.removedUnsupportedEvidenceCount, 1);
  assert.ok(out.meta.verifiedEvidenceCount >= 6);
});

test('extractJsonText accepts fenced JSON', () => {
  assert.deepEqual(extractJsonText('```json\n{"ok":true}\n```'), { ok: true });
});


test('local fallback produces a grounded stable four-part shape', () => {
  const raw = buildLocalFallback(lecture);
  assert.deepEqual(raw, buildLocalFallback(lecture));
  assert.equal(raw.notes.length, 3);
  assert.equal(raw.key_points.length, 5);
  assert.equal(raw.quiz.length, 5);
  assert.equal(raw.flashcards.length, 6);
  const out = validateGenerated(raw, lecture);
  assert.equal(out.meta.removedUnsupportedEvidenceCount, 0);
  assert.equal(out.key_points.length, 5);
  assert.equal(out.quiz.length, 5);
  assert.equal(out.flashcards.length, 6);
  for (const item of [...out.key_points, ...out.quiz, ...out.flashcards]) {
    assert.equal(quoteInLecture(item.source_quote, lecture), true);
    assert.equal(lecture.includes(item.source_quote), true);
  }
});

test('local fallback keeps evidence valid for one very long sentence', () => {
  const longLecture = `${'детерминированный фрагмент '.repeat(30)}завершен.`;
  const out = validateGenerated(buildLocalFallback(longLecture), longLecture);

  assert.equal(out.meta.verifiedEvidenceCount, 16);
  assert.ok([...out.key_points, ...out.quiz, ...out.flashcards]
    .every(item => item.source_quote.length <= 500 && longLecture.includes(item.source_quote)));
});


test('sentence splitting preserves text around punctuation without whitespace', () => {
  const text = (`Первый важный факт.Следующий важный факт продолжается без пробела. ` +
    `Третий содержательный фрагмент завершает проверку. `).repeat(3);
  const parts = splitLectureSentences(text);
  assert.match(parts.join(' '), /Первый важный факт\.Следующий важный факт/u);
  assert.equal(normalizeText(parts.join(' ')), normalizeText(text));
});


test('local fallback caps Unicode-expanded quotes by normalized length', () => {
  const text = `${'İ'.repeat(600)}.`;
  const raw = buildLocalFallback(text);
  const out = validateGenerated(raw, text);
  assert.equal(out.meta.removedUnsupportedEvidenceCount, 0);
  assert.equal(out.key_points.length, 5);
  for (const item of [...out.key_points, ...out.quiz, ...out.flashcards]) {
    assert.ok(normalizeText(item.source_quote).length <= 500);
    assert.equal(quoteInLecture(item.source_quote, text), true);
  }
});
