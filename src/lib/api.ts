import { NextResponse } from 'next/server';

// =====================================================================
// Erros padronizados da API
// ---------------------------------------------------------------------
// Toda resposta de erro segue o formato:
//   { "success": false, "error": { "code": "INSUFFICIENT_ZENI", "message": "Zeni insuficiente." } }
// Nunca vaze stack traces ou detalhes internos para o cliente.
// =====================================================================

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_ZENI'
  | 'INSUFFICIENT_CRYSTALS'
  | 'INSUFFICIENT_ENERGY'
  | 'INSUFFICIENT_HP'
  | 'STAT_CAP_REACHED'
  | 'MISSION_IN_PROGRESS'
  | 'MISSION_NOT_READY'
  | 'MISSION_NONE'
  | 'PLAYER_BUSY_ON_MISSION'
  | 'ITEM_NOT_EQUIPPABLE'
  | 'ITEM_ALREADY_OWNED'
  | 'ITEM_EQUIPPED'
  | 'ITEM_NOT_OWNED'
  | 'TECHNIQUE_ALREADY_KNOWN'
  | 'TECHNIQUE_NOT_LEARNED'
  | 'LOADOUT_INVALID_SLOT'
  | 'TRANSFORMATION_LOCKED'
  | 'TRANSFORM_UNKNOWN'
  | 'TRANSFORM_PATH_TAKEN'
  | 'NOT_ACQUIRED'
  | 'CANNOT_DELETE_LAST'
  | 'GUILD_ALREADY_MEMBER'
  | 'GUILD_NAME_TAKEN'
  | 'GUILD_LIMIT'
  | 'CHARACTER_LIMIT_REACHED'
  | 'CHARACTER_NAME_TAKEN'
  | 'PVP_OUT_OF_RANGE'
  | 'ACTIVITY_IN_PROGRESS'
  | 'TOURNAMENT_COOLDOWN'
  | 'ZENKAI_LIMIT'
  | 'BOSS_NOT_ACTIVE'
  | 'BOSS_COOLDOWN'
  | 'QUEST_NOT_READY'
  | 'QUEST_ALREADY_CLAIMED'
  | 'ACHIEVEMENT_NOT_UNLOCKED'
  | 'ACHIEVEMENT_ALREADY_CLAIMED'
  | 'AVATAR_INVALID_URL'
  | 'AVATAR_INVALID_TYPE'
  | 'AVATAR_TOO_LARGE'
  | 'AVATAR_STORAGE_UNAVAILABLE'
  | 'EMAIL_INVALID'
  | 'EMAIL_TAKEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'RESET_TOKEN_INVALID'
  | 'PRECONDITION_FAILED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'USERNAME_TAKEN'
  | 'ACCOUNT_NOT_GUEST'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  INSUFFICIENT_ZENI: 400,
  INSUFFICIENT_CRYSTALS: 400,
  INSUFFICIENT_ENERGY: 400,
  INSUFFICIENT_HP: 400,
  STAT_CAP_REACHED: 400,
  MISSION_IN_PROGRESS: 400,
  MISSION_NOT_READY: 400,
  MISSION_NONE: 400,
  PLAYER_BUSY_ON_MISSION: 409,
  ITEM_NOT_EQUIPPABLE: 400,
  ITEM_ALREADY_OWNED: 400,
  ITEM_EQUIPPED: 400,
  ITEM_NOT_OWNED: 400,
  TECHNIQUE_ALREADY_KNOWN: 400,
  TECHNIQUE_NOT_LEARNED: 400,
  LOADOUT_INVALID_SLOT: 400,
  TRANSFORMATION_LOCKED: 400,
  TRANSFORM_UNKNOWN: 400,
  TRANSFORM_PATH_TAKEN: 409,
  NOT_ACQUIRED: 403,
  CANNOT_DELETE_LAST: 400,
  GUILD_ALREADY_MEMBER: 400,
  GUILD_NAME_TAKEN: 409,
  GUILD_LIMIT: 400,
  CHARACTER_LIMIT_REACHED: 409,
  CHARACTER_NAME_TAKEN: 409,
  PVP_OUT_OF_RANGE: 400,
  ACTIVITY_IN_PROGRESS: 409,
  TOURNAMENT_COOLDOWN: 429,
  ZENKAI_LIMIT: 400,
  BOSS_NOT_ACTIVE: 400,
  BOSS_COOLDOWN: 429,
  QUEST_NOT_READY: 400,
  QUEST_ALREADY_CLAIMED: 400,
  ACHIEVEMENT_NOT_UNLOCKED: 400,
  ACHIEVEMENT_ALREADY_CLAIMED: 400,
  AVATAR_INVALID_URL: 400,
  AVATAR_INVALID_TYPE: 400,
  AVATAR_TOO_LARGE: 413,
  AVATAR_STORAGE_UNAVAILABLE: 500,
  EMAIL_INVALID: 400,
  EMAIL_TAKEN: 409,
  EMAIL_NOT_VERIFIED: 400,
  RESET_TOKEN_INVALID: 400,
  PRECONDITION_FAILED: 412,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  USERNAME_TAKEN: 409,
  ACCOUNT_NOT_GUEST: 400,
  INTERNAL: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? defaultMessage(code));
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

