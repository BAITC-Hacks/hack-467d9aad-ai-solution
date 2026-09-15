'use strict';

const MIN_LECTURE_CHARS = 200;
const MAX_LECTURE_CHARS = 50000;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function validateLecture(value) {
  if (typeof value !== 'string') throw new Error('Текст лекции должен быть строкой.');
  const text = value.trim();
  if (text.length < MIN_LECTURE_CHARS) {
    throw new Error(`Добавьте более полный текст лекции — минимум ${MIN_LECTURE_CHARS} символов.`);
  }
  if (text.length > MAX_LECTURE_CHARS) {
    throw new Error(`Лекция слишком длинная — максимум ${MAX_LECTURE_CHARS} символов.`);
  }
  return text;
}

function quoteInLecture(quote, lecture) {
  const q = normalizeText(quote);
  const l = normalizeText(lecture);
  return q.length >= 12 && q.length <= 500 && l.includes(q);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Некорректное поле: ${label}.`);
  return value.trim();
}

function validateGenerated(raw, lecture) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Модель вернула некорректный JSON.');
  const notesRaw = Array.isArray(raw.notes) ? raw.notes : [];
  const pointsRaw = Array.isArray(raw.key_points) ? raw.key_points : [];
  const quizRaw = Array.isArray(raw.quiz) ? raw.quiz : [];
  const cardsRaw = Array.isArray(raw.flashcards) ? raw.flashcards : [];

  const notes = notesRaw.slice(0, 6).map((item, index) => ({
    title: requireString(item?.title, `notes[${index}].title`),
    text: requireString(item?.text, `notes[${index}].text`)
  }));

  let removedUnsupportedEvidenceCount = 0;
  const grounded = (items, mapper) => items.flatMap((item, index) => {
    try {
      const quote = requireString(item?.source_quote, `source_quote[${index}]`);
      if (!quoteInLecture(quote, lecture)) {
        removedUnsupportedEvidenceCount += 1;
        return [];
      }
      return [mapper(item, quote, index)];
    } catch {
      removedUnsupportedEvidenceCount += 1;
      return [];
    }
  });

  const key_points = grounded(pointsRaw.slice(0, 10), (item, source_quote, index) => ({
    text: requireString(item?.text, `key_points[${index}].text`), source_quote
  }));
  const quiz = grounded(quizRaw.slice(0, 10), (item, source_quote, index) => ({
    question: requireString(item?.question, `quiz[${index}].question`),
    answer: requireString(item?.answer, `quiz[${index}].answer`),
    source_quote
  }));
  const flashcards = grounded(cardsRaw.slice(0, 12), (item, source_quote, index) => ({
    front: requireString(item?.front, `flashcards[${index}].front`),
    back: requireString(item?.back, `flashcards[${index}].back`),
    source_quote
  }));

  if (notes.length < 1 || key_points.length < 2 || quiz.length < 2 || flashcards.length < 2) {
    throw new Error('Ответ модели не прошёл проверку достоверности. Попробуйте обработать лекцию ещё раз.');
  }

  return {
    notes,
    key_points,
    quiz,
    flashcards,
    meta: {
      verifiedEvidenceCount: key_points.length + quiz.length + flashcards.length,
      removedUnsupportedEvidenceCount
    }
  };
}

function extractJsonText(text) {
  const cleaned = String(text ?? '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

module.exports = {
  MIN_LECTURE_CHARS,
  MAX_LECTURE_CHARS,
  normalizeText,
  validateLecture,
  quoteInLecture,
  validateGenerated,
  extractJsonText
};
