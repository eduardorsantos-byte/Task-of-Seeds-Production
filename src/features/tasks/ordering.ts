/**
 * Ordenação fracionária no Kanban: a nova posição fica entre os vizinhos,
 * então só a tarefa movida é gravada (sem reescrever a coluna inteira).
 */
export function positionBetween(prev: number | undefined, next: number | undefined, now = Date.now() / 1000) {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1;
  if (next !== undefined) return next - 1;
  return now;
}
