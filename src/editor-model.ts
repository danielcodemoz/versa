import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Turn } from './editor-geometry'

export type Family = 'sans' | 'serif' | 'mono'
export type Point = [number, number]
export interface TextNote { kind: 'text'; id: number; x: number; y: number; text: string; size: number; color: string; font: Family }
export interface Stroke { kind: 'ink'; id: number; points: Point[]; color: string; width: number; alpha: number }
export interface Picture { kind: 'pic'; id: number; x: number; y: number; w: number; h: number; image: number; angle: Turn; opacity: number }
export type ShapeKind = 'rect' | 'circle' | 'line' | 'arrow' | 'cover'
export interface Shape { kind: 'shape'; id: number; mode: ShapeKind; from: Point; to: Point; color: string; width: number }
export interface Original {
  index: number; origin: Point; angle: number; w: number; h: number; ascent: number
  size: number; font: Family; color: string; background: string; text: string
}
export interface Replacement { kind: 'replace'; id: number; block: Original; text: string }
export interface Comment { kind: 'comment'; id: number; at: Point; text: string }
export interface Stamp { kind: 'stamp'; id: number; at: Point; text: string; color: string }
export type Note = TextNote | Stroke | Picture | Shape | Replacement | Comment | Stamp
export interface Sheet { id: number; src: number; turn: Turn; notes: Note[] }
export interface Meta { w: number; h: number; base: Turn; unit: number; source?: number; page?: number }
export interface Bitmap { data: Blob; type: 'png' | 'jpg'; url: string; w: number; h: number }
export type FormValue = string | boolean | string[]
export interface FormField {
  name: string
  kind: 'text' | 'check' | 'choice'
  value: FormValue
  options?: string[]
  multiline?: boolean
  multiple?: boolean
  editable?: boolean
  maxLength?: number
}
export interface Source { pdf: PDFDocumentProxy; close: () => Promise<void> | void; data: Blob; fields: FormField[] }
export const fieldKey = (source: number, name: string) => JSON.stringify([source, name])

export function offset(origin: Point, angle: number, x: number, y: number): Point {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [origin[0] + x * c - y * s, origin[1] + x * s + y * c]
}
export function bounds(from: Point, to: Point) {
  return { x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]), w: Math.abs(to[0] - from[0]), h: Math.abs(to[1] - from[1]) }
}
export function arrowHead(from: Point, to: Point, width: number): [Point, Point] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  const length = Math.min(Math.hypot(to[0] - from[0], to[1] - from[1]) * .45, Math.max(7, width * 4))
  return [offset(to, angle, -length, length * .45), offset(to, angle, -length, -length * .45)]
}
