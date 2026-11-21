// Annotations live in the "frame": the page as shown at its own /Rotate, in points, origin top-left, y down.
// These helpers map the frame to the display (after the user's extra turn) and to PDF user space.
export type Turn = 0 | 90 | 180 | 270
export interface Box { x: number; y: number; width: number; height: number }

export const normalise = (degrees: number) => (((Math.round(degrees / 90) * 90) % 360) + 360) % 360 as Turn

/** Frame point → PDF user space, for a page whose /Rotate is `base` and whose visible box is `box`. */
export function framePointToPdf(base: Turn, box: Box, fx: number, fy: number): [number, number] {
  const { x, y, width: W, height: H } = box
  switch (base) {
    case 90: return [x + fy, y + fx]
    case 180: return [x + W - fx, y + fy]
    case 270: return [x + W - fy, y + H - fx]
    default: return [x + fx, y + H - fy]
  }
}

/** Frame size (points) of a page with this box and /Rotate. */
export const frameSize = (base: Turn, box: Box): [number, number] => base % 180 ? [box.height, box.width] : [box.width, box.height]

/** Display (view) pixels relative to the rotated sheet's bounding box → frame points. */
export function viewToFrame(turn: Turn, frame: [number, number], scale: number, vx: number, vy: number): [number, number] {
  const [fw, fh] = frame
  switch (turn) {
    case 90: return [vy / scale, fh - vx / scale]
    case 180: return [fw - vx / scale, fh - vy / scale]
    case 270: return [fw - vy / scale, vx / scale]
    default: return [vx / scale, vy / scale]
  }
}

/** CSS transform that places the unrotated sheet inside its rotated bounding box (transform-origin: 0 0). */
export function sheetTransform(turn: Turn, frame: [number, number], scale: number) {
  const [fw, fh] = frame
  switch (turn) {
    case 90: return `translate(${fh * scale}px,0) rotate(90deg)`
    case 180: return `translate(${fw * scale}px,${fh * scale}px) rotate(180deg)`
    case 270: return `translate(0,${fw * scale}px) rotate(270deg)`
    default: return 'none'
  }
}

/** Baseline offset from the top of a text line box (line-height 1.2) per font family. */
export const baseline = { sans: .86, serif: .83, mono: .84 } as const
export const lineHeight = 1.2
