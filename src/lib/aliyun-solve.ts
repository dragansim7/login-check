const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const ROOT_ID = "mirror-captcha-element";

function root(): HTMLElement | null {
  return document.getElementById(ROOT_ID);
}

function pick(suffix: string): HTMLElement | null {
  const scope: ParentNode = root() ?? document;
  return (
    scope.querySelector<HTMLElement>(`#aliyunCaptcha-${suffix}`) ??
    scope.querySelector<HTMLElement>(`[id$="-${suffix}"]`)
  );
}

function bgUrlOf(el: HTMLElement): string | null {
  const match = /url\((['"]?)([^'")]+)\1\)/.exec(getComputedStyle(el).backgroundImage || "");
  return match ? match[2] : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("captcha image failed to load"));
    img.src = src;
  });
}

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

type EdgeMap = { e: Float32Array; w: number; h: number };

function edgeMap(canvas: HTMLCanvasElement): EdgeMap {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      const gx =
        -gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1] +
        gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1];
      const gy =
        -gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1] +
        gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1];
      e[p] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { e, w, h };
}

type Mask = { xs: number[]; ys: number[]; w: number; h: number; minX: number };

function pieceMask(canvas: HTMLCanvasElement): Mask {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  const data = ctx.getImageData(0, 0, w, h).data;
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = w;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        xs.push(x);
        ys.push(y);
        if (x < minX) minX = x;
      }
    }
  }
  if (!xs.length) throw new Error("empty piece mask");
  return { xs, ys, w, h, minX };
}

function findOffset(bg: EdgeMap, piece: EdgeMap, mask: Mask): { left: number; score: number } {
  const n = mask.xs.length;
  const maxL = bg.w - mask.w;
  if (maxL < 1) throw new Error("piece wider than background");
  const scores = new Float32Array(maxL + 1);
  let best = -2;
  let bestL = 0;

  for (let L = 0; L <= maxL; L += 1) {
    let sumP = 0;
    let sumB = 0;
    for (let i = 0; i < n; i += 1) {
      sumP += piece.e[mask.ys[i] * piece.w + mask.xs[i]];
      sumB += bg.e[mask.ys[i] * bg.w + mask.xs[i] + L];
    }
    const meanP = sumP / n;
    const meanB = sumB / n;
    let num = 0;
    let dp = 0;
    let db = 0;
    for (let i = 0; i < n; i += 1) {
      const a = piece.e[mask.ys[i] * piece.w + mask.xs[i]] - meanP;
      const b = bg.e[mask.ys[i] * bg.w + mask.xs[i] + L] - meanB;
      num += a * b;
      dp += a * a;
      db += b * b;
    }
    const score = num / (Math.sqrt(dp * db) || 1);
    scores[L] = score;
    if (score > best) {
      best = score;
      bestL = L;
    }
  }

  const prev = bestL > 0 ? scores[bestL - 1] : best;
  const next = bestL < maxL ? scores[bestL + 1] : best;
  const denom = prev - 2 * best + next;
  const shift = denom ? clamp((0.5 * (prev - next)) / denom, -0.5, 0.5) : 0;
  return { left: bestL + shift, score: best };
}

type Driver = {
  down: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  up: (x: number, y: number) => void;
};

function mouseDriver(slider: HTMLElement): Driver {
  const fire = (target: EventTarget, type: string, x: number, y: number, buttons: number) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
      }),
    );
  };
  const rect = slider.getBoundingClientRect();
  const startTarget =
    document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) ?? slider;
  return {
    down: (x, y) => fire(startTarget, "mousedown", x, y, 1),
    move: (x, y) => fire(document.body, "mousemove", x, y, 1),
    up: (x, y) => fire(document.body, "mouseup", x, y, 0),
  };
}

function pointerDriver(slider: HTMLElement): Driver {
  const fire = (target: EventTarget, type: string, x: number, y: number, buttons: number) => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  };
  const rect = slider.getBoundingClientRect();
  const startTarget =
    document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) ?? slider;
  return {
    down: (x, y) => fire(startTarget, "pointerdown", x, y, 1),
    move: (x, y) => fire(document.body, "pointermove", x, y, 1),
    up: (x, y) => fire(document.body, "pointerup", x, y, 0),
  };
}

type SolveResult = { ok: true; dist: number; score: number } | { ok: false; reason: string };

