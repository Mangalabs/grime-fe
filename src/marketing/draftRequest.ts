import type { MarketingDraftRequest } from '../api/contracts'
import { loadSceneTexts } from '../features/manuscript/loadSceneTexts'
import { countWords } from '../features/usage/usage'
import { draftScenes, storyBibleText } from './identityDraft'
import type { IdentityKit } from './identityModel'
import type { MarketingKit } from './marketingKit'
import { buildWorldPack, timeline, type StoryData } from './worldPack'

// What the model should build on; ids, files and approvals stay out.
function currentIdentityText(identity: IdentityKit): string {
  const { essence, mood, typography, materials, light, sound, composition, avoid, stylePrompt } = identity
  return JSON.stringify({
    essence,
    mood,
    palette: identity.palette.map(({ name, hex, role }) => ({ name, hex, role })),
    typography,
    materials,
    light,
    sound,
    composition,
    motifs: identity.motifs.map(({ name, meaning }) => ({ name, meaning })),
    artifacts: identity.artifacts.map(({ kind, title, role }) => ({ kind, title, role })),
    moodboardCaptions: identity.moodboard.map((image) => image.caption).filter(Boolean),
    avoid,
    stylePrompt,
  })
}

/** Decrypts the scenes and assembles what the model reads; `words` is what it costs. */
export async function buildDraftRequest(
  story: StoryData,
  kit: MarketingKit,
  projectKey: CryptoKey,
  options: { includeLater: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ request: MarketingDraftRequest; words: number }> {
  const { publicSlots, laterSlots } = draftScenes(story, kit)
  const slots = options.includeLater ? [...publicSlots, ...laterSlots] : publicSlots
  const texts = await loadSceneTexts(projectKey, slots, options.onProgress)
  const ordered = timeline(story.slots)
  const orderOf = new Map(ordered.map((slot, index) => [slot.id, index + 1]))

  const publicScenes = publicSlots
    .map((slot, index) => ({ order: orderOf.get(slot.id)!, title: slot.title, text: texts[index] }))
    .filter((scene) => scene.text.trim())
  // Later scenes go without titles: a title can be a spoiler on its own.
  const restrictedScenes = options.includeLater
    ? texts.slice(publicSlots.length).filter((text) => text.trim()).map((text) => ({ text }))
    : []
  const storyBible = storyBibleText(buildWorldPack(story, kit, { includeTeasers: true }))

  const words =
    [...publicScenes, ...restrictedScenes].reduce((total, scene) => total + countWords(scene.text), 0) + countWords(storyBible)
  return {
    request: { publicScenes, restrictedScenes, storyBible, currentIdentity: currentIdentityText(kit.identity) },
    words,
  }
}
