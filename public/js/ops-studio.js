// 创作间 — 短视频选题弹药库 / 日常选题工坊
// 状态策略：选题持久化到服务端 SQLite（按团+工坊存，换浏览器也不丢）；
// 生成进行中切走标签，完成后若已回到本工坊自动刷新，否则 toast 提醒。
import { api } from './api.js';
import { $, esc, toast, copyText } from './ui.js';

const KIND_META = {
  video: {
    en: 'SHORT VIDEO STUDIO', title: '短视频', stage: 'videoTopics',
    desc: '一次生成 12 个扣着团设的选题——剧情、互动、格式、高光四个方向。看中的存为作品，再生成分镜脚本。',
    placeholder: '例如：多出剧情向 / 围绕某对搭档 / 适合变装格式',
    angles: ['反差炸裂', '关系名场面', '热点嫁接', '悬念连载', '整活挑战', '高光时刻'],
  },
  daily: {
    en: 'DAILY CONTENT STUDIO', title: '日常内容', stage: 'dailyTopics',
    desc: '养粉期的高频轻内容：vlog、图文动态、练习室日常。每个选题自带以成员本人语气写好的发布文案。',
    placeholder: '例如：多出宿舍日常 / 这周想发吃的 / 围绕练习室',
    angles: ['反差萌', '翻车现场', '隐藏设定泄露', '成员互怼', '治愈瞬间', '粉丝共创'],
  },
};

// 角度 → 一句话方法论说明（hover/标题提示）
const ANGLE_HINT = {
  反差炸裂: '人设/身份强反转，越意外越上头', 关系名场面: 'CP与搭档的高光互动，喂粉刚需',
  热点嫁接: '蹭格式/节日/梗，借势起量', 悬念连载: '埋钩子做系列，养追更习惯',
  整活挑战: '沙雕可参与，激发模仿二创', 高光时刻: '技术流/颜值直拍，封神时刻',
  反差萌: '人设崩塌的可爱瞬间', 翻车现场: '真实出糗比精致更圈粉',
  隐藏设定泄露: '不经意露新设定，留考据空间', 成员互怼: '小拌嘴小互动，喂CP搭档粉',
  治愈瞬间: '温柔治愈，情绪价值拉满', 粉丝共创: '抛问题让粉丝投票接龙',
};

function loadTopics(O, kind) {
  const t = O.topics[kind];
  return Array.isArray(t) && t.length ? t : null;
}

export function renderStudio(el, O, kind, openWork, reloadWorks) {
  O.generating = O.generating || {};
  O.hints = O.hints || {};
  O.angle = O.angle || {};
  const meta = KIND_META[kind];
  const topics = loadTopics(O, kind);
  const busy = !!O.generating[kind];
  const curAngle = O.angle[kind] || '';

  const angleChips = [['', '🎲 全部角度']].concat((meta.angles || []).map((a) => [a, a]))
    .map(([v, label]) => `<button class="angle-chip${v === curAngle ? ' on' : ''}" data-angle="${esc(v)}" ${v && ANGLE_HINT[v] ? `title="${esc(ANGLE_HINT[v])}"` : ''} ${busy ? 'disabled' : ''}>${esc(label)}</button>`).join('');

  el.innerHTML = `<div class="ops-page">
    <header class="ops-page-head">
      <div class="ops-page-head-main">
        <div class="ops-kicker">${meta.en}</div>
        <h1>${meta.title}</h1>
        <p class="ops-sub">${meta.desc}</p>
      </div>
    </header>
    <div class="card st-gen-bar">
      <div class="st-angle">
        <span class="st-angle-lbl">创作角度 <small>选一个方法论方向集中发力，或全部混合</small></span>
        <div class="angle-row">${angleChips}</div>
      </div>
      <div class="field-row" style="align-items:flex-end;margin:14px 0 0">
        <label class="field"><span class="field-label">额外要求 <small>（可留空）</small></span>
          <input id="st-hint" type="text" placeholder="${esc(meta.placeholder)}" value="${esc(O.hints[kind] || '')}" ${busy ? 'disabled' : ''}></label>
        <div class="field"><button class="btn btn-primary" id="st-gen" ${busy ? 'disabled' : ''}>
          ${busy ? '<span class="spinner"></span> 生成中（约 1 分钟，可切去别的标签）…' : (topics ? '🎲 换一批选题' : '✦ 生成选题弹药库')}</button></div>
      </div>
    </div>
    <div id="st-list">${topics ? topicsHTML(kind, topics) : ''}</div>
  </div>`;

  if (!busy) {
    $('#st-gen', el).onclick = () => startGenerate(el, O, kind, openWork, reloadWorks);
    el.querySelectorAll('.angle-chip').forEach((b) => b.onclick = () => {
      O.angle[kind] = b.dataset.angle;
      el.querySelectorAll('.angle-chip').forEach((x) => x.classList.toggle('on', x === b));
    });
  }
  if (topics) bindTopicActions(el, O, kind, openWork, reloadWorks);
}

