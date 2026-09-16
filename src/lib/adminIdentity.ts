// Somente servidor: nunca importar este módulo em componentes do cliente.
// A checagem é adicional à RPC is_admin(); variável ausente nega acesso.
export function isAdminEmail(email: string | null | undefined): email is string {
  const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!allowed && typeof email === 'string' && email.trim().toLowerCase() === allowed;
}
