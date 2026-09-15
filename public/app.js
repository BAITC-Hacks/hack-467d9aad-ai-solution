'use strict';

const lecture = document.querySelector('#lecture');
const counter = document.querySelector('#counter');
const generateBtn = document.querySelector('#generateBtn');
const sampleBtn = document.querySelector('#sampleBtn');
const againBtn = document.querySelector('#againBtn');
const errorBox = document.querySelector('#error');
const loading = document.querySelector('#loading');
const results = document.querySelector('#results');
const verified = document.querySelector('#verified');

const SAMPLE = `Искусственные нейронные сети — это вычислительные модели, состоящие из связанных между собой искусственных нейронов. Каждый нейрон получает входные значения, умножает их на веса, суммирует и применяет функцию активации. Веса определяют силу связей между нейронами.\n\nОбучение нейронной сети заключается в подборе весов так, чтобы уменьшить ошибку между предсказанием модели и правильным ответом. Один из распространённых методов обучения — обратное распространение ошибки. Оно вычисляет, как изменение каждого веса влияет на итоговую ошибку, после чего оптимизатор корректирует веса.\n\nДанные обычно разделяют на обучающую, валидационную и тестовую выборки. Обучающая выборка используется для изменения параметров модели. Валидационная помогает выбирать настройки и отслеживать переобучение. Тестовая выборка нужна для финальной оценки на данных, которые модель не использовала при обучении.\n\nПереобучение возникает, когда модель хорошо запоминает обучающие примеры, но хуже работает на новых данных. Для борьбы с переобучением применяют больше данных, регуляризацию, раннюю остановку и другие методы. Качество модели следует оценивать на данных, не участвовавших в настройке её параметров.`;

function setError(message = '') {
  errorBox.textContent = message;
  errorBox.classList.toggle('hidden', !message);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function evidence(text) {
  const details = element('details', 'evidence');
  details.append(element('summary', '', 'Источник в лекции'));
  details.append(element('blockquote', '', text));
  return details;
}

function render(data) {
  const notes = document.querySelector('#notes');
  const points = document.querySelector('#points');
  const quiz = document.querySelector('#quiz');
  const cards = document.querySelector('#cards');
  [notes, points, quiz, cards].forEach(node => node.replaceChildren());

  data.notes.forEach(item => {
    const card = element('article', 'content-card');
    card.append(element('h3', '', item.title), element('p', '', item.text));
    notes.append(card);
  });

  data.key_points.forEach((item, index) => {
    const card = element('article', 'content-card point-card');
    card.append(element('span', 'number', String(index + 1).padStart(2, '0')));
    const body = element('div');
    body.append(element('p', 'lead', item.text), evidence(item.source_quote));
    card.append(body); points.append(card);
  });

  data.quiz.forEach((item, index) => {
    const card = element('article', 'content-card quiz-card');
    card.append(element('span', 'number', `Q${index + 1}`), element('h3', '', item.question));
    const answer = element('details', 'answer');
    answer.append(element('summary', '', 'Показать правильный ответ'), element('p', '', item.answer));
    card.append(answer, evidence(item.source_quote)); quiz.append(card);
  });

  data.flashcards.forEach(item => {
    const card = element('article', 'flashcard');
    card.append(element('span', 'eyebrow', 'Вопрос / термин'), element('h3', '', item.front));
    const answer = element('details', 'answer');
    answer.append(element('summary', '', 'Открыть карточку'), element('p', '', item.back));
    card.append(answer, evidence(item.source_quote)); cards.append(card);
  });

  verified.textContent = `Проверено по лекции: ${data.meta.verifiedEvidenceCount} цитат-оснований` +
    (data.meta.removedUnsupportedEvidenceCount ? ` · отклонено неподтверждённых: ${data.meta.removedUnsupportedEvidenceCount}` : '');
  results.classList.remove('hidden');
}

async function generate() {
  setError();
  generateBtn.disabled = true;
  loading.classList.remove('hidden');
  results.classList.add('hidden');
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lecture: lecture.value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось обработать лекцию.');
    render(data);
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setError(error.message || 'Не удалось обработать лекцию.');
  } finally {
    loading.classList.add('hidden');
    generateBtn.disabled = false;
  }
}

lecture.addEventListener('input', () => { counter.textContent = `${lecture.value.length.toLocaleString('ru-RU')} символов`; });
sampleBtn.addEventListener('click', () => { lecture.value = SAMPLE; lecture.dispatchEvent(new Event('input')); lecture.focus(); });
generateBtn.addEventListener('click', generate);
againBtn.addEventListener('click', () => { results.classList.add('hidden'); lecture.focus(); lecture.scrollIntoView({ behavior: 'smooth' }); });

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== button.dataset.tab));
}));
