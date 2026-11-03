// The API client: one module per area under ./endpoints, over ./http.
import { architectApi } from './endpoints/architect'
import { accountApi } from './endpoints/account'
import { projectsApi } from './endpoints/projects'
import { manuscriptImportsApi } from './endpoints/manuscriptImports'
import { timelineApi } from './endpoints/timeline'
import { canonApi } from './endpoints/canon'
import { entitiesApi } from './endpoints/entities'
import { documentsApi } from './endpoints/documents'
import { editorialApi } from './endpoints/editorial'
import { marketingApi } from './endpoints/marketing'
import { notesApi } from './endpoints/notes'
import { scenesApi } from './endpoints/scenes'
import { suggestionsApi } from './endpoints/suggestions'

export { ApiError } from './http'
export { auth, joinWaitlist } from './endpoints/auth'
export { admin } from './endpoints/admin'
export { google } from './endpoints/google'

export const api = {
  ...architectApi,
  ...accountApi,
  ...projectsApi,
  ...manuscriptImportsApi,
  ...timelineApi,
  ...canonApi,
  ...entitiesApi,
  ...documentsApi,
  ...editorialApi,
  ...marketingApi,
  ...notesApi,
  ...scenesApi,
  ...suggestionsApi,
}
