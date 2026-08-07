import fs from 'node:fs';
import crypto from 'node:crypto';
import { Chess } from '../packages/chess-domain/node_modules/chess.js/dist/esm/chess.js';

const defaultPath = 'database/content/Xadrez_Essencial_Aulas_1_a_119.json';
const inputPath = process.argv[2] ?? defaultPath;
const dataset = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const exercises = JSON.parse(
  fs.readFileSync('database/content/Xadrez_Essencial_Exercicios_1_a_1298.json', 'utf8'),
);
const errors = [];
const slugs = new Set();
const linkedExercises = new Set();
const moduleCounts = new Map();
const allowedStepTypes = new Set([
  'text',
  'board_instruction',
  'quiz',
  'explanation',
  'checkpoint',
  'summary',
]);
const mojibake = /\u00c3.|\u00c2.|\ufffd|\?\b(?:o|a|e|i|u)\b/;
const expectedSourceHash = '5c04386a52193fb6f89b969731f307ac30c3ef08dd7ea9ebfec7a400e4c9662b';

const fail = (message) => errors.push(message);
if (dataset.schemaVersion !== '1.0.0') fail('schemaVersion must be 1.0.0');
if (dataset.source?.sha256 !== expectedSourceHash)
  fail('source SHA-256 does not match the provided PDF');
if (dataset.source?.pdfPages !== 476) fail('source PDF must contain 476 pages');
if (!Array.isArray(dataset.lessons) || dataset.lessons.length !== 119)
  fail('dataset must contain 119 lessons');

