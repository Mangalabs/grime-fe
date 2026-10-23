import type { FactEntityType } from '../../api/contracts'
import type { WikiField, WikiFieldKind, WikiSection, WikiTemplate } from './wikiModel'

// Built-in templates. Their ids are fixed so "restore the starters" can tell
// which ones a project already has; field ids are readable slugs so other
// features (exports, the Revisor) can find e.g. a character's Lie.

type FieldSpec = Partial<WikiField> & { id: string; label: string; kind?: WikiFieldKind }

const field = ({ kind = 'longtext', ...spec }: FieldSpec): WikiField => ({
  kind,
  guidance: '',
  options: [],
  entityTypes: [],
  multiple: true,
  guidanceBy: null,
  ...spec,
})

const section = (id: string, title: string, guidance: string, fields: WikiField[], canon: WikiSection['canon'] = null): WikiSection => ({
  id,
  title,
  guidance,
  canon,
  fields,
})

const relations = (guidance: string, fields: WikiField[] = []) =>
  section('relations', 'Relações', guidance, fields, 'relations')

const manuscript = () =>
  section(
    'manuscript',
    'No manuscrito',
    'O que as cenas analisadas já estabeleceram. Compare com o planejado acima.',
    [],
    'state',
  )

const template = (
  id: string,
  entityType: FactEntityType,
  name: string,
  description: string,
  sections: WikiSection[],
): WikiTemplate => ({ id, entityType, name, description, sections })

// Arc types after K. M. Weiland's "Creating Character Arcs".
const arcOptions = [
  {
    id: 'positive',
    label: 'Positivo',
    guidance: 'O personagem supera a Mentira, abraça a Verdade e termina melhor do que começou.',
  },
  {
    id: 'flat',
    label: 'Plano (neutro)',
    guidance: 'O personagem já conhece a Verdade e a sustenta sob pressão; quem muda é o mundo ao redor dele.',
  },
  {
    id: 'disillusionment',
    label: 'Negativo: desilusão',
    guidance: 'O personagem abandona a Mentira, mas a Verdade que encontra é dura ou trágica.',
  },
  {
    id: 'fall',
    label: 'Negativo: queda',
    guidance: 'O personagem rejeita a Verdade e se agarra à Mentira até ser destruído por ela.',
  },
  {
    id: 'corruption',
    label: 'Negativo: corrupção',
    guidance: 'O personagem começa perto da Verdade e a troca por uma Mentira mais sedutora.',
  },
]

const byArc = (byOption: Record<string, string>) => ({ fieldId: 'arc_type', byOption })

const roleOptions = [
  ['protagonist', 'Protagonista'],
  ['antagonist', 'Antagonista'],
  ['deuteragonist', 'Deuteragonista'],
  ['mentor', 'Mentor'],
  ['ally', 'Aliado'],
  ['love_interest', 'Interesse amoroso'],
  ['foil', 'Contraponto'],
  ['supporting', 'Coadjuvante'],
].map(([id, label]) => ({ id, label, guidance: '' }))

const loveLanguages = [
  ['words', 'Palavras de afirmação'],
  ['time', 'Tempo de qualidade'],
  ['gifts', 'Presentes'],
  ['service', 'Atos de serviço'],
  ['touch', 'Toque físico'],
].map(([id, label]) => ({ id, label, guidance: '' }))

