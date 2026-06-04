// src/engine/mapping.ts

export interface RGB {
  r: number; // 0..255
  g: number;
  b: number;
}

export function complexFromMagPhase(mag: number, phase: number): { re: number; im: number } {
  return { re: mag * Math.cos(phase), im: mag * Math.sin(phase) };
}

export function magnitudeOf(re: number, im: number): number {
  return Math.hypot(re, im);
}

export function phaseOf(re: number, im: number): number {
  return Math.atan2(im, re);
}

/**
 * A phase colormap maps a phase in [-PI, PI] to an RGB color and back.
 * `fromRGB` is used by the k-space color/phase picker.
 */
export interface PhaseColormap {
  name: string;
  /** true if the map respects phase's -PI/+PI wrap. */
  cyclic: boolean;
  toRGB(phase: number): RGB;
  fromRGB(r: number, g: number, b: number): number;
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  // h in [0,360)
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/** Cyclic hue wheel: phase -> full-saturation hue. */
export const hueWheelColormap: PhaseColormap = {
  name: "Hue wheel (cyclic)",
  cyclic: true,
  toRGB(phase: number): RGB {
    const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360;
    return hsvToRgb(hue, 1, 1);
  },
  fromRGB(r: number, g: number, b: number): number {
    const hue = rgbToHue(r, g, b);
    return (hue / 360) * 2 * Math.PI - Math.PI;
  },
};

/** Red/blue diverging: not cyclic, has a documented seam at +/-PI. */
export const redBlueColormap: PhaseColormap = {
  name: "Red/blue (diverging)",
  cyclic: false,
  toRGB(phase: number): RGB {
    const t = (phase + Math.PI) / (2 * Math.PI); // 0..1
    return {
      r: Math.round(255 * (1 - t)),
      g: 0,
      b: Math.round(255 * t),
    };
  },
  fromRGB(r: number, _g: number, b: number): number {
    const t = b / (r + b || 1);
    return t * 2 * Math.PI - Math.PI;
  },
};

export const phaseColormaps: PhaseColormap[] = [hueWheelColormap, redBlueColormap];
