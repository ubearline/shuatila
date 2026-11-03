// 定位钴蓝书本标记 + 观察对勾颜色
import sharp from "sharp";

const SRC = "D:/project/ShuaTiLa/.creative-design/logo-redesign/cands/a.jpg";
const { data, info: ri } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = ri.width, H = ri.height, C = ri.channels;
const px = (x, y) => [data[(y * W + x) * C], data[(y * W + x) * C + 1], data[(y * W + x) * C + 2]];

// 钴蓝：B 显著大于 R/G
function isBlue(p){ return p[2] - Math.max(p[0], p[1]) > 25; }
// 亮白：R≈G≈B 且都高，且 B 不占优（区别于蓝）
function isWhite(p){ const mx=Math.max(...p),mn=Math.min(...p); return mx>235 && (mx-mn)<16; }

let minX=W,minY=H,maxX=0,maxY=0;
const blueBand = new Map();
for (let y=0;y<H;y++){
  let rowBlue=0,rowWhite=0;
  for (let x=0;x<W;x++){
    const p=px(x,y);
    if (isBlue(p)){ rowBlue++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
    if (isWhite(p)) rowWhite++;
  }
  if (rowBlue>0) blueBand.set(y, {blue:rowBlue, white:rowWhite});
}
console.log("blue bbox:", minX, minY, maxX, maxY);
// 打印蓝色像素逐 64px 带分布（区分书本与字标）
const bands=[];
let cur=null;
for (let y=0;y<H;y++){
  if (blueBand.has(y)){
    if (!cur) cur={start:y, rows:0, maxBlue:0, hasWhite:false};
    cur.rows++;
    cur.maxBlue=Math.max(cur.maxBlue, blueBand.get(y).blue);
    if (blueBand.get(y).white>0) cur.hasWhite=true;
  } else if (cur){ cur.end=y-1; bands.push(cur); cur=null; }
}
if (cur){ cur.end=H-1; bands.push(cur); }
console.log("blue clusters (yStart-yEnd, rows, maxBluePerRow, hasWhiteInRow):");
for (const b of bands) console.log(`  ${b.start}-${b.end}  rows=${b.rows} maxBlue=${b.maxBlue} hasWhite=${b.hasWhite}`);

// 采样书本中心区域颜色（找对勾）——取书本簇中部横切采样
if (bands.length){
  const book = bands[0]; // 假定第一个(顶部)簇是书本
  const midY = Math.floor((book.start+book.end)/2);
  const out=[];
  for (let x=Math.floor(W*0.2); x<Math.floor(W*0.8); x+=24){
    const p=px(x,midY);
    out.push(`${x}:${p.join(",")}${isBlue(p)?"[B]":isWhite(p)?"[W]":""}`);
  }
  console.log("book midY", midY, "samples:");
  console.log("  "+out.join("  "));
}
