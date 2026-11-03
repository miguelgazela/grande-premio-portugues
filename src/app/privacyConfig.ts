/**
 * Identificação do responsável pelos dados, mostrada em /#/privacidade.
 * PREENCHER antes de usar com alunos: enquanto tiver "POR PREENCHER", a página mostra um aviso a vermelho.
 */
export const PRIVACY_CONTACT = {
  /** Nome da professora e escola, ex.: "Mara Silva, Escola Secundária de …" */
  responsavel: 'Mara Ribeiro, Colégio Ribadouro',
  /** Email para pedidos dos encarregados de educação. */
  email: 'mararibeiro@ribadouro.com',
  /** Dias até as alcunhas serem anonimizadas (tem de coincidir com o prazo usado em anonymize_old_players). */
  dias: 30,
};

export const isPlaceholder = (s: string) => s.includes('POR PREENCHER');
