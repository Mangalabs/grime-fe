// The scene last open in each project, so reopening the project picks up
// there. A per-browser convenience; storage may be unavailable.

const key = (projectId: string) => `petricor.lastScene.${projectId}`

export function readLastScene(projectId: string): string | null {
  try {
    return localStorage.getItem(key(projectId))
  } catch {
    return null
  }
}

export function writeLastScene(projectId: string, slotId: string) {
  try {
    localStorage.setItem(key(projectId), slotId)
  } catch {
    // The project simply opens on the timeline next time.
  }
}