function defaultMessage(code: ErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Você precisa entrar para fazer isso.';
    case 'FORBIDDEN':
      return 'Este guerreiro não pertence à sua conta.';
    case 'NOT_FOUND':
      return 'Registro não encontrado.';
    case 'VALIDATION_ERROR':
      return 'Dados inválidos.';
    case 'INSUFFICIENT_ZENI':
      return 'Zeni insuficiente.';
    case 'INSUFFICIENT_CRYSTALS':
      return 'Cristais insuficientes.';
    case 'INSUFFICIENT_ENERGY':
      return 'Energia insuficiente.';
    case 'INSUFFICIENT_HP':
      return 'Você está ferido demais para isso.';
    case 'STAT_CAP_REACHED':
      return 'Atributo já está no nível máximo.';
    case 'MISSION_IN_PROGRESS':
      return 'Você já está em uma missão.';
    case 'MISSION_NOT_READY':
      return 'A missão ainda não terminou.';
    case 'MISSION_NONE':
      return 'Você não tem missão em andamento.';
    case 'PLAYER_BUSY_ON_MISSION':
      return 'Seu guerreiro está realizando uma missão. Aguarde o retorno para executar esta ação.';
    case 'TRANSFORM_PATH_TAKEN':
      return 'Você já escolheu um caminho de transformação — os ramos são exclusivos.';
    case 'CHARACTER_LIMIT_REACHED':
      return 'Limite de personagens atingido.';
    case 'CHARACTER_NAME_TAKEN':
      return 'Este nome de guerreiro já está em uso.';
    case 'AVATAR_INVALID_URL':
      return 'URL de imagem inválida ou insegura.';
    case 'AVATAR_INVALID_TYPE':
      return 'Apenas imagens JPG, PNG ou WebP são aceitas.';
    case 'AVATAR_TOO_LARGE':
      return 'Imagem muito grande (máximo 5 MB).';
    case 'AVATAR_STORAGE_UNAVAILABLE':
      return 'O armazenamento de avatares está indisponível no momento. Tente novamente mais tarde.';
    case 'EMAIL_INVALID':
      return 'E-mail inválido.';
    case 'EMAIL_TAKEN':
      return 'Este e-mail já está em uso.';
    case 'EMAIL_NOT_VERIFIED':
      return 'E-mail não verificado.';
    case 'RESET_TOKEN_INVALID':
      return 'Link de recuperação inválido ou expirado.';
    case 'PRECONDITION_FAILED':
      return 'Uma condição necessária para esta ação não foi cumprida.';
    case 'ITEM_ALREADY_OWNED':
      return 'Você já possui este item.';
    case 'TECHNIQUE_ALREADY_KNOWN':
      return 'Você já domina esta técnica.';
    case 'TECHNIQUE_NOT_LEARNED':
      return 'Você não aprendeu esta técnica.';
    case 'TRANSFORMATION_LOCKED':
      return 'Você ainda não cumpre os requisitos desta transformação.';
    case 'NOT_ACQUIRED':
      return 'Você não desbloqueou esta transformação ainda!';
    case 'CANNOT_DELETE_LAST':
      return 'Você deve manter pelo menos 1 personagem.';
    case 'GUILD_NAME_TAKEN':
      return 'Já existe uma guilda com este nome.';
    case 'PVP_OUT_OF_RANGE':
      return 'Nível do adversário fora do alcance permitido.';
    case 'RATE_LIMITED':
      return 'Muitas tentativas. Aguarde um momento.';
    case 'CONFLICT':
      return 'Conflito de estado — tente novamente.';
    case 'USERNAME_TAKEN':
      return 'Este nome de usuário já está em uso.';
    default:
      return 'Erro interno.';
  }
}

export function errorResponse(code: ErrorCode, message?: string) {
  return NextResponse.json(
    { success: false, error: { code, message: message ?? defaultMessage(code) } },
    { status: STATUS_BY_CODE[code] }
  );
}

/** Converte qualquer exceção em resposta padronizada (sem stack trace). */
export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message);
  }
  console.error('[api] erro inesperado:', error);
  return errorResponse('INTERNAL');
}

/** Envelope de sucesso padronizado. */
export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
