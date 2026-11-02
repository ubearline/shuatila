// 生成 ShuaTiLa Logo A 方案：几何负形「翻书对勾」+ 刷题啦字标
// 用真实中文字体渲染字标，矢量几何保证小尺寸清晰。
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const COBALT = "#1E4FD6"; // 钴蓝主色
const CREAM = "#FBF4E4"; // 奶油表面/负形
const INK = "#16307A"; // 深蓝墨（备用，未启用）

// 在 400x400 局部坐标系（中心 200,200）内定义「翻书 + 对勾负形」标记
function markFragment() {
  return `
  <!-- 翻书外形（钴蓝，两页上拱的开书剪影） -->
  <path d="M 84 270
           C 66 206, 76 132, 94 108
           C 136 86, 176 100, 200 140
           C 224 100, 264 86, 306 108
           C 324 132, 334 206, 316 270
           C 264 290, 136 290, 84 270 Z"
        fill="${COBALT}"/>
  <!-- 对勾负形（奶油描边，从书形中"挖"出对勾，居中不过界） -->
  <path d="M 150 200 L 184 234 L 268 150"
        fill="none" stroke="${CREAM}" stroke-width="32"
        stroke-linecap="round" stroke-linejoin="round"/>`;
}

function roundedBg(size) {
  const r = size * 0.18;
  return `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${CREAM}"/>`;
}

// 纯标记（favicon / 侧栏）：奶油圆角底 + 书+对勾
function markSVG(size = 512) {
  const k = (size - 2 * (size * 0.11)) / 400; // 留 11% 边距
  const off = (size - 400 * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${roundedBg(size)}
  <g transform="translate(${off},${off}) scale(${k})">${markFragment()}</g>
</svg>`;
}

// 完整主图（登录页）：上图下字
function fullSVG(size = 1024) {
  const k = (size * 0.58) / 400; // 标记占上部约 58%
  const offX = (size - 400 * k) / 2;
  const offY = size * 0.07;
  const textY = size * 0.81;
  const fontPx = size * 0.168;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${roundedBg(size)}
  <g transform="translate(${offX},${offY}) scale(${k})">${markFragment()}</g>
  <text x="${size / 2}" y="${textY}" font-family="Microsoft YaHei, SimHei, sans-serif"
        font-weight="700" font-size="${fontPx}" text-anchor="middle"
        fill="${COBALT}" letter-spacing="${fontPx * 0.04}">刷题啦</text>
</svg>`;
}

async function render(svg, out, size) {
  await sharp(Buffer.from(svg)).png().toFile(out);
  writeFileSync(out.replace(/\.png$/, ".svg"), svg); // 同时保留矢量源
  const { size: b } = await sharp(out).metadata();
  console.log(`saved ${out} (${b}px)`);
}

await render(markSVG(512), "app/icon.png", 512); // favicon
await render(markSVG(512), "public/brand-icon.png", 512); // 侧栏
await render(fullSVG(1024), "public/logo.png", 1024); // 登录页
console.log("done");
