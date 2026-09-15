'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateLecture,
  quoteInLecture,
  validateGenerated,
  extractJsonText
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
