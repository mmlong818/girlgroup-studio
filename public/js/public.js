// 公开出道页
import { t } from './i18n.js';
import { lightbox } from './ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = document.getElementById('pub');

async function load() {
  const shareId = location.pathname.split('/').filter(Boolean)[1];
  let group;
  try {
    const res = await fetch(`/api/public/${shareId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    group = data.group;
  } catch (e) {
    el.innerHTML = `<div style="text-align:center;padding:120px 0;color:rgba(255,255,255,.6)">
      <div style="font-size:50px;margin-bottom:14px">🌙</div>${esc(e.message || t('页面不存在'))}</div>`;
    return;
  }

  const d = group.data;
  const c = d.concept;
  document.title = `${c.name} · ${t('出道页')}`;
  document.body.style.setProperty('--pc1', mix(c.mainColor));

  const memberPhoto = (m) => {
    const img = group.images.find((i) => i.member === m.codename && i.isPrimary);
    return img
      ? `<img src="${esc(img.url)}" alt="${esc(m.codename)}">`
      : `<div class="pm-orb" style="--mc:${esc(m.color)};background:${esc(m.color)}">${esc(m.codename.slice(0, 1))}</div>`;
  };

  const posterImg = group.images.find((i) => i.member === '' && i.isPrimary);

  el.innerHTML = `
    <div class="pub-hero">
      <div class="ph-fandom">${esc(c.fandomName || '')} · ${t('应援中')}</div>
      <h1>${esc(c.name)}</h1>
      <div class="ph-concept">${esc(c.concept)}</div>
      <div>${String(c.vibe || '').split(/[,，、]/).filter(Boolean).map((v) => `<span class="badge">${esc(v.trim())}</span>`).join('')}</div>
      <div class="ph-slogan">「${esc(c.slogan)}」</div>
    </div>

    ${posterImg ? `<div class="pub-sec"><img src="${esc(posterImg.url)}" style="width:100%;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)" alt="海报"></div>` : ''}

    <div class="pub-sec">
      <h2>M E M B E R S</h2>
      <div class="pub-members">${d.members.map((m, i) => {
        const p = m.profile || {};
        const oneLine = (c.members[i] && c.members[i].oneLine) || m.fanAppeal || m.contrast || '';
        const stats = [p.birthday, p.mbti, p.height].filter(Boolean);
        return `
        <div class="pub-mcard" style="--mc:${esc(m.color)};--ph:linear-gradient(150deg,${esc(m.color)}33,#16102e)">
          <div class="pm-photo">${memberPhoto(m)}</div>
          <div class="pm-info">
            <h3>${esc(m.codename)}${p.realName && p.realName !== m.codename ? `<span class="pm-real">${esc(p.realName)}</span>` : ''}</h3>
            <div class="pm-arch">${esc(p.position || m.archetype)}</div>
            ${stats.length ? `<div class="pm-stats">${stats.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
            <div class="pm-line">${esc(oneLine)}</div>
          </div>
        </div>`;
      }).join('')}</div>
    </div>

    <div class="pub-sec">
      <h2>U N I V E R S E</h2>
      <div class="pub-card"><h3>${t('世界观')}</h3><p>${esc(c.worldview)}</p></div>
      ${d.story ? `<div class="pub-card"><h3>${t('TA们的故事')}</h3><p>${esc(d.story.premise)}</p></div>` : ''}
      ${d.operations?.debutSingle ? `<div class="pub-card"><h3>${t('首支单曲《{title}》', { title: esc(d.operations.debutSingle.title) })}</h3>
        <p>${esc(d.operations.debutSingle.concept)}</p></div>` : ''}
    </div>

    <div class="pub-foot">✦ ${t('本企划由 <a href="/">成团 StarForm · 虚拟偶像工坊</a> 生成')}</div>`;

  el.querySelectorAll('.pm-photo img, .pub-sec > img').forEach((im) => {
    im.style.cursor = 'zoom-in';
    im.onclick = () => lightbox(im.src);
  });
}

// 把代表色压暗作为页面顶部底色
function mix(hex) {
  const m = hex?.match(/^#?([0-9a-f]{6})/i);
  if (!m) return '#3b2a7a';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * 0.38);
  const g = Math.round(((n >> 8) & 255) * 0.32);
  const b = Math.round((n & 255) * 0.45);
  return `rgb(${r},${g},${b})`;
}

load();
