/**
 * Regenerate docs/diagrams/ingest-youtube-x.excalidraw from ingest-youtube-x.md (Mermaid).
 * Run: node scripts/generate-ingest-youtube-x-excalidraw.mjs
 */
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const rid = () => randomBytes(9).toString("hex");
const n = () => Math.floor(Math.random() * 2 ** 31);

const strokeBlue = "#1971c2";
const fillBlue = "#e7f5ff";
const strokeArrow = "#495057";
const green = { stroke: "#2f9e44", bg: "#b2f2bb" };
const yellow = { stroke: "#f08c00", bg: "#ffec99" };

function baseShape() {
  return {
    angle: 0,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    version: 1,
    isDeleted: false,
    updated: 1,
    link: null,
    locked: false,
  };
}

function rect(x, y, w, h, label, colors = { stroke: strokeBlue, bg: fillBlue }) {
  const id = rid();
  const tid = rid();
  const lines = label.split("\n");
  const th = Math.max(24, lines.length * 22);
  const r = {
    id,
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
    strokeColor: colors.stroke,
    backgroundColor: colors.bg,
    roundness: { type: 3 },
    seed: n(),
    versionNonce: n(),
    boundElements: [{ id: tid, type: "text" }],
    ...baseShape(),
  };
  const t = {
    id: tid,
    type: "text",
    x: x + 12,
    y: y + h / 2 - th / 2,
    width: w - 24,
    height: th,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    roundness: { type: 3 },
    seed: n(),
    versionNonce: n(),
    boundElements: [],
    text: lines.join("<br>"),
    fontSize: 16,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: id,
    originalText: lines.join("<br>"),
    autoResize: true,
    lineHeight: 1.25,
    ...baseShape(),
  };
  return { shape: r, text: t, cx: x + w / 2, cy: y + h / 2, top: y, bottom: y + h, left: x, right: x + w };
}

function diamond(x, y, w, h, label) {
  const id = rid();
  const tid = rid();
  const d = {
    id,
    type: "diamond",
    x,
    y,
    width: w,
    height: h,
    strokeColor: strokeBlue,
    backgroundColor: fillBlue,
    roundness: { type: 3 },
    seed: n(),
    versionNonce: n(),
    boundElements: [{ id: tid, type: "text" }],
    ...baseShape(),
  };
  const t = {
    id: tid,
    type: "text",
    x: x + w * 0.12,
    y: y + h / 2 - 14,
    width: w * 0.76,
    height: 28,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    roundness: { type: 3 },
    seed: n(),
    versionNonce: n(),
    boundElements: [],
    text: label,
    fontSize: 16,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: id,
    originalText: label,
    autoResize: true,
    lineHeight: 1.25,
    ...baseShape(),
  };
  return { shape: d, text: t, cx: x + w / 2, cy: y + h / 2, top: y, bottom: y + h, left: x, right: x + w };
}

/** @param {[number, number]} fixedPoint normalized anchor on bound shape */
function bindTo(elementId, fixedPoint) {
  return { elementId, focus: 0, gap: 4, fixedPoint };
}

function arrowEl(sx, sy, ex, ey, startB = null, endB = null) {
  const minX = Math.min(sx, ex);
  const minY = Math.min(sy, ey);
  const maxX = Math.max(sx, ex);
  const maxY = Math.max(sy, ey);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const id = rid();
  return {
    id,
    type: "arrow",
    x: minX,
    y: minY,
    width: w,
    height: h,
    angle: 0,
    strokeColor: strokeArrow,
    backgroundColor: "transparent",
    roundness: { type: 2 },
    seed: n(),
    versionNonce: n(),
    boundElements: [],
    points: [
      [sx - minX, sy - minY],
      [ex - minX, ey - minY],
    ],
    lastCommittedPoint: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    startBinding: startB,
    endBinding: endB,
    ...baseShape(),
  };
}

function pushArrowBinding(shape, arrowId) {
  shape.boundElements.push({ id: arrowId, type: "arrow" });
}

function labelText(x, y, w, h, text, opts = {}) {
  const fontSize = opts.fontSize ?? 14;
  const strokeColor = opts.strokeColor ?? "#495057";
  return {
    id: rid(),
    type: "text",
    x,
    y,
    width: w,
    height: h,
    strokeColor,
    backgroundColor: "transparent",
    roundness: { type: 3 },
    seed: n(),
    versionNonce: n(),
    boundElements: [],
    text,
    fontSize,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
    ...baseShape(),
  };
}

const CX = 520;
const BW = 260;
const BH = 52;

