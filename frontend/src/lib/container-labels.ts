import type { ContainerResource } from "@/lib/types"

const APP_ID_LABEL = "containarr.app.id"
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project"

type LabeledContainer = Pick<ContainerResource, "labels">

export function getContainerAppId(container: LabeledContainer) {
  return container.labels[APP_ID_LABEL]?.trim() || null
}

export function getComposeProject(container: LabeledContainer) {
  return container.labels[COMPOSE_PROJECT_LABEL]?.trim() || null
}
