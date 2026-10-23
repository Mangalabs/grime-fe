// Attribute keys come from the Arquivista and vary over time (English
// snake_case in older facts, Portuguese keys now). Synonyms collapse to one
// canonical key so an entity's history lines up across scenes.

function normalizeKey(attribute: string): string {
  return attribute
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const synonyms: Record<string, string[]> = {
  local_atual: ['current_location', 'location', 'localizacao', 'local'],
  saude: ['health_status', 'health', 'saude_status', 'estado_de_saude'],
  posse: ['possession', 'possessions', 'inventory', 'inventario', 'saldo_de_moedas'],
  situacao: ['status', 'estado'],
  relacao: ['relational_status', 'relationship', 'relacionamento'],
  familia: ['vinculo_familia', 'family', 'parentesco'],
  lealdade: ['loyalty', 'allegiance', 'faccao'],
  cargo: ['office_position', 'position', 'role', 'funcao'],
  profissao: ['profissao_disciplina', 'profession', 'occupation', 'oficio'],
  origem: ['origem_regiao', 'origin', 'naturalidade'],
  aparencia: ['appearance', 'aparencia_fisica'],
  objetivo: ['goal', 'objective', 'motivacao'],
  conhecimento: ['knowledge', 'sabe'],
  mecanica_limitacao: ['mechanic_limitation', 'mecanica', 'limitacao', 'world_rule'],
}

const labels: Record<string, string> = {
  local_atual: 'Local atual',
  saude: 'Saúde',
  posse: 'Posses',
  situacao: 'Situação',
  relacao: 'Relação',
  familia: 'Família',
  lealdade: 'Lealdade',
  cargo: 'Cargo',
  profissao: 'Profissão',
  origem: 'Origem',
  aparencia: 'Aparência',
  objetivo: 'Objetivo',
  conhecimento: 'Conhecimento',
  mecanica_limitacao: 'Mecânica / limitação',
  condicao_interna: 'Condição interna',
  honra_percebida: 'Honra percebida',
  credits: 'Créditos',
  valor_recebido: 'Valor recebido',
}

const canonicalBySynonym = new Map<string, string>(
  Object.entries(synonyms).flatMap(([canonical, keys]) => [
    [canonical, canonical] as const,
    ...keys.map((key) => [key, canonical] as const),
  ]),
)

/** The key used to group facts that describe the same thing. */
export function canonicalAttribute(attribute: string): string {
  const key = normalizeKey(attribute)
  return canonicalBySynonym.get(key) ?? key
}

/** A readable Portuguese label for any attribute key. */
export function attributeLabel(attribute: string): string {
  const key = canonicalAttribute(attribute)
  if (labels[key]) return labels[key]
  const words = key.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toLocaleUpperCase('pt-BR') + words.slice(1) : attribute
}

// Display order for an entity sheet: where/how the entity is first.
const sheetOrder = [
  'local_atual',
  'saude',
  'situacao',
  'cargo',
  'profissao',
  'lealdade',
  'relacao',
  'familia',
  'posse',
  'objetivo',
  'conhecimento',
  'aparencia',
  'origem',
  'mecanica_limitacao',
]

export function compareAttributes(a: string, b: string): number {
  const rank = (key: string) => {
    const index = sheetOrder.indexOf(key)
    return index < 0 ? sheetOrder.length : index
  }
  return rank(a) - rank(b) || attributeLabel(a).localeCompare(attributeLabel(b), 'pt-BR')
}
