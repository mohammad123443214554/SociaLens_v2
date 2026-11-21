export type SmartCutoutProjectLayer = {
  id: string
  smartCutoutGroupId?: string
  smartCutoutSourceElementId?: string
  smartCutoutRole?: 'background' | 'object'
  smartCutoutObjectLabel?: string
}

export type SmartCutoutGroupRemoval<T extends SmartCutoutProjectLayer> = {
  layers: T[]
  removed: T[]
}

/** Remove only the generated layers belonging to one Smart Cutout group. */
export function removeSmartCutoutGroup<T extends SmartCutoutProjectLayer>(
  layers: T[],
  groupId: string,
): SmartCutoutGroupRemoval<T> {
  if (!groupId) throw new Error('A Smart Cutout group ID is required.')
  const removed = layers.filter(layer => layer.smartCutoutGroupId === groupId)
  return {
    layers: layers.filter(layer => layer.smartCutoutGroupId !== groupId),
    removed,
  }
}

/**
 * Restore a previously removed group without duplicating IDs or overwriting
 * independently edited layers that happen to exist in the current project.
 */
export function restoreSmartCutoutGroup<T extends SmartCutoutProjectLayer>(
  layers: T[],
  snapshot: T[],
): T[] {
  if (!Array.isArray(snapshot) || !snapshot.length) return layers
  const groupIds = new Set(snapshot.map(layer => layer.smartCutoutGroupId).filter((id): id is string => Boolean(id)))
  if (groupIds.size !== 1 || snapshot.some(layer => !layer.id || !layer.smartCutoutGroupId)) {
    throw new Error('The saved Smart Cutout undo snapshot is incomplete.')
  }
  const existingIds = new Set(layers.map(layer => layer.id))
  return [...layers, ...snapshot.filter(layer => !existingIds.has(layer.id))]
}

/** Timeline rows are stacked above the source photo, with objects before the clean plate. */
export function getSmartCutoutTimelineLabel(
  layer: SmartCutoutProjectLayer,
  fallbackIndex: number,
): string {
  if (layer.smartCutoutRole === 'object') return layer.smartCutoutObjectLabel || 'Cutout object'
  if (layer.smartCutoutRole === 'background') return 'Clean background'
  return 'Element ' + fallbackIndex
}
