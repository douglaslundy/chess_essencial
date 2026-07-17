import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const EXPECTED_SHA256 = '0036682cf778eab9a87bb2691cddd942f85b12bd8f5b485c595c9efe74f8b369';
const sourcePath = resolve(
  process.argv[2] ?? 'database/content/Xadrez_Essencial_Exercicios_1_a_1298.json',
);
const raw = await readFile(sourcePath, 'utf8');
const normalizedRaw = raw.replace(/\r\n/g, '\n');
const digest = createHash('sha256').update(normalizedRaw).digest('hex');
const data = JSON.parse(raw);
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

assert(data.schema_version === '1.0.0', 'schema_version must be 1.0.0');
assert(Array.isArray(data.modules) && data.modules.length === 10, 'module count must be 10');
assert(Array.isArray(data.diagrams) && data.diagrams.length === 300, 'diagram count must be 300');
assert(
  Array.isArray(data.exercises) && data.exercises.length === 1298,
  'exercise count must be 1298',
);
assert(digest === EXPECTED_SHA256, 'canonical file SHA-256 does not match');

const moduleNumbers = new Set();
const chaptersByModule = new Map();
for (const module of data.modules ?? []) {
  assert(Number.isInteger(module.number), 'module number must be an integer');
  assert(!moduleNumbers.has(module.number), 'duplicate module number: ' + module.number);
  moduleNumbers.add(module.number);
  const chapters = new Set((module.chapters ?? []).map((chapter) => chapter.number));
  chaptersByModule.set(module.number, chapters);
  assert(
    module.exercise_count === module.exercise_range[1] - module.exercise_range[0] + 1,
    'invalid exercise range for module ' + module.number,
  );
}

const diagramIds = new Set();
for (const diagram of data.diagrams ?? []) {
  assert(typeof diagram.id === 'string' && diagram.id.length > 0, 'diagram id is required');
  assert(!diagramIds.has(diagram.id), 'duplicate diagram id: ' + diagram.id);
  diagramIds.add(diagram.id);
  assert(
    moduleNumbers.has(diagram.module),
    'diagram ' + diagram.id + ' references an unknown module',
  );
  assert(
    chaptersByModule.get(diagram.module)?.has(diagram.chapter),
    'diagram ' + diagram.id + ' references an unknown chapter',
  );
}

const exerciseIds = new Set();
const exerciseNumbers = new Set();
const checksums = new Set();
let referencedExercises = 0;
for (const exercise of data.exercises ?? []) {
  assert(typeof exercise.id === 'string' && exercise.id.length > 0, 'exercise id is required');
  assert(!exerciseIds.has(exercise.id), 'duplicate exercise id: ' + exercise.id);
  exerciseIds.add(exercise.id);
  assert(Number.isInteger(exercise.number), 'invalid exercise number: ' + exercise.id);
  assert(!exerciseNumbers.has(exercise.number), 'duplicate exercise number: ' + exercise.number);
  exerciseNumbers.add(exercise.number);
  assert(
    moduleNumbers.has(exercise.module),
    'exercise ' + exercise.id + ' references an unknown module',
  );
  assert(
    chaptersByModule.get(exercise.module)?.has(exercise.chapter),
    'exercise ' + exercise.id + ' references an unknown chapter',
  );
  assert(
    exercise.source?.exercise_number === exercise.number,
    'exercise ' + exercise.id + ' has an inconsistent source number',
  );
  assert(
    /^[a-f0-9]{64}$/.test(exercise.checksum_sha256),
    'exercise ' + exercise.id + ' has an invalid checksum format',
  );
  assert(
    !checksums.has(exercise.checksum_sha256),
    'duplicate exercise checksum: ' + exercise.checksum_sha256,
  );
  checksums.add(exercise.checksum_sha256);
  const references = exercise.diagram_refs ?? [];
  if (references.length > 0) referencedExercises += 1;
  for (const diagramId of references)
    assert(
      diagramIds.has(diagramId),
      'exercise ' + exercise.id + ' references missing diagram ' + diagramId,
    );
  for (const position of exercise.positions ?? [])
    assert(
      diagramIds.has(position.diagram_id),
      'exercise ' + exercise.id + ' position references missing diagram ' + position.diagram_id,
    );
}

assert(data.statistics?.module_count === data.modules?.length, 'statistics module count differs');
assert(
  data.statistics?.diagram_count === data.diagrams?.length,
  'statistics diagram count differs',
);
assert(
  data.statistics?.exercise_count === data.exercises?.length,
  'statistics exercise count differs',
);
assert(
  data.statistics?.exercises_with_positions === referencedExercises,
  'statistics positioned exercise count differs',
);

if (errors.length > 0) {
  throw new Error('Content validation failed:\n- ' + errors.slice(0, 20).join('\n- '));
}

process.stdout.write(
  [
    'content.source=' + basename(sourcePath),
    'content.sha256=' + digest,
    'content.modules=' + moduleNumbers.size,
    'content.diagrams=' + diagramIds.size,
    'content.exercises=' + exerciseIds.size,
    'content.references=ok',
  ].join('\n') + '\n',
);