const elements = [];

const title = labelText(
  CX - 240,
  12,
  480,
  48,
  "Luồng ingest: YouTube & X → Obsidian vault<br>(high-level pipeline)",
  { fontSize: 18, strokeColor: "#212529" },
);
elements.push(title);

const cli = rect(CX - BW / 2, 56, BW, BH, "CLI: ingest URL");
const run = rect(CX - BW / 2, 136, BW, BH, "runIngest()");
const route = diamond(CX - 110, 228, 220, 72, "config/routing.yaml");
elements.push(cli.shape, cli.text, run.shape, run.text, route.shape, route.text);

const yt = rect(48, 340, 280, BH, "ingestYouTubeViaApify()", green);
const af = rect(48, 420, 280, BH, "Apify + APIFY_TOKEN", green);
const b1 = rect(48, 500, 280, 64, "CaptureBundle\ntranscript", green);

const xb = rect(712, 340, 280, BH, "fetchXThread()", green);
const api = rect(712, 420, 280, 64, "X API v2 + X_BEARER_TOKEN", green);
const x2 = rect(712, 508, 280, 56, "note_tweet / article / link", green);
const py = rect(712, 588, 280, 72, "fetch-x-article.py\ntwitter-cli + cookies", green);
const b2 = rect(712, 684, 280, 64, "CaptureBundle\nmarkdown + images", green);

elements.push(
  yt.shape,
  yt.text,
  af.shape,
  af.text,
  b1.shape,
  b1.text,
  xb.shape,
  xb.text,
  api.shape,
  api.text,
  x2.shape,
  x2.text,
  py.shape,
  py.text,
  b2.shape,
  b2.text,
);

const wn = rect(CX - BW / 2, 784, BW, 64, "writeCapture → source.md, note.md");
const img = rect(CX - BW / 2, 872, BW, BH, "downloadImagesToAssets");
const llm = diamond(CX - 100, 952, 200, 64, "OpenAI enrich?");
const out = rect(CX - BW / 2, 1044, BW, BH, "vault/Captures/…", yellow);

elements.push(wn.shape, wn.text, img.shape, img.text, llm.shape, llm.text, out.shape, out.text);

function pushBoundArrow(sx, sy, ex, ey, fromShape, toShape) {
  const a = arrowEl(sx, sy, ex, ey, bindTo(fromShape.id, [0.5, 1]), bindTo(toShape.id, [0.5, 0]));
  elements.push(a);
  pushArrowBinding(fromShape, a.id);
  pushArrowBinding(toShape, a.id);
}

pushBoundArrow(cli.cx, cli.bottom, run.cx, run.top, cli.shape, run.shape);
pushBoundArrow(run.cx, run.bottom, route.cx, route.top, run.shape, route.shape);

pushBoundArrow(route.cx, route.bottom, yt.cx, yt.top, route.shape, yt.shape);
pushBoundArrow(route.cx, route.bottom, xb.cx, xb.top, route.shape, xb.shape);
elements.push(labelText(180, 304, 140, 24, "youtube.com / youtu.be"));
elements.push(labelText(780, 304, 120, 24, "x.com / twitter.com"));

pushBoundArrow(yt.cx, yt.bottom, af.cx, af.top, yt.shape, af.shape);
pushBoundArrow(af.cx, af.bottom, b1.cx, b1.top, af.shape, b1.shape);

pushBoundArrow(xb.cx, xb.bottom, api.cx, api.top, xb.shape, api.shape);
pushBoundArrow(api.cx, api.bottom, x2.cx, x2.top, api.shape, x2.shape);
pushBoundArrow(x2.cx, x2.bottom, py.cx, py.top, x2.shape, py.shape);
pushBoundArrow(py.cx, py.bottom, b2.cx, b2.top, py.shape, b2.shape);

pushBoundArrow(b1.cx, b1.bottom, wn.cx, wn.top, b1.shape, wn.shape);
pushBoundArrow(b2.cx, b2.bottom, wn.cx, wn.top, b2.shape, wn.shape);

pushBoundArrow(wn.cx, wn.bottom, img.cx, img.top, wn.shape, img.shape);
pushBoundArrow(img.cx, img.bottom, llm.cx, llm.top, img.shape, llm.shape);
pushBoundArrow(llm.cx, llm.bottom, out.cx, out.top, llm.shape, out.shape);

const file = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: 20,
  },
  files: {},
};

const outPath = new URL("../docs/diagrams/ingest-youtube-x.excalidraw", import.meta.url);
writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath.pathname} (${elements.length} elements)`);
