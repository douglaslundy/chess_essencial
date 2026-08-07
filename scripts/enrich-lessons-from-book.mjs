// Enriches lesson teaching text with the real book content, chapter by chapter,
// keeping the existing lesson structure (ids, slug, sourcePages, exercise links)
// and preserving only board-backed interactive steps.
//
// Usage: node scripts/enrich-lessons-from-book.mjs <book.txt> <lessons.json> <out.json>
// The book text must be a raw (non-layout) UTF-8 pdftotext extraction.

import { readFileSync, writeFileSync } from 'node:fs';

const [bookPath, lessonsPath, outPath] = process.argv.slice(2);
if (!bookPath || !lessonsPath || !outPath) {
  console.error('usage: enrich-lessons-from-book.mjs <book.txt> <lessons.json> <out.json>');
  process.exit(1);
}

const EXERCISE_TAGS = [
  'Reflexão',
  'Fundamental',
  'Aplicação',
  'Regra',
  'Avaliação',
  'Abertura',
  'Tática',
  'Final',
  'Partida',
  'Cumulativo',
  'Compreensão',
  'Diagnóstico',
  'Estratégia',
  'Método',
  'Teste',
  'Síntese',
  'Memória',
  'Plano',
  'Estrutura',
  'Peças',
  'Transição',
  'Cálculo',
  'Defesa',
];
const tagRe = new RegExp(`\\[(?:${EXERCISE_TAGS.join('|')})\\]`);

function isNoise(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^XADREZ ESSENCIAL \| VOLUME/i.test(t)) return true;
  if (/^Autor:\s*Douglas Lundy/i.test(t)) return true;
  if (/^•\s*\d+\s*•$/.test(t)) return true; // page number marker
  if (/^Diagrama\s+\d+/i.test(t)) return true;
  return false;
}