let previousSlug = null;
for (const [index, item] of (dataset.lessons ?? []).entries()) {
  const lesson = item.lesson ?? {};
  const label = `lesson[${index}]`;
  if (!Number.isInteger(item.chapter) || item.chapter < 1 || item.chapter > 12)
    fail(`${label}: invalid chapter`);
  if (!Number.isInteger(lesson.module) || lesson.module < 1 || lesson.module > 10)
    fail(`${label}: invalid module`);
  moduleCounts.set(lesson.module, (moduleCounts.get(lesson.module) ?? 0) + 1);
  if (typeof lesson.slug !== 'string' || !/^[a-z0-9-]+$/.test(lesson.slug))
    fail(`${label}: invalid slug`);
  if (slugs.has(lesson.slug)) fail(`${label}: duplicate slug ${lesson.slug}`);
  slugs.add(lesson.slug);
  const expectedPrerequisites = previousSlug ? [previousSlug] : [];
  if (JSON.stringify(lesson.prerequisites) !== JSON.stringify(expectedPrerequisites))
    fail(`${label}: prerequisite chain is not linear`);
  previousSlug = lesson.slug;
  if (typeof lesson.title !== 'string' || !lesson.title || lesson.title.length > 200)
    fail(`${label}: invalid title`);
  if (
    !Number.isInteger(lesson.estimatedMinutes) ||
    lesson.estimatedMinutes < 8 ||
    lesson.estimatedMinutes > 20
  )
    fail(`${label}: estimatedMinutes must be 8-20`);
  if (
    !Array.isArray(lesson.sourcePages) ||
    lesson.sourcePages.length < 1 ||
    lesson.sourcePages.some((page) => !Number.isInteger(page) || page < 1)
  )
    fail(`${label}: invalid sourcePages`);
  for (let pageIndex = 1; pageIndex < (lesson.sourcePages?.length ?? 0); pageIndex += 1)
    if (lesson.sourcePages[pageIndex] !== lesson.sourcePages[pageIndex - 1] + 1)
      fail(`${label}: sourcePages must be contiguous`);
  if (!Array.isArray(lesson.steps) || lesson.steps.length < 3 || lesson.steps.length > 10)
    fail(`${label}: steps must contain 3-10 items`);
  const stepKeys = new Set();
  let hasSummary = false;
  for (const [stepIndex, step] of (lesson.steps ?? []).entries()) {
    const stepLabel = `${label}.steps[${stepIndex}]`;
    if (typeof step.stepKey !== 'string' || !/^[a-z0-9-]+$/.test(step.stepKey))
      fail(`${stepLabel}: invalid stepKey`);
    if (stepKeys.has(step.stepKey)) fail(`${stepLabel}: duplicate stepKey`);
    stepKeys.add(step.stepKey);
    if (!allowedStepTypes.has(step.stepType)) fail(`${stepLabel}: invalid stepType`);
    if (typeof step.bodyMd !== 'string' || !step.bodyMd.trim())
      fail(`${stepLabel}: bodyMd is required`);
    if (mojibake.test(step.bodyMd)) fail(`${stepLabel}: possible mojibake`);
    if (
      !Array.isArray(step.expectedActions) ||
      !Array.isArray(step.nextStepRules) ||
      typeof step.feedback !== 'object' ||
      step.feedback === null
    )
      fail(`${stepLabel}: explicit action, feedback and rule fields are required`);
    hasSummary ||= step.stepType === 'summary';
    if (step.expectedActions.length > 0 && typeof step.initialFen !== 'string')
      fail(`${stepLabel}: every response activity requires a board with initialFen`);
    if (step.stepType === 'board_instruction') {
      if (typeof step.initialFen !== 'string') fail(`${stepLabel}: board step requires initialFen`);
      else {
        try {
          const chess = new Chess(step.initialFen);
          for (const action of step.expectedActions) {
            if (
              action.type !== 'move' ||
              typeof action.uci !== 'string' ||
              !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(action.uci)
            ) {
              fail(`${stepLabel}: invalid expected move`);
              continue;
            }
            const probe = new Chess(chess.fen());
            if (
              !probe.move({
                from: action.uci.slice(0, 2),
                to: action.uci.slice(2, 4),
                promotion: action.uci[4],
              })
            )
              fail(`${stepLabel}: expected move is illegal`);
          }
        } catch {
          fail(`${stepLabel}: illegal initialFen`);
        }
      }
    }
  }
  if (!hasSummary) fail(`${label}: summary step is required`);
  if (
    !Array.isArray(item.exerciseNumbers) ||
    item.exerciseNumbers.length < 2 ||
    item.exerciseNumbers.length > 12
  )
    fail(`${label}: exerciseNumbers must contain 2-12 items`);
  for (const number of item.exerciseNumbers ?? []) {
    if (linkedExercises.has(number)) fail(`${label}: exercise ${number} linked more than once`);
    linkedExercises.add(number);
    const exercise = exercises.exercises.find((candidate) => candidate.number === number);
    if (!exercise || exercise.module !== lesson.module || exercise.chapter !== item.chapter)
      fail(`${label}: exercise ${number} does not match module/chapter`);
  }
  const canonicalModule = exercises.modules.find((module) => module.number === lesson.module);
  const canonicalChapter = canonicalModule?.chapters.find(
    (chapter) => chapter.number === item.chapter,
  );
  if (!canonicalChapter || canonicalChapter.title !== lesson.title)
    fail(`${label}: title differs from canonical chapter`);
}

for (let module = 1; module <= 10; module += 1) {
  const expected = module === 1 ? 11 : 12;
  if (moduleCounts.get(module) !== expected)
    fail(`module ${module} must contain ${expected} lessons`);
}
const calculated = {
  boardLessons:
    dataset.lessons?.filter((item) =>
      item.lesson.steps.some((step) => step.stepType === 'board_instruction'),
    ).length ?? 0,
  exerciseLinks: linkedExercises.size,
  lessonCount: dataset.lessons?.length ?? 0,
  moduleCount: moduleCounts.size,
  stepCount: dataset.lessons?.reduce((total, item) => total + item.lesson.steps.length, 0) ?? 0,
};
for (const [key, value] of Object.entries(calculated))
  if (dataset.statistics?.[key] !== value) fail(`statistics.${key} must equal ${value}`);

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
const fileHash = crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex');
process.stdout.write(`${JSON.stringify({ fileHash, inputPath, ...calculated })}\n`);
