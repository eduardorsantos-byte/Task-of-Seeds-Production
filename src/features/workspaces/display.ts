/** Nome de exibição (sem dependências de servidor; usável no cliente). */
export function displayName(p: { full_name: string; email: string }) {
  return p.full_name?.trim() || p.email;
}