// A heading is a short, non-terminal line that introduces a block.
function isHeading(line) {
  const t = line.trim();
  if (t.length === 0 || t.length > 48) return false;
  if (/[.:;]$/.test(t)) return false;
  if (/^[a-z0-9]/.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (/^•/.test(t)) return false;
  // Reject lines that look like sentences (contain lowercase-heavy long words + spaces > 6)
  return t.split(/\s+/).length <= 6;
}

function slugify(text, fallback) {
  const s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

// Parse the book into a map "volume:chapter" -> { title, blocks: [{heading, text}] }
function parseBook(text) {
  const lines = text.split('\n');
  const chapters = new Map();
  let volume = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const volMatch = line.match(/Curso Geral de Fundamentos\s*-\s*Volume\s+(\d+)/i);
    if (volMatch) {
      volume = Number(volMatch[1]);
      i += 1;
      continue;
    }
    const chapMatch = line.match(/^CAPÍTULO\s+(\d+)$/);
    if (chapMatch && volume > 0) {
      const chapter = Number(chapMatch[1]);
      // Title = next non-empty line.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      const title = (lines[j] ?? '').trim();
      // Body until next CAPÍTULO or next volume marker.
      const body = [];
      let k = j + 1;
      while (k < lines.length) {
        const l = lines[k].trim();
        if (/^CAPÍTULO\s+\d+$/.test(l)) break;
        if (/Curso Geral de Fundamentos\s*-\s*Volume\s+\d+/i.test(l)) break;
        if (/^Sumário do Volume/i.test(l)) break;
        body.push(lines[k]);
        k += 1;
      }
      chapters.set(`${volume}:${chapter}`, { title, blocks: extractBlocks(body) });
      i = k;
      continue;
    }
    i += 1;
  }
  return chapters;
}

function extractBlocks(bodyLines) {
  // Drop the "Objetivos de aprendizagem" bullet list: skip from that heading to
  // the first real paragraph (long line). The objective already lives in the
  // lesson's own objective step.
  let start = 0;
  const objIndex = bodyLines.findIndex((l) => /^\s*Objetivos de aprendizagem\s*$/i.test(l));
  if (objIndex >= 0) {
    let p = objIndex + 1;
    while (p < bodyLines.length && bodyLines[p].trim().length <= 80) p += 1;
    start = p;
  }
  const kept = bodyLines.slice(start).filter((l) => !isNoise(l));
  // Cut the exercises: everything from the numbered list that precedes the first
  // bracketed difficulty tag.
  let joined = kept.join('\n');
  const tagMatch = joined.match(tagRe);
  if (tagMatch) {
    const before = joined.slice(0, tagMatch.index);
    const cut = before.search(/(?:^|\n|\s)\d+\.\s+[A-ZÀ-Ú][^\n]*$/m);
    // Fallback: cut at the last "\n<number>. " before the tag.
    const lastNum = before.lastIndexOf('\n');
    joined =
      cut >= 0 ? before.slice(0, cut) : before.slice(0, lastNum >= 0 ? lastNum : before.length);
    // Also strip any trailing "  N. ..." fragment on the last line.
    joined = joined.replace(/\s+\d+\.\s+[A-ZÀ-Ú][^\n]*$/g, '');
  }
  const lines = joined.split('\n');

  const blocks = [];
  let current = { heading: null, parts: [] };
  const flush = () => {
    const textVal = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (textVal.length >= 40) blocks.push({ heading: current.heading, text: textVal });
    current = { heading: null, parts: [] };
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (isHeading(raw)) {
      flush();
      current.heading = t;
    } else {
      current.parts.push(t);
    }
  }
  flush();
  return blocks;
}

function baseStep(overrides) {
  return {
    bodyMd: '',
    expectedActions: [],
    feedback: {},
    nextStepRules: [],
    stepKey: 'step',
    stepType: 'explanation',
    title: null,
    ...overrides,
  };
}

const MAX_STEPS = 10;

function enrichLesson(entry, chapter) {
  const lesson = entry.lesson;
  const steps = lesson.steps;
  if (!chapter || chapter.blocks.length === 0) return; // e.g. cumulative tests: leave as-is

  const objetivo = steps.find((s) => s.stepType === 'text') ?? steps[0];
  const practice = steps.filter(
    (step) =>
      step.initialFen && ['board_instruction', 'quiz', 'checkpoint'].includes(step.stepType),
  );
  const summary = steps.find((s) => s.stepType === 'summary') ?? steps[steps.length - 1];

  const roomForBook = MAX_STEPS - 1 /* objetivo */ - practice.length - 1; /* summary */
  if (roomForBook < 1) return; // no room; keep original

  const usedKeys = new Set(['objetivo', 'resumo']);
  let blocks = chapter.blocks;
  if (blocks.length > roomForBook) {
    // Merge the overflow tail into the last kept block so nothing is lost.
    const head = blocks.slice(0, roomForBook - 1);
    const tail = blocks.slice(roomForBook - 1);
    const mergedText = tail.map((b) => (b.heading ? `${b.heading}. ${b.text}` : b.text)).join(' ');
    head.push({ heading: tail[0].heading ?? 'Aprofundamento', text: mergedText });
    blocks = head;
  }

  const bookSteps = blocks.map((b, index) => {
    let key = slugify(b.heading ?? 'conceito', `licao-${index + 1}`);
    while (usedKeys.has(key)) key = `${key}-${index + 1}`;
    usedKeys.add(key);
    return baseStep({
      bodyMd: b.text,
      stepKey: key,
      stepType: 'explanation',
      // title is optional but must be a string (never null) for the importer.
      title: b.heading ?? 'Conceito central',
    });
  });

  lesson.steps = [
    { ...objetivo, stepKey: 'objetivo', stepType: 'text' },
    ...bookSteps,
    ...practice,
    { ...summary, stepKey: 'resumo', stepType: 'summary' },
  ].slice(0, MAX_STEPS);
}

const book = parseBook(readFileSync(bookPath, 'utf8'));
const dataset = JSON.parse(readFileSync(lessonsPath, 'utf8'));

let enriched = 0;
let skipped = 0;
for (const entry of dataset.lessons) {
  const key = `${entry.lesson.module}:${entry.chapter}`;
  const chapter = book.get(key);
  const before = entry.lesson.steps.length;
  enrichLesson(entry, chapter);
  if (entry.lesson.steps.length !== before || (chapter && chapter.blocks.length)) enriched += 1;
  else skipped += 1;
}

// Recompute statistics so the content validator stays consistent.
const linkedExercises = new Set();
for (const entry of dataset.lessons) {
  for (const n of entry.exerciseNumbers ?? []) linkedExercises.add(n);
}
dataset.statistics = {
  boardLessons: dataset.lessons.filter((item) =>
    item.lesson.steps.some((step) => step.stepType === 'board_instruction'),
  ).length,
  exerciseLinks: linkedExercises.size,
  lessonCount: dataset.lessons.length,
  moduleCount: new Set(dataset.lessons.map((item) => item.lesson.module)).size,
  stepCount: dataset.lessons.reduce((total, item) => total + item.lesson.steps.length, 0),
};

writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
process.stderr.write(
  `enriched=${enriched} skipped=${skipped} stepCount=${dataset.statistics.stepCount} out=${outPath}\n`,
);
