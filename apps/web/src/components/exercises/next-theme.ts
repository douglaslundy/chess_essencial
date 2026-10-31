// Próximo tema tático depois de `current`, na ordem da lista e dando a volta, pulando os já
// tentados nesta passada. `current` vazio é "Todos os temas": se ele esgotou, não sobra nada.
export function nextTheme(
  themes: readonly string[],
  current: string,
  tried: ReadonlySet<string>,
): string | null {
  if (!current) return null;
  const start = themes.indexOf(current);
  for (let step = 1; step <= themes.length; step += 1) {
    const candidate = themes[(start + step) % themes.length]!;
    if (candidate !== current && !tried.has(candidate)) return candidate;
  }
  return null;
}
