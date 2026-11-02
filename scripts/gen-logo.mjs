// 生成 ShuaTiLa Logo A 方案（透明背景版）：几何负形「翻书 + 对勾镂空」+ 刷题啦字标
// 关键：对勾用 dest-out 混合从钴蓝书形中真正擦除为透明镂空（亮/暗背景都读作负形）。
import sharp from "sharp";

const COBALT = "#1E4FD6"; // 钴蓝主色
const BOOK =
  "M 84 270 C 66 206, 76 132, 94 108 C 136 86, 176 100, 200 140 " +
  "C 224 100, 264 86, 306 108 C 324 132, 334 206, 316 270 " +
  "C 264 290, 136 290, 84 270 Z";
const CHECK = "M 150 200 L 184 234 L 268 150"; // 对勾（描边）

const svg = (size, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="${inner.transform}">${inner.body}</g></svg>`;

// 在 size×size 画布上，按 transform 渲染「钴蓝书形 − 透明对勾镂空」
async function buildMarkAt(size, transform) {
  const book = await sharp(
    Buffer.from(svg(size, { transform, body: `<path d="${BOOK}" fill="${COBALT}"/>` }))
  ).png().toBuffer();
  const chk = await sharp(
    Buffer.from(
      svg(size, {
        transform,
        body: `<path d="${CHECK}" stroke="black" stroke-width="32" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      })
    )
  ).png().toBuffer();
  return sharp(book).composite([{ input: chk, blend: "dest-out" }]).png().toBuffer();
}

// 标记居中（留 11% 边距）
const markTransform = (size) => {
  const k = (size - 2 * (size * 0.11)) / 400;
  const off = (size - 400 * k) / 2;
  return `translate(${off},${off}) scale(${k})`;
};

async function buildFull(size) {
  const k = (size * 0.58) / 400;
  const offX = (size - 400 * k) / 2;
  const offY = size * 0.07;
  const mark = await buildMarkAt(size, `translate(${offX},${offY}) scale(${k})`);
  const fontPx = size * 0.168;
  const textY = size * 0.81;
  const text = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        `<text x="${size / 2}" y="${textY}" font-family="Microsoft YaHei, SimHei, sans-serif" font-weight="700" ` +
        `font-size="${fontPx}" text-anchor="middle" fill="${COBALT}" letter-spacing="${fontPx * 0.04}">刷题啦</text></svg>`
    )
  ).png().toBuffer();
  return sharp(mark).composite([{ input: text, blend: "over" }]).png().toBuffer();
}

async function save(buf, out) {
  await sharp(buf).png().toFile(out);
  console.log("saved", out);
}

await save(await buildMarkAt(512, markTransform(512)), "app/icon.png"); // favicon（透明）
await save(await buildMarkAt(512, markTransform(512)), "public/brand-icon.png"); // 侧栏（透明）
await save(await buildFull(1024), "public/logo.png"); // 登录页（透明，含字标）
console.log("done");
