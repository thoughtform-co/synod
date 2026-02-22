/**
 * Win32 window region for a notched titlebar (Windows only).
 * Uses SetWindowRgn via koffi to clip the window to a polygon with an
 * inverted-trapezoid notch at the top center.
 */

const NOTCH_WIDTH = 340;
const SLOPE_WIDTH = 28;
const NOTCH_DEPTH = 14;
const MIN_WIDTH_FOR_NOTCH = NOTCH_WIDTH + 2 * SLOPE_WIDTH + 100;

let SetWindowRgn: ((hwnd: number, hrgn: unknown, redraw: number) => number) | null = null;
let CreatePolygonRgn: ((pts: Buffer, count: number, mode: number) => unknown) | null = null;
let loaded = false;

function ensureLoaded(): boolean {
  if (loaded) return SetWindowRgn !== null;
  loaded = true;
  if (process.platform !== 'win32') return false;
  try {
    const koffi = require('koffi');
    const gdi32 = koffi.load('gdi32.dll');
    const user32 = koffi.load('user32.dll');

    // HWND as uintptr_t so we can pass the raw integer from Electron
    // HRGN as void* so koffi returns an opaque pointer we can pass back
    CreatePolygonRgn = gdi32.func(
      'void* __stdcall CreatePolygonRgn(void *pptl, int cPoint, int iMode)'
    );
    SetWindowRgn = user32.func(
      'int __stdcall SetWindowRgn(uintptr_t hWnd, void *hRgn, int bRedraw)'
    );
    return true;
  } catch (e) {
    console.error('Failed to load window region bindings:', e);
    return false;
  }
}

/**
 * Read HWND integer from the Buffer returned by getNativeWindowHandle().
 */
export function hwndFromBuffer(buf: Buffer): number {
  return buf.readUInt32LE(0);
}

function writePoint(buffer: Buffer, index: number, x: number, y: number): void {
  const offset = index * 8;
  buffer.writeInt32LE(Math.round(x), offset);
  buffer.writeInt32LE(Math.round(y), offset + 4);
}

/**
 * Apply the notched window region.
 * @param hwnd  Integer HWND (use hwndFromBuffer to convert)
 * @param width  Window width in logical pixels
 * @param height Window height in logical pixels
 * @param scaleFactor Display scale (e.g. 1.25 for 125%)
 */
export function applyNotchRegion(
  hwnd: number,
  width: number,
  height: number,
  scaleFactor: number
): void {
  if (!ensureLoaded()) return;

  if (width < MIN_WIDTH_FOR_NOTCH) {
    clearNotchRegion(hwnd);
    return;
  }

  const s = scaleFactor;
  const w = Math.round(width * s);
  const h = Math.round(height * s);
  const notchD = Math.round(NOTCH_DEPTH * s);
  const slopeW = Math.round(SLOPE_WIDTH * s);
  const shelf = Math.round((width - NOTCH_WIDTH - 2 * SLOPE_WIDTH) / 2 * s);

  // 8-point polygon: sides sit lower (y=depth), center ridge at y=0
  //
  //          shelf+slope              w-shelf-slope
  //               ________________________
  //              /                        \
  //  (0,depth)  /                          \  (w,depth)
  //  |_________/                            \__________|
  //  |                                                 |
  //  |_________________________________________________|
  //
  const points = Buffer.allocUnsafe(8 * 8);
  let i = 0;
  writePoint(points, i++, 0, notchD);
  writePoint(points, i++, shelf, notchD);
  writePoint(points, i++, shelf + slopeW, 0);
  writePoint(points, i++, w - shelf - slopeW, 0);
  writePoint(points, i++, w - shelf, notchD);
  writePoint(points, i++, w, notchD);
  writePoint(points, i++, w, h);
  writePoint(points, i++, 0, h);

  const ALTERNATE = 1;
  const hrgn = CreatePolygonRgn!(points, 8, ALTERNATE);
  if (!hrgn) {
    console.error('CreatePolygonRgn returned null');
    return;
  }

  SetWindowRgn!(hwnd, hrgn, 1);

  // After a successful SetWindowRgn, the system owns the region handle.
}

/**
 * Clear the custom region (full rectangle). Used when maximized.
 */
export function clearNotchRegion(hwnd: number): void {
  if (!ensureLoaded()) return;
  // Passing NULL resets to the default (full) region. The system frees the old one.
  SetWindowRgn!(hwnd, null, 1);
}
