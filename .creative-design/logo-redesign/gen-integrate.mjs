// 从候选图 A 派生集成产物（忠实还原 A 方案外观）
import sharp from "sharp";
import path from "node:path";

const SRC = "D:/project/ShuaTiLa/.creative-design/logo-redesign/cands/a.jpg";
const OUT = "D:/project/ShuaTiLa";
const DBG = "D:/project/ShuaTiLa/.creative-design/logo-redesign";

const book = { left: 381, top: 492, right: 1667, bottom: 1037 };
const cw = book.right - book.left;
const ch = book.bottom - book.top;
const side = Math.max(cw, ch);
const cx = Math.round((book.left + book.right) / 2);
const cy = Math.round((book.top + book.bottom) / 2);
const cropLeft = Math.max(0, cx - Math.floor(side / 2));
const cropTop = Math.max(0, cy - Math.floor(side / 2));

// 圆角 alpha（dest-in 裁切到圆角矩形）
const roundedAlpha = Buffer.from(
  `<svg width="512" height="512"><rect x="0" y="0" width="512" height="512" rx="72" fill="#fff"/></svg>`
);

// 1) 登录页主标：候选图 A 全图 → 1024
await sharp(SRC).resize(1024, 1024, { fit: "fill" }).png().toFile(path.join(OUT, "public", "logo.png"));
console.log("saved public/logo.png (1024)");

// 2) 侧栏/favicon：书本标记 米色圆角瓦片 → 512
const tile = await sharp(SRC)
  .extract({ left: cropLeft, top: cropTop, width: side, height: side })
  .resize(512, 512, { fit: "fill" })
  .composite([{ input: roundedAlpha, blend: "dest-in" }])
  .png()
  .toBuffer();
await sharp(tile).toFile(path.join(OUT, "public", "brand-icon.png"));
await sharp(tile).toFile(path.join(OUT, "app", "icon.png"));
console.log("saved brand-icon.png + app/icon.png (512)");

// 3) 预览：26px / 64px / 150px
await sharp(tile).resize(26, 26).png().toFile(path.join(DBG, "_pv26.png"));
await sharp(tile).resize(64, 64).png().toFile(path.join(DBG, "_pv64.png"));
await sharp(path.join(OUT, "public", "logo.png")).resize(150).png().toFile(path.join(DBG, "_pv150.png"));
console.log("previews saved. crop:", cropLeft, cropTop, side);