const characterClassic = template(
  'starter-character-classic',
  'CHARACTER',
  'Ficha clássica',
  'Ficha completa: arco, personalidade, valores e motivações.',
  [
    section('personal', 'Informações pessoais', '', [
      field({ id: 'full_name', label: 'Nome completo', kind: 'text' }),
      field({ id: 'age', label: 'Idade', kind: 'text', guidance: 'Idade real ou aparente, e em que momento da história.' }),
      field({ id: 'gender', label: 'Gênero', kind: 'text' }),
      field({ id: 'role', label: 'Papel na história', kind: 'choice', options: roleOptions }),
      field({ id: 'occupation', label: 'Ocupação', kind: 'text' }),
    ]),
    section('arc', 'Arco do personagem', 'Como o personagem muda (ou não) do começo ao fim, e por quê.', [
      field({ id: 'arc_type', label: 'Tipo de arco', kind: 'choice', options: arcOptions }),
      field({
        id: 'lie',
        label: 'Mentira',
        guidance: 'A crença falsa sobre si mesmo ou sobre o mundo. Costuma nascer do Fantasma.',
        guidanceBy: byArc({
          positive: 'A história vai desafiá-la até que ele a abandone.',
          flat: 'No arco plano ele não acredita na Mentira: descreva a Mentira em que o mundo ao redor acredita.',
          disillusionment: 'Ele vai abandoná-la, mas pagando caro pela Verdade.',
          fall: 'Ele vai se agarrar a ela cada vez mais, mesmo diante das provas.',
          corruption: 'É a Mentira que vai seduzi-lo ao longo da história.',
        }),
      }),
      field({
        id: 'truth',
        label: 'Verdade',
        guidance: 'O contrário da Mentira: o que ele precisa entender. Costuma expressar o tema do livro.',
        guidanceBy: byArc({
          positive: 'Ele a alcança no clímax.',
          flat: 'Ele já a conhece no começo; a história testa até onde ele a sustenta.',
          disillusionment: 'Ele a alcança, mas ela não traz consolo.',
          fall: 'Ele a vê e a rejeita.',
          corruption: 'Ele a conhece no começo e a abandona.',
        }),
      }),
      field({
        id: 'ghost',
        label: 'Fantasma (ferida do passado)',
        guidance: 'O acontecimento do passado que feriu o personagem e deu origem à Mentira. Pode nunca aparecer em cena, mas pesa nas escolhas dele.',
      }),
      field({
        id: 'goal',
        label: 'Objetivo (o que quer)',
        guidance: 'Concreto e consciente: move o enredo. Muitas vezes é sustentado pela Mentira.',
      }),
      field({
        id: 'need',
        label: 'Necessidade (o que precisa)',
        guidance: 'O que ele precisa de verdade, quase sempre sem saber. Ligada à Verdade.',
      }),
    ]),
    section('physical', 'Atributos físicos', 'O que um observador nota primeiro. Prefira detalhes que revelem caráter ou história.', [
      field({ id: 'appearance', label: 'Aparência', guidance: 'Porte, rosto, cabelo, olhos.' }),
      field({ id: 'distinguishing_marks', label: 'Traços marcantes', kind: 'list', guidance: 'Cicatrizes, tiques, gestos, um por linha.' }),
      field({ id: 'clothing', label: 'Vestuário', kind: 'text' }),
      field({ id: 'voice', label: 'Voz e modo de falar', kind: 'text', guidance: 'Ritmo, vocabulário, expressões que só ele usa.' }),
    ]),
    section('personality', 'Personalidade', '', [
      field({ id: 'fear', label: 'Maior medo', guidance: 'O que ele faria quase tudo para evitar. Costuma estar ligado ao Fantasma.' }),
      field({
        id: 'criticizes',
        label: 'O que critica nos outros? Por quê?',
        guidance: 'Costumamos criticar nos outros o que rejeitamos em nós. A resposta revela feridas e valores.',
      }),
      field({
        id: 'love_language',
        label: 'Linguagem do amor',
        kind: 'choice',
        options: loveLanguages,
        guidance: 'Como ele demonstra e reconhece afeto. Opcional: útil quando relações estão no centro da história.',
      }),
      field({
        id: 'emotional_pain',
        label: 'Como reage à dor emocional?',
        guidance: 'Foge, ataca, se fecha, faz piada, se afunda no trabalho…',
      }),
    ]),
    section('values', 'Valores pessoais', '', [
      field({
        id: 'values',
        label: 'Valores',
        kind: 'list',
        guidance: 'Em ordem de importância, um por linha. Dois valores em conflito rendem as melhores cenas.',
      }),
      field({ id: 'moral_line', label: 'Limite moral', guidance: 'O que ele jamais faria, e o que o faria cruzar essa linha.' }),
    ]),
    section('significant_object', 'Objeto significativo', '', [
      field({
        id: 'object',
        label: 'Objeto',
        kind: 'entities',
        entityTypes: ['ITEM'],
        multiple: false,
        guidance: 'Um item do Arquivo ligado ao personagem.',
      }),
      field({ id: 'object_meaning', label: 'Significado', guidance: 'Por que importa: memória, promessa, poder, culpa.' }),
    ]),
    section('manipulation', 'Método de manipulação', '', [
      field({
        id: 'manipulation',
        label: 'Como consegue o que quer dos outros',
        guidance: 'Charme, culpa, ameaça, sedução, lógica, chantagem, silêncio…',
      }),
    ]),
    section('dissatisfaction', 'Insatisfação', '', [
      field({
        id: 'dissatisfaction',
        label: 'O que o incomoda na própria vida',
        guidance: 'No começo da história. É o ponto de partida da mudança.',
      }),
    ]),
    section('happiness', 'O que traz felicidade', '', [
      field({
        id: 'happiness',
        label: 'O que o faz feliz',
        guidance: 'Pequenos e grandes prazeres. Mostrá-los humaniza o personagem e dá a ele o que perder.',
      }),
    ]),
    section('goal_vs_fear', 'Objetivo × medo', '', [
      field({
        id: 'goal_vs_fear',
        label: 'Como quer alcançar o objetivo evitando o maior medo?',
        guidance: 'A estratégia dele, e o ponto em que objetivo e medo se chocam. Ali costuma estar o clímax.',
      }),
    ]),
    relations('As relações vêm das cenas e do Arquivo. Use o campo abaixo para o que ainda não está no texto.', [
      field({ id: 'planned_relations', label: 'Relações planejadas' }),
    ]),
    manuscript(),
  ],
)