async function startGenerate(el, O, kind, openWork, reloadWorks) {
  const meta = KIND_META[kind];
  const group = O.group;
  const groupId = group.id;
  O.hints[kind] = $('#st-hint', el)?.value.trim() || '';
  const hint = O.hints[kind];
  const angle = O.angle?.[kind] || '';
  O.generating[kind] = true;
  renderStudio(el, O, kind, openWork, reloadWorks); // 立即进入"生成中"状态

  try {
    const d = group.data;
    const payload = kind === 'video'
      ? {
          concept: d.concept, members: d.members, relations: d.relations,
          historyHighlights: (d.history || []).filter(Boolean).map((h) => `${h.codename}:${h.dailyLife}`).join('；').slice(0, 600),
          angle, hint,
        }
      : { concept: d.concept, members: d.members, history: d.history || [], angle, hint };
    const r = await api.stage(meta.stage, payload);
    const topics = r.topics || [];
    await api.studio.set(groupId, kind, topics);
    if (O.group?.id === groupId) O.topics[kind] = topics;
    toast(`✅ ${meta.title}选题已生成`);
  } catch (e) {
    toast(`${meta.title}生成失败：` + e.message, 3500);
  }
  if (O.group?.id !== groupId) return;
  O.generating[kind] = false;

  // 仅当用户当前仍停留在本工坊时刷新界面；否则保留提示，回来时自然看到结果
  const host = document.querySelector('#ops-content');
  if (host && O.tab === kind) renderStudio(host, O, kind, openWork, reloadWorks);
}

function topicsHTML(kind, topics) {
  const field = (lbl, val, cls = '') => val ? `<div class="topic-field ${cls}"><span class="tf-lbl">${lbl}</span><p>${esc(val)}</p></div>` : '';

  if (kind === 'video') {
    return `<div class="topic-grid">${topics.map((t, i) => {
      const beats = Array.isArray(t.beats) ? t.beats.filter(Boolean) : [];
      return `
      <div class="topic-card">
        <div class="topic-head"><span class="badge">${esc(t.kind || '')}</span><span class="topic-format">${esc(t.format || '')}</span></div>
        <b class="topic-title">${esc(t.title)}</b>
        ${(t.members || []).length ? `<div class="topic-cast">👥 出演：${esc((t.members || []).join('、'))}</div>` : ''}
        ${field('🪝 开头钩子（前3秒）', t.hook)}
        ${field('🎬 一句话剧情', t.logline || t.desc)}
        ${beats.length ? `<div class="topic-field"><span class="tf-lbl">🎞 分段脚本（起承转合）</span>
          <ol class="topic-beats">${beats.map((b) => `<li>${esc(b)}</li>`).join('')}</ol></div>` : ''}
        ${field('🎯 结尾爆点 / 评论区钩子', t.ending)}
        ${field('🔥 为什么会火', t.why, 'topic-why')}
        <div class="topic-acts">
          <button class="btn btn-primary btn-sm" data-save="${i}">📥 存为作品</button>
        </div>
      </div>`;
    }).join('')}</div>
    <p class="muted" style="margin-top:10px">选题会一直保留（刷新也在），直到你点"换一批"。每条已含完整起承转合，存为作品后可再一键生成逐镜分镜脚本（台词/字幕/运镜）。</p>`;
  }
  return `<div class="topic-grid">${topics.map((t, i) => `
    <div class="topic-card">
      <div class="topic-head"><span class="badge">${esc(t.format || '')}</span><span class="topic-format">主角：${esc(t.member || '全员')}</span></div>
      <b class="topic-title">${esc(t.title)}</b>
      ${field('🪝 看点', t.hook)}
      ${field('📝 内容 / 配图', t.outline)}
      ${field('🔥 上头点', t.why, 'topic-why')}
      ${t.copy ? `<div class="topic-field"><span class="tf-lbl">✍️ 成员语气文案（可直接发）</span>
        <div class="prompt-block" style="font-family:inherit">${esc(t.copy)}<button class="copy-btn" data-copy="${esc(t.copy)}">复制</button></div></div>` : ''}
      <div class="topic-acts">
        <button class="btn btn-primary btn-sm" data-save="${i}">📥 存为作品</button>
      </div>
    </div>`).join('')}</div>
  <p class="muted" style="margin-top:10px">选题会一直保留（刷新也在），直到你点"换一批"。</p>`;
}

function bindTopicActions(el, O, kind, openWork, reloadWorks) {
  const groupId = O.group.id;
  const topics = O.topics[kind];
  el.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => copyText(b.dataset.copy));
  el.querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
    const t = topics[Number(b.dataset.save)];
    const fields = kind === 'video'
      ? { type: 'short_video', title: t.title, members: (t.members || []).join('，'), status: 'idea', content: { topic: t, hook: t.hook } }
      : { type: 'daily', title: t.title, members: t.member || '', status: 'idea', content: { topic: t, hook: t.hook, copy: t.copy || '' } };
    b.disabled = true;
    try {
      await api.works.create(groupId, fields);
      if (O.group?.id === groupId) await reloadWorks();
      b.textContent = '✔ 已存入作品库';
      toast(`已存入作品库：${t.title}`);
    } catch (e) {
      toast('保存失败：' + e.message, 3000);
      b.disabled = false;
    }
  });
}
