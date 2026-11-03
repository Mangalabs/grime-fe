/** Lower case without accents (combining marks dropped), for matching words the way a reader would. */
export const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