const characterQuick = template(
  'starter-character-quick',
  'CHARACTER',
  'Ficha rápida',
  'O essencial para coadjuvantes e figurantes.',
  [
    section('essentials', 'Essencial', '', [
      field({ id: 'role', label: 'Papel na história', kind: 'choice', options: roleOptions }),
      field({ id: 'appearance', label: 'Aparência', guidance: 'Um ou dois traços que o leitor vai lembrar.' }),
      field({ id: 'goal', label: 'Objetivo (o que quer)' }),
      field({ id: 'fear', label: 'Maior medo' }),
      field({ id: 'voice', label: 'Voz e modo de falar', kind: 'text' }),
    ]),
    relations('As relações vêm das cenas e do Arquivo.'),
    manuscript(),
  ],
)

const location = template('starter-location', 'LOCATION', 'Ficha de local', 'Lugar, atmosfera, gente e função na história.', [
  section('overview', 'Visão geral', '', [
    field({ id: 'kind', label: 'Tipo de lugar', kind: 'text', guidance: 'Cidade, taverna, nave, floresta, reino…' }),
    field({ id: 'located_in', label: 'Fica em', kind: 'entities', entityTypes: ['LOCATION'], multiple: false }),
    field({ id: 'era', label: 'Época', kind: 'text' }),
  ]),
  section('senses', 'Sentidos', 'Dois sentidos além da visão bastam para ancorar uma cena.', [
    field({ id: 'appearance', label: 'Aparência' }),
    field({ id: 'sounds_smells', label: 'Sons, cheiros e texturas' }),
    field({ id: 'weather_light', label: 'Clima e luz', kind: 'text' }),
  ]),
  section('people', 'Gente e cultura', '', [
    field({ id: 'inhabitants', label: 'Quem vive ou frequenta' }),
    field({ id: 'customs', label: 'Regras e costumes' }),
    field({ id: 'ruled_by', label: 'Quem manda', kind: 'entities', entityTypes: ['CHARACTER', 'FACTION'] }),
  ]),
  section('history', 'História', '', [
    field({ id: 'past', label: 'Passado do lugar' }),
    field({ id: 'secret', label: 'Segredo', guidance: 'O que poucos sabem sobre este lugar.' }),
  ]),
  section('story', 'Na história', '', [
    field({ id: 'function', label: 'Função na história', guidance: 'Por que a cena precisa acontecer aqui e não em outro lugar?' }),
    field({ id: 'mood', label: 'Atmosfera', kind: 'text', guidance: 'O que o leitor deve sentir ao chegar.' }),
  ]),
  relations('Quem passou por aqui e o que aconteceu, segundo as cenas.'),
  manuscript(),
])

const item = template('starter-item', 'ITEM', 'Ficha de item', 'Origem, poder, custo e quem o possui.', [
  section('overview', 'Visão geral', '', [
    field({ id: 'kind', label: 'Tipo', kind: 'text' }),
    field({ id: 'appearance', label: 'Aparência' }),
    field({ id: 'origin', label: 'Origem', guidance: 'Quem fez, quando e por quê.' }),
  ]),
  section('power', 'Poder e função', '', [
    field({ id: 'function', label: 'O que faz' }),
    field({ id: 'cost', label: 'Limites e custo', guidance: 'Um objeto poderoso sem custo resolve problemas demais.' }),
    field({ id: 'rules', label: 'Regras do mundo envolvidas', kind: 'entities', entityTypes: ['WORLD_RULE'] }),
  ]),
  section('ownership', 'Posse', 'O manuscrito mostra quem o tem em cada cena; aqui vai o planejado.', [
    field({ id: 'owner', label: 'Dono atual', kind: 'entities', entityTypes: ['CHARACTER', 'FACTION'], multiple: false }),
    field({ id: 'previous_owners', label: 'Donos anteriores' }),
  ]),
  section('meaning', 'Significado', '', [
    field({ id: 'symbolism', label: 'Simbolismo', guidance: 'O que o objeto representa para o tema do livro.' }),
  ]),
  relations('Quem o usou, perdeu ou cobiçou, segundo as cenas.'),
  manuscript(),
])

