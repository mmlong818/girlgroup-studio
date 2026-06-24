// 出道发布会 — 全屏暗场揭晓动画 + 彩带
import { esc } from './ui.js';

export function playReveal(concept) {
  return new Promise((resolve) => {
    const stage = document.createElement('div');
    stage.className = 'reveal-stage';
    stage.innerHTML = `
      <canvas id="rv-canvas"></canvas>
      <button class="rv-skip">跳过 ›</button>
      <div class="rv-label">DEBUT · 出道发布会</div>
      <div class="rv-members">${concept.members.map((m) => `
        <div class="rv-card" style="--mc:${esc(m.color)}">
          <div class="rv-orb">${esc(m.codename.slice(0, 1))}</div>
          <div class="rv-name">${esc(m.codename)}</div>
          <div class="rv-arch">${esc(m.archetype)}</div>
        </div>`).join('')}</div>
      <div class="rv-title">${esc(concept.name)}</div>
      <div class="rv-slogan">「${esc(concept.slogan)}」</div>
      <div class="rv-enter"><button class="btn btn-primary btn-big">✦ 进入企划工作台</button></div>`;
    document.body.appendChild(stage);

    const cards = stage.querySelectorAll('.rv-card');
    cards.forEach((c, i) => setTimeout(() => c.classList.add('in'), 500 + i * 550));
    const titleAt = 500 + cards.length * 550 + 300;
    setTimeout(() => {
      stage.querySelector('.rv-title').classList.add('in');
      stage.querySelector('.rv-slogan').classList.add('in');
      stage.querySelector('.rv-enter').classList.add('in');
      confetti(stage.querySelector('#rv-canvas'), [...cards].map((c) => getComputedStyle(c).getPropertyValue('--mc').trim()));
    }, titleAt);

    const finish = () => { stage.remove(); resolve(); };
    stage.querySelector('.rv-enter button').onclick = finish;
    stage.querySelector('.rv-skip').onclick = finish;
    // 兜底：无论动画是否正常，10 秒后强制显示所有元素和按钮
    setTimeout(() => {
      stage.querySelectorAll('.rv-card, .rv-title, .rv-slogan, .rv-enter').forEach((el) => el.classList.add('in'));
    }, titleAt + 4000);
  });
}

function confetti(canvas, colors) {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  const parts = Array.from({ length: 140 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.5,
    y: canvas.height * 0.55,
    vx: (Math.random() - 0.5) * 11,
    vy: -(Math.random() * 13 + 5),
    w: Math.random() * 9 + 4,
    h: Math.random() * 5 + 3,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)] || '#ff9ecb',
  }));
  let frame = 0;
  (function tick() {
    if (frame++ > 260) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / 260);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(tick);
  })();
}
