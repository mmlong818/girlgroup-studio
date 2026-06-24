// 成团卡 — Canvas 绘制可分享的卡片图
import { modal, download, esc } from './ui.js';

export function showGroupCard(G) {
  const canvas = document.createElement('canvas');
  drawCard(canvas, G);
  const dataUrl = canvas.toDataURL('image/png');
  modal(`<h3>🎴 成团卡</h3>
    <img src="${dataUrl}" style="width:100%;border-radius:14px;box-shadow:var(--shadow-m)" alt="成团卡">
    <div class="m-foot">
      <button class="btn btn-ghost" data-x>关闭</button>
      <button class="btn btn-primary" data-dl>⬇ 保存图片</button>
    </div>`,
    { onMount: (mask, close) => {
      mask.querySelector('[data-x]').onclick = close;
      mask.querySelector('[data-dl]').onclick = () => download(`${G.data.concept.name}-成团卡.png`, dataUrl);
    } });
}

function drawCard(canvas, G) {
  const c = G.data.concept;
  const members = c.members;
  const W = 1080, H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 暗场舞台背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#191232');
  bg.addColorStop(0.55, '#120c26');
  bg.addColorStop(1, '#0a0618');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 成员色光晕
  members.forEach((m, i) => {
    const x = (W / (members.length + 1)) * (i + 1);
    const glow = ctx.createRadialGradient(x, H * 0.32, 0, x, H * 0.32, 320);
    glow.addColorStop(0, hexA(m.color, 0.16));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  });

  const zh = (size, weight = 700) => `${weight} ${size}px "MiSans", "PingFang SC", "Microsoft YaHei UI", sans-serif`;
  ctx.textAlign = 'center';

  // 顶部标签
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = zh(26, 500);
  ctx.fillText('D E B U T', W / 2, 120);

  // 团名（渐变描色）
  const tg = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  tg.addColorStop(0, '#cdbcff');
  tg.addColorStop(0.5, '#ff9ecb');
  tg.addColorStop(1, '#ffd9a8');
  ctx.fillStyle = tg;
  const nameSize = c.name.length > 6 ? 96 : 120;
  ctx.font = zh(nameSize, 900);
  ctx.shadowColor = 'rgba(170,120,255,.55)';
  ctx.shadowBlur = 50;
  ctx.fillText(c.name, W / 2, 270);
  ctx.shadowBlur = 0;

  // 概念（自动换行）
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.font = zh(34, 400);
  wrapText(ctx, c.concept, W / 2, 360, W - 220, 52);

  // 成员球
  const orbY = 660;
  const gap = Math.min(190, (W - 140) / members.length);
  const startX = W / 2 - (gap * (members.length - 1)) / 2;
  members.forEach((m, i) => {
    const x = startX + i * gap;
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 44;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(x, orbY, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.font = zh(44, 800);
    ctx.fillText(m.codename.slice(0, 1), x, orbY + 16);
    ctx.font = zh(28, 700);
    ctx.fillText(m.codename, x, orbY + 116);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = zh(21, 400);
    ctx.fillText(m.archetype, x, orbY + 152);
  });

  // 气质标签
  const vibes = String(c.vibe || '').split(/[,，、]/).filter(Boolean).slice(0, 5);
  ctx.font = zh(26, 500);
  const tagY = 920;
  let totalW = 0;
  const pads = vibes.map((v) => { const w = ctx.measureText(v.trim()).width + 56; totalW += w + 16; return w; });
  let tx = W / 2 - totalW / 2 + 8;
  vibes.forEach((v, i) => {
    roundRect(ctx, tx, tagY - 30, pads[i], 52, 26);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText(v.trim(), tx + pads[i] / 2, tagY + 6);
    tx += pads[i] + 16;
  });

  // 口号
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `italic 400 30px "MiSans", "PingFang SC", "Microsoft YaHei UI", sans-serif`;
  wrapText(ctx, `「${c.slogan}」`, W / 2, 1040, W - 200, 44);

  // 底部
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.beginPath();
  ctx.moveTo(120, H - 150);
  ctx.lineTo(W - 120, H - 150);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = zh(26, 600);
  ctx.fillText('✦ 成团 StarForm · 虚拟偶像工坊', W / 2, H - 88);
}

function hexA(hex, a) {
  const m = hex?.match(/^#?([0-9a-f]{6})/i);
  if (!m) return `rgba(150,110,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const chars = [...String(text)];
  let line = '';
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, y);
      line = ch;
      y += lineH;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, y);
}