async function drag(slider: HTMLElement, pieceEl: HTMLElement, dist: number): Promise<SolveResult> {
  const rect = slider.getBoundingClientRect();
  const x0 = rect.left + rect.width / 2;
  const y0 = rect.top + rect.height / 2;
  const before = pieceEl.getBoundingClientRect().left;

  let drive = mouseDriver(slider);
  drive.down(x0, y0);
  await sleep(20);
  drive.move(x0 + 1, y0);
  await sleep(60);

  if (Math.abs(pieceEl.getBoundingClientRect().left - before) < 0.5) {
    drive.up(x0 + 1, y0);
    await sleep(150);
    drive = pointerDriver(slider);
    drive.down(x0, y0);
    await sleep(20);
    drive.move(x0 + 1, y0);
    await sleep(60);
    if (Math.abs(pieceEl.getBoundingClientRect().left - before) < 0.5) {
      drive.up(x0 + 1, y0);
      return { ok: false, reason: "the puzzle ignored synthetic input" };
    }
  }

  const target = Math.max(1, dist - 1);
  const steps = 26 + Math.floor(Math.random() * 12);
  const ease = (t: number) => 1 - Math.pow(1 - t, 2.4);
  let dy = 0;

  for (let i = 1; i <= steps; i += 1) {
    dy = clamp(dy + rand(-0.8, 0.8), -2.5, 2.5);
    drive.move(x0 + 1 + target * ease(i / steps), y0 + dy);
    await sleep(rand(8, 26));
  }

  await sleep(rand(140, 280));
  drive.move(x0 + 1 + target + rand(-0.6, 0.6), y0 + dy);
  await sleep(rand(40, 90));
  drive.up(x0 + 1 + target, y0 + dy);
  return { ok: true, dist, score: 0 };
}

async function solveOnce(settleMs: number): Promise<SolveResult> {
  const started = Date.now();
  const bgEl = pick("img");
  const pieceEl = pick("puzzle");
  const slider = pick("sliding-slider");
  if (!bgEl || !pieceEl || !slider) return { ok: false, reason: "widget is missing pieces" };

  const bgSrc = bgUrlOf(bgEl);
  const pieceSrc = bgUrlOf(pieceEl);
  if (!bgSrc || !pieceSrc) return { ok: false, reason: "no image data yet" };

  let bg: EdgeMap;
  let piece: EdgeMap;
  let mask: Mask;
  try {
    const bgCanvas = toCanvas(await loadImage(bgSrc));
    const pieceCanvas = toCanvas(await loadImage(pieceSrc));
    bg = edgeMap(bgCanvas);
    piece = edgeMap(pieceCanvas);
    mask = pieceMask(pieceCanvas);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "image read failed" };
  }

  const found = findOffset(bg, piece, mask);
  if (found.score < 0.15) return { ok: false, reason: `weak match ${found.score.toFixed(2)}` };

  const displayW = bgEl.getBoundingClientRect().width;
  const dist = (found.left - mask.minX) * (displayW / bg.w);
  if (dist < 4) return { ok: false, reason: "offset too small" };

  const waited = Date.now() - started;
  if (waited < settleMs) await sleep(settleMs - waited);

  const result = await drag(slider, pieceEl, dist);
  return result.ok ? { ok: true, dist, score: found.score } : result;
}

export type CaptchaSolver = { stop: () => void };

export function autoSolve(options: { onNote?: (note: string) => void; maxSolves?: number } = {}): CaptchaSolver {
  const { onNote, maxSolves = 4 } = options;
  let stopped = false;
  let lastSrc = "";
  let solves = 0;

  void (async () => {
    while (!stopped) {
      const deadline = Date.now() + 2500;
      let bgSrc: string | null = null;
      while (!stopped && Date.now() < deadline) {
        const bgEl = pick("img");
        const pieceEl = pick("puzzle");
        bgSrc = bgEl && pieceEl ? bgUrlOf(bgEl) : null;
        if (bgSrc) break;
        await sleep(100);
      }
      if (stopped) return;
      if (!bgSrc) {
        onNote?.("No puzzle appeared. Solve it by hand.");
        return;
      }
      if (bgSrc === lastSrc) {
        await sleep(250);
        continue;
      }
      lastSrc = bgSrc;
      solves += 1;
      if (solves > maxSolves) {
        onNote?.("Auto-solve gave up. Solve it by hand.");
        return;
      }
      const result = await solveOnce(950);
      if (stopped) return;
      if (!result.ok) onNote?.(`Auto-solve: ${result.reason}.`);
      await sleep(600);
    }
  })();

  return {
    stop: () => {
      stopped = true;
    },
  };
}

export async function openPuzzle(
  trigger: HTMLElement,
  markOpened: () => void,
  timeoutMs = 4000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    trigger.click();
    markOpened();
    for (let i = 0; i < 10; i += 1) {
      await sleep(100);
      if (pick("img") && pick("puzzle")) return true;
    }
  }
  return false;
  }
