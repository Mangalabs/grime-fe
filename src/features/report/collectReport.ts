import { ApiError, api } from "../../api/client";
import type { ArchitectReview, Slot } from "../../api/contracts";
import { decryptSceneDraft } from "../../crypto/projectEncryption";
import { orderScenes } from "../scenes/sceneStatus";
import type { ReportData, SceneData } from "./reportModel";

export type CollectedReport = Omit<ReportData, "notes" | "groups" | "styleSheet">;

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>, onDone: () => void) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
      onDone();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Everything the report can use, decrypted here. Nothing leaves the browser. */
export async function collectReportData(
  projectId: string,
  projectKey: CryptoKey,
  slots: Slot[],
  needsNames: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<CollectedReport> {
  const ordered = orderScenes(slots);
  let done = 0;
  const reviews = api.listArchitecturalReviews(projectId).catch(async (reason: unknown) => {
    if (!(reason instanceof ApiError) || reason.status !== 404) return [] as ArchitectReview[];
    // Older backends only know the latest report.
    return api
      .getLatestArchitecturalReview(projectId)
      .then((report) => [report])
      .catch(() => [] as ArchitectReview[]);
  });
  const [projects, architect, entities, scenes] = await Promise.all([
    api.listProjects(),
    reviews,
    needsNames ? api.listProjectEntities(projectId).catch(() => []) : Promise.resolve([]),
    mapLimit(
      ordered,
      6,
      async (slot): Promise<SceneData> => {
        const review = await api.getSlotReview(slot.id);
        // Exceptions and alerts are only fetched where there can be any.
        const [overrides, alerts, draft] = await Promise.all([
          review.diagnostics.length ? api.listOverrides(slot.id).catch(() => []) : Promise.resolve([]),
          slot.status?.pendingAlerts === 0 ? Promise.resolve([]) : api.listRegressionAlerts(slot.id).catch(() => []),
          review.content
            ? decryptSceneDraft(projectKey, review.content.ciphertext, review.content.iv)
            : Promise.resolve(null),
        ]);
        return {
          slot,
          number: slot.isUnanchored || slot.timelinePosition === null ? null : slot.timelinePosition + 1,
          text: draft?.content ?? null,
          diagnostics: review.diagnostics,
          overrides,
          alerts,
        };
      },
      () => onProgress(++done, ordered.length),
    ),
  ]);
  return {
    projectTitle: projects.find((project) => project.id === projectId)?.title ?? "Projeto",
    scenes,
    architect: architect[0] ?? null,
    tension: architect.find((report) => report.sceneMetrics?.length) ?? null,
    names: entities
      .filter((entity) => !entity.canonicalId)
      .flatMap((entity) => [entity.name, ...entity.aliases.map((alias) => alias.name)]),
  };
}
