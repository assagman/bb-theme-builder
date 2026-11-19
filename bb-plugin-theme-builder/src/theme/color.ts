export type Oklch = { l: number; c: number; h: number };

/** The only color form themes store: lowercase `#rrggbb`, so equality checks never see two spellings of one color. */
export const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const HEX_CHANNEL_DIGITS = 2;
const CHANNEL_STARTS = [1, 3, 5];
const SRGB_THRESHOLD = 0.04045;
const SRGB_LINEAR_THRESHOLD = 0.0031308;
const SRGB_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_EXPONENT = 2.4;
const SRGB_INVERSE_EXPONENT = 1 / SRGB_EXPONENT;
const DEGREES_PER_TURN = 360;
const HALF_TURN = 180;
const UNIT_MIN = 0;
const UNIT_MAX = 1;
// Tolerance for float drift at gamut edges; stricter would reject in-gamut colors.
const GAMUT_EPSILON = 1e-6;
// Bisection depth: 2^-24 of the chroma range is far below one 8-bit step.
const GAMUT_BISECTION_STEPS = 24;
// Below this chroma the hue is numerically meaningless, so it is pinned to 0.
const ACHROMATIC_CHROMA = 1e-4;
const CUBE_EXPONENT = 3;

// Bjorn Ottosson's OKLab matrices (linear sRGB -> LMS -> OKLab and inverses).
const RGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_LAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const LAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LMS_TO_RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

type Vec3 = [number, number, number];

/** Raised for colors that cannot be converted, so bad input never becomes a malformed hex that schemas later reject far from the cause. */
export class InvalidColorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidColorError";
  }
}

/** Applies a 3x3 matrix; the OKLab pipeline is a chain of these, so one helper keeps each stage declarative. */
function multiply(matrix: number[][], vector: Vec3): Vec3 {
  return matrix.map(
    (row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2],
  ) as Vec3;
}

/** Decodes an sRGB gamma channel because lightness math is only correct on linear light. */
function toLinear(channel: number): number {
  return channel <= SRGB_THRESHOLD
    ? channel / SRGB_DIVISOR
    : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT;
}

/** Re-encodes linear light to sRGB gamma so output matches what screens and the contrast checker decode. */
function fromLinear(channel: number): number {
  return channel <= SRGB_LINEAR_THRESHOLD
    ? channel * SRGB_DIVISOR
    : SRGB_SCALE * channel ** SRGB_INVERSE_EXPONENT - SRGB_OFFSET;
}

/** Normalizes any angle into [0, 360) so hue arithmetic never yields negative or overflowing values. */
export function wrapHue(hue: number): number {
  return ((hue % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN;
}

/**
 * Decodes `#rrggbb` to linear-light channels. Shared by OKLCH conversion and
 * the WCAG luminance so both agree on one sRGB definition. Throws on
 * malformed input instead of propagating NaN.
 */
export function hexToLinearRgb(hex: string): Vec3 {
  const channels = CHANNEL_STARTS.map(
    (start) =>
      Number.parseInt(hex.slice(start, start + HEX_CHANNEL_DIGITS), HEX_RADIX) /
      CHANNEL_MAX,
  );
  if (channels.some((channel) => !Number.isFinite(channel))) {
    throw new InvalidColorError(`Not a #rrggbb color: ${JSON.stringify(hex)}`);
  }
  return channels.map(toLinear) as Vec3;
}

/** Converts `#rrggbb` to OKLCH so palettes can be shaped by perceptual lightness. */
export function hexToOklch(hex: string): Oklch {
  const lms = multiply(RGB_TO_LMS, hexToLinearRgb(hex)).map(Math.cbrt) as Vec3;
  const [l, a, b] = multiply(LMS_TO_LAB, lms);
  const c = Math.hypot(a, b);
  const hue =
    c < ACHROMATIC_CHROMA ? 0 : (Math.atan2(b, a) * HALF_TURN) / Math.PI;
  return { l, c, h: wrapHue(hue) };
}

/** Projects OKLCH back to linear sRGB; channels may fall outside [0, 1], which is how gamut membership is detected. */
function toLinearRgb({ l, c, h }: Oklch): Vec3 {
  const radians = (h * Math.PI) / HALF_TURN;
  const lms = multiply(LAB_TO_LMS, [
    l,
    c * Math.cos(radians),
    c * Math.sin(radians),
  ]).map((value) => value ** CUBE_EXPONENT) as Vec3;
  return multiply(LMS_TO_RGB, lms);
}

/** Tells whether a color is displayable in sRGB, so chroma can be reduced only when it must. */
function inGamut(color: Oklch): boolean {
  return toLinearRgb(color).every(
    (channel) =>
      channel >= UNIT_MIN - GAMUT_EPSILON &&
      channel <= UNIT_MAX + GAMUT_EPSILON,
  );
}

/**
 * Converts OKLCH to lowercase `#rrggbb`. Out-of-gamut colors lose chroma (not
 * lightness or hue) so the contrast the caller computed on lightness survives.
 * Throws on non-finite components to avoid emitting a `#NaN...` color.
 */
export function oklchToHex(color: Oklch): string {
  if (![color.l, color.c, color.h].every(Number.isFinite)) {
    throw new InvalidColorError(
      `Non-finite OKLCH component: ${JSON.stringify(color)}`,
    );
  }
  const lightness = Math.min(UNIT_MAX, Math.max(UNIT_MIN, color.l));
  let chroma = Math.max(UNIT_MIN, color.c);
  if (!inGamut({ l: lightness, c: chroma, h: color.h })) {
    let low = UNIT_MIN;
    let high = chroma;
    for (let step = 0; step < GAMUT_BISECTION_STEPS; step += 1) {
      const middle = (low + high) / 2;
      if (inGamut({ l: lightness, c: middle, h: color.h })) {
        low = middle;
      } else {
        high = middle;
      }
    }
    chroma = low;
  }
  return `#${toLinearRgb({ l: lightness, c: chroma, h: color.h })
    .map((channel) => {
      const encoded = Math.round(
        fromLinear(Math.min(UNIT_MAX, Math.max(UNIT_MIN, channel))) *
          CHANNEL_MAX,
      );
      return encoded.toString(HEX_RADIX).padStart(HEX_CHANNEL_DIGITS, "0");
    })
    .join("")}`;
}