// Guidance after Brandon Sanderson's laws of magic.
const worldRule = template('starter-world-rule', 'WORLD_RULE', 'Ficha de regra do mundo', 'Como a regra funciona, quanto custa e quando o leitor a aprende.', [
  section('rule', 'A regra', '', [
    field({ id: 'statement', label: 'Enunciado', guidance: 'A regra em uma frase, como se fosse uma lei.' }),
    field({ id: 'scope', label: 'Abrangência', kind: 'text', guidance: 'Onde e para quem vale.' }),
  ]),
  section('mechanics', 'Funcionamento', '', [
    field({ id: 'how', label: 'Como funciona' }),
    field({ id: 'cost', label: 'Custo', guidance: 'O que se paga para usá-la. Limitações rendem mais histórias que poderes.' }),
    field({ id: 'limits', label: 'Limites' }),
    field({
      id: 'exceptions',
      label: 'Exceções conhecidas',
      kind: 'list',
      guidance: 'Uma por linha. Exceções precisam ser intencionais: o Revisor aponta quebras de continuidade.',
    }),
  ]),
  section('world', 'No mundo', '', [
    field({ id: 'who_knows', label: 'Quem sabe dela' }),
    field({ id: 'consequences', label: 'Consequências', guidance: 'Como a regra muda economia, religião, política e cotidiano.' }),
    field({ id: 'origin', label: 'Origem' }),
  ]),
  section('reader', 'Para o leitor', '', [
    field({
      id: 'revealed',
      label: 'Quando é revelada',
      guidance: 'Em que ponto o leitor aprende a regra. Quanto melhor o leitor a entende, mais ela pode resolver conflitos sem parecer trapaça.',
    }),
  ]),
  manuscript(),
])

const faction = template('starter-faction', 'FACTION', 'Ficha de facção', 'Objetivo, estrutura, identidade e conflitos.', [
  section('overview', 'Visão geral', '', [
    field({ id: 'kind', label: 'Tipo', kind: 'text', guidance: 'Guilda, culto, casa nobre, exército, empresa…' }),
    field({ id: 'goal', label: 'Objetivo' }),
    field({ id: 'leader', label: 'Liderança', kind: 'entities', entityTypes: ['CHARACTER'] }),
  ]),
  section('structure', 'Estrutura', '', [
    field({ id: 'hierarchy', label: 'Hierarquia' }),
    field({ id: 'members', label: 'Membros', kind: 'entities', entityTypes: ['CHARACTER'] }),
    field({ id: 'base', label: 'Base', kind: 'entities', entityTypes: ['LOCATION'] }),
  ]),
  section('identity', 'Identidade', '', [
    field({ id: 'values', label: 'Valores', kind: 'list' }),
    field({ id: 'symbols', label: 'Símbolos e costumes' }),
  ]),
  section('conflicts', 'Conflitos', '', [
    field({ id: 'allies', label: 'Aliados', kind: 'entities', entityTypes: ['FACTION', 'CHARACTER'] }),
    field({ id: 'enemies', label: 'Inimigos', kind: 'entities', entityTypes: ['FACTION', 'CHARACTER'] }),
    field({ id: 'secret', label: 'Segredo' }),
  ]),
  relations('Ligações da facção segundo as cenas.'),
  manuscript(),
])

const event = template('starter-event', 'EVENT', 'Ficha de evento', 'O que aconteceu, por quê, e quem conta diferente.', [
  section('overview', 'Visão geral', '', [
    field({ id: 'when', label: 'Quando', kind: 'text' }),
    field({ id: 'where', label: 'Onde', kind: 'entities', entityTypes: ['LOCATION'] }),
    field({ id: 'involved', label: 'Envolvidos', kind: 'entities', entityTypes: ['CHARACTER', 'FACTION'] }),
  ]),
  section('what', 'O que aconteceu', '', [
    field({ id: 'account', label: 'Relato' }),
    field({ id: 'causes', label: 'Causas' }),
    field({ id: 'consequences', label: 'Consequências' }),
  ]),
  section('versions', 'Versões', '', [
    field({
      id: 'versions',
      label: 'Quem conta de outro jeito?',
      guidance: 'Versões divergentes e quem as sustenta. Útil com narradores não confiáveis.',
    }),
  ]),
  manuscript(),
])

export function starterTemplates(): WikiTemplate[] {
  // Fresh copies: templates are edited in place by the template editor.
  return structuredClone([characterClassic, characterQuick, location, item, worldRule, faction, event])
}
