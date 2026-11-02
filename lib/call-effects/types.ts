export type CallEffectCategoryId = 'natural-beauty' | 'makeup' | 'aesthetic-lighting' | 'face-enhancement' | 'creative-looks' | 'eye-lenses'
export type CallEffectRenderKind = 'color' | 'face-landmark' | 'segmentation' | 'overlay'

export interface CallEffectCategory { id: CallEffectCategoryId; label: string; description: string; order: number }
export interface CallEffectDefinition { id: string; categoryId: CallEffectCategoryId; name: string; description: string; renderKind: CallEffectRenderKind; requiresFace: boolean; defaultIntensity: number }
export interface CallEffectFrame { video: HTMLVideoElement; canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; timestamp: number; deltaMs: number; width: number; height: number }
export interface CallEffectStage { id: string; priority?: number; render(frame: CallEffectFrame): void; dispose?(): void }
export interface CallEffectsEngineOptions { maxWidth?: number; frameRate?: number; onStageError?: (stageId: string, error: unknown) => void }
export interface CallEffectsEngineSnapshot { running: boolean; width: number; height: number; frameRate: number; activeStageIds: string[] }
