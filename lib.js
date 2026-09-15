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


function splitLectureSentences(lecture) {
  const text = String(lecture);
  const raw = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    const boundary = '.!?…'.includes(char) && (next === undefined || /\s/u.test(next));
    if (!boundary) continue;
    const part = text.slice(start, index + 1).trim();
    if (part) raw.push(part);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) raw.push(tail);

  const sentences = [];
  let buffer = '';
  for (const part of raw) {
    buffer = buffer ? `${buffer} ${part}` : part;
    if (normalizeText(buffer).length >= 24) {
      sentences.push(buffer);
      buffer = '';
    }
  }
  if (buffer) {
    if (sentences.length) sentences[sentences.length - 1] += ` ${buffer}`;
    else sentences.push(buffer);
  }
  const cleaned = sentences.filter(value => normalizeText(value).length >= 12);
  if (cleaned.length) return cleaned;
  const fallback = text.trim();
  return fallback ? [fallback] : [];
}

function sourceQuote(sentence) {
  const text = String(sentence).trim();
  if (normalizeText(text).length <= 500) return text;

  let low = 1;
  let high = Math.min(text.length, 500);
  let best = '';
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = text.slice(0, middle).trimEnd();
    if (normalizeText(candidate).length <= 500) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function buildLocalFallback(lecture) {
  const text = validateLecture(lecture);
  const sentences = splitLectureSentences(text);
  if (!sentences.length) throw new Error('Не удалось выделить содержательные фрагменты лекции.');
  const ranked = sentences
    .map((sentence, index) => ({
      sentence: sourceQuote(sentence),
      index,
      score: Math.min(sentence.length, 240) + (sentences.length - index)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.sentence);
  const pick = index => ranked[index % ranked.length];

  const notes = Array.from({ length: 3 }, (_, index) => ({
    title: `Ключевой блок ${index + 1}`,
    text: pick(index)
  }));
  const key_points = Array.from({ length: 5 }, (_, index) => {
    const source_quote = pick(index);
    return { text: source_quote, source_quote };
  });
  const quiz = Array.from({ length: 5 }, (_, index) => {
    const source_quote = pick(index + 1);
    return {
      question: `Что утверждается в ключевом фрагменте ${index + 1}?`,
      answer: source_quote,
      source_quote
    };
  });
  const flashcards = Array.from({ length: 6 }, (_, index) => {
    const source_quote = pick(index + 2);
    return {
      front: `Ключевой фрагмент ${index + 1}`,
      back: source_quote,
      source_quote
    };
  });

  return { notes, key_points, quiz, flashcards };
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
  extractJsonText,
  splitLectureSentences,
  buildLocalFallback
};
