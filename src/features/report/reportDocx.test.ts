import { strFromU8, unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Slot } from '../../api/contracts'
import { buildReport, presetDefaults, type ReportData, type ReportOptions } from './reportModel'
import { renderReportDocx } from './reportDocx'

const text = 'Ela andou pela rua escura e voltou.\n\nDepois, chovia muito. Ela não dormiu.'
const slot = { id: 's1', projectId: 'p1', title: 'O retorno', isUnanchored: false, timelinePosition: 0, status: null } as unknown as Slot

const data = (suggestions?: ReportData['scenes'][number]['suggestions']): ReportData => ({
  projectTitle: 'Livro',
  scenes: [
    {
      slot,
      number: 1,
      text,
      // One finding on a passage across both lines, one on a single word.
      diagnostics: [
        { type: 'CONTINUITY_BREAK', severity: 'CRITICAL', message: 'Choveu?', sourceQuote: 'voltou.\n\nDepois', signatureHash: 'a' },
        { type: 'CONTINUITY_BREAK', severity: 'WARNING', message: 'Rua?', sourceQuote: 'rua escura', signatureHash: 'b' },
      ] as never,
      overrides: [],
      alerts: [],
      suggestions,
    },
  ],
  notes: [],
  groups: [],
  architect: null,
  tension: null,
  styleSheet: null,
  names: [],
})

const options: ReportOptions = {
  ...(presetDefaults.MANUSCRIPT as ReportOptions),
  preset: 'MANUSCRIPT',
  scope: { kind: 'ALL' },
  reviewer: 'Ana Revisora',
  letter: '',
  includeSuggestions: true,
}

async function documentXml(report: ReportData, chosen = options) {
  const { blob } = await renderReportDocx(buildReport(report, chosen), { styleSheet: null, names: [] })
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  return strFromU8(files['word/document.xml'])
}

// The document's comment and revision dates come from the clock.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T12:00:00.000Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

// The body paragraphs' text as Word shows it after "Accept all" or "Reject all".
function paragraphsAfter(xml: string, decision: 'accept' | 'reject') {
  const body = xml.slice(xml.indexOf('<w:body>'))
  return [...body.matchAll(/<w:p>([\s\S]*?)<\/w:p>|<w:p [^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((match) => match[1] ?? match[2])
    .map((paragraph) => {
      const kept = decision === 'accept' ? paragraph.replace(/<w:del [\s\S]*?<\/w:del>/g, '') : paragraph.replace(/<w:ins [\s\S]*?<\/w:ins>/g, '')
      return [...kept.matchAll(/<w:(?:t|delText)[^>]*>([^<]*)<\/w:(?:t|delText)>|<w:br\/>/g)]
        .map((part) => (part[0] === '<w:br/>' ? '\n' : part[1]))
        .join('')
    })
    .slice(2) // the title and the scene heading
}

const at = (passage: string) => text.indexOf(passage)

describe('renderReportDocx', () => {
  it('writes the annotated manuscript as before when there are no suggestions', async () => {
    expect(await documentXml(data())).toMatchSnapshot()
  })

  it('writes open suggestions as Word tracked changes, in the suggester’s name', async () => {
    const xml = await documentXml(
      data([
        { start: at('rua escura'), end: at('rua escura') + 'rua escura'.length, inserted: 'viela', author: 'Ana' },
        { start: at(' muito'), end: at(' muito') + ' muito'.length, inserted: '', author: null },
        { start: at('Ela não'), end: at('Ela não'), inserted: 'Exausta,\nela', author: 'Bia' },
      ]),
    )
    expect(xml).toMatch(/<w:del [^>]*w:author="Ana"[^>]*>[\s\S]*?<w:delText[^>]*>rua escura<\/w:delText>/)
    expect(xml).toMatch(/<w:ins [^>]*w:author="Ana"[^>]*>[\s\S]*?<w:t[^>]*>viela<\/w:t>/)
    expect(xml).toMatch(/<w:del [^>]*w:author="Google Docs"/)
    expect(paragraphsAfter(xml, 'reject')).toEqual(['Ela andou pela rua escura e voltou.', 'Depois, chovia muito. Ela não dormiu.'])
    expect(paragraphsAfter(xml, 'accept')).toEqual(['Ela andou pela viela e voltou.', 'Depois, chovia. Exausta,\nelaEla não dormiu.'])
    // The comments on the same passages are still there.
    expect(xml.match(/<w:commentRangeStart /g)).toHaveLength(2)
  })

  it('splits a removal across paragraphs, keeping each part in its own', async () => {
    const xml = await documentXml(data([{ start: at('voltou.'), end: at('chovia'), inserted: 'chegou; ', author: 'Ana' }]))
    expect(paragraphsAfter(xml, 'reject')).toEqual(['Ela andou pela rua escura e voltou.', 'Depois, chovia muito. Ela não dormiu.'])
    expect(paragraphsAfter(xml, 'accept')).toEqual(['Ela andou pela rua escura e ', 'chegou; chovia muito. Ela não dormiu.'])
  })

  it('leaves them out when the option is off', async () => {
    const xml = await documentXml(
      data([{ start: at('rua escura'), end: at('rua escura') + 10, inserted: 'viela', author: 'Ana' }]),
      { ...options, includeSuggestions: false },
    )
    expect(xml).not.toMatch(/<w:(ins|del) /)
  })
})

describe('the review PDF', () => {
  it('lists each open suggestion with its passage in context', async () => {
    const { renderReportPdf } = await import('./reportPdf')
    const model = buildReport(data([{ start: at('rua escura'), end: at('rua escura') + 10, inserted: 'viela', author: 'Ana' }]), {
      ...options,
      preset: 'AUTHOR',
    })
    const { doc } = renderReportPdf(model)
    const pdf = doc.output()
    // Labels are set in capitals; PDF strings escape parentheses.
    expect(pdf).toContain('SUGESTÃO DE EDIÇÃO ABERTA')
    expect(pdf).toContain('Ela andou pela [rua escura -> viela] e voltou.')
    expect(pdf).toContain(String.raw`\(de Ana\)`)
  })
})
