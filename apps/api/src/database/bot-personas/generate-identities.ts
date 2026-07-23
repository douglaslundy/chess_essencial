const FIRST_NAMES = [
  'Ana',
  'Antônio',
  'Beatriz',
  'Bruno',
  'Camila',
  'Carlos',
  'Carolina',
  'Cláudia',
  'Daniel',
  'Diego',
  'Eduardo',
  'Elaine',
  'Fábio',
  'Fernanda',
  'Fernando',
  'Gabriel',
  'Gabriela',
  'Gustavo',
  'Helena',
  'Igor',
  'Isabela',
  'Jéssica',
  'João',
  'Joana',
  'José',
  'Juliana',
  'Larissa',
  'Leonardo',
  'Letícia',
  'Lucas',
  'Luciana',
  'Luiz',
  'Marcelo',
  'Marcos',
  'Maria',
  'Mariana',
  'Mateus',
  'Matheus',
  'Natália',
  'Patrícia',
  'Paulo',
  'Pedro',
  'Rafael',
  'Rafaela',
  'Renata',
  'Ricardo',
  'Rodrigo',
  'Sandra',
  'Sérgio',
  'Simone',
  'Tatiana',
  'Thiago',
  'Vanessa',
  'Vitor',
  'Vitória',
  'Wesley',
  'Yasmin',
] as const;

const LAST_NAMES = [
  'Almeida',
  'Alves',
  'Araújo',
  'Barbosa',
  'Barros',
  'Batista',
  'Cardoso',
  'Carvalho',
  'Castro',
  'Correia',
  'Costa',
  'Dias',
  'Duarte',
  'Fernandes',
  'Ferreira',
  'Freitas',
  'Gomes',
  'Gonçalves',
  'Lima',
  'Lopes',
  'Machado',
  'Martins',
  'Melo',
  'Mendes',
  'Moreira',
  'Nascimento',
  'Nogueira',
  'Nunes',
  'Oliveira',
  'Pereira',
  'Pinto',
  'Ramos',
  'Reis',
  'Ribeiro',
  'Rocha',
  'Rodrigues',
  'Santos',
  'Silva',
  'Siqueira',
  'Souza',
  'Teixeira',
  'Vieira',
] as const;

// Common human rating bands, so 200 personas cover the full skill range
// rather than clustering around a single average.
const RATING_BANDS = [700, 900, 1100, 1300, 1500, 1700, 1900, 2100] as const;

export interface BotIdentity {
  displayName: string;
  email: string;
  targetRating: number;
  username: string;
}

const COMBINING_DIACRITICS = new RegExp('[\u0300-\u036f]', 'g');

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(COMBINING_DIACRITICS, '');
}

function slugify(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function sampleRating(random: () => number): number {
  const band = RATING_BANDS[Math.floor(random() * RATING_BANDS.length)]!;
  return band + Math.floor(random() * 150);
}

/**
 * Generates `count` distinct bot personas (name, username, email, target
 * rating). Deterministic given the same `random` source, so tests can pass a
 * seeded generator instead of Math.random.
 */
export function generateBotIdentities(
  count: number,
  random: () => number = Math.random,
): BotIdentity[] {
  const usedFullNames = new Set<string>();
  const usedUsernames = new Set<string>();
  const identities: BotIdentity[] = [];
  const maxAttempts = count * 50;
  let attempts = 0;

  while (identities.length < count && attempts < maxAttempts) {
    attempts += 1;
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]!;
    const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]!;
    const fullName = `${first} ${last}`;
    if (usedFullNames.has(fullName)) continue;
    usedFullNames.add(fullName);

    const base = `${slugify(first)}_${slugify(last)}`;
    let username = base;
    let suffix = 0;
    while (usedUsernames.has(username)) {
      suffix += 1;
      username = `${base}${suffix}`;
    }
    usedUsernames.add(username);

    identities.push({
      displayName: fullName,
      email: `${username}@bots.internal.xadrez.invalid`,
      targetRating: sampleRating(random),
      username,
    });
  }

  if (identities.length < count) {
    throw new Error(
      `Could not generate ${count} unique bot identities (only found ${identities.length})`,
    );
  }
  return identities;
}
