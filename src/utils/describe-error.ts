/**
 * Erreur publiable dans les logs (publics) : MySQL recopie parfois la valeur fautive dans son message
 * (« Duplicate entry 'DUPONT Jean…' »), on n'en garde que le code et les noms de colonne ou de clé.
 */
export function describeError(error: any): string {
  if (!error?.sqlState) return String(error?.message ?? error);
  const names = [...String(error.message).matchAll(/\b(column|key) '([^']+)'/gi)].map(m => `${m[1]} ${m[2]}`);
  return `${error.code ?? 'SQL'}${names.length ? ` (${names.join(', ')})` : ''} [SQLSTATE ${error.sqlState}, errno ${error.errno}]`;
}
