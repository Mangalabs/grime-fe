/** "1 cena", "1.234 cenas": the count in pt-BR digits, with the word that agrees. */
export const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`
