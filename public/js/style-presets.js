import { t } from './i18n.js';

// ── 画风锁定：企划级统一画风，注入所有生图提示词，覆盖各模板自带的媒介风格词 ──
export const ART_STYLES = [
  { key: 'anime', label: '动漫插画', clause: 'Japanese anime illustration, clean cel shading, expressive anime eyes, vivid colors, 2D animation production art quality' },
  { key: 'realistic', label: '写实真人', clause: 'photorealistic real human, natural skin texture with visible pores, realistic hair strands, cinematic photographic lighting, shot on 85mm lens' },
  { key: 'illustration', label: '时尚插画', clause: 'high-fashion editorial illustration, elegant confident linework, flat color blocks with subtle paper texture, magazine illustration aesthetic' },
  { key: 'render3d', label: '3D 渲染', clause: 'high-quality stylized 3D CG render, soft subsurface skin shading, clean topology look, soft studio lighting, Pixar-adjacent premium quality' },
  { key: 'painterly', label: '厚涂概念', clause: 'painterly digital concept art, rich visible brushstrokes, dramatic lighting, semi-realistic stylization' },
];

// 生成附加在提示词尾部的画风锁定指令；hasRefs 时同时强制跟随参考图画风
export function styleSuffix(G, { hasRefs = false } = {}) {
  const clause = ART_STYLES.find((a) => a.key === G.data?.artStyle)?.clause;
  const parts = [];
  if (clause) parts.push(`ART STYLE LOCK — the entire image MUST use this exact style, overriding any style words above: ${clause}.`);
  else if (hasRefs) parts.push('ART STYLE LOCK — exactly keep the ORIGINAL art style of the reference images, overriding any style words above.');
  if (hasRefs) parts.push('Strictly match the rendering technique, facial features and outfit design of the reference images.');
  return parts.length ? ' ' + parts.join(' ') : '';
}

// ── 角色参考图：主图 + 最新造型设定图（与服务端规则一致，最多 4 张，不含归档） ──
export function refsFor(G, m) {
  const mine = (G.images || []).filter((i) => i.member === m.codename && !i.archived);
  const picked = mine.filter((i) => i.kind === 'design').slice(0, 3);
  const primary = mine.find((i) => i.isPrimary);
  if (primary && !picked.some((i) => i.id === primary.id)) picked.unshift(primary);
  return picked.slice(0, 4);
}

const memberHasRefs = (G, m) => refsFor(G, m).length > 0;

// 生图风格模板库 — 提炼自 awesome-gpt-image-2（538 案例库）的提示词工程精华，
// 按偶像企划场景改编：摄影参数化、角色一致性锁定、海报防拼贴约束、文案硬编码。
// 每个预设: { key, label, prompt, size? } — size 为该模板推荐画幅，点选时自动切换。

// 成员造型预设 — 统一「锁定区 + 自由区」骨架：
// 锁定美术风格/面部/体型；姿态、服饰、表情、环境、氛围自由发挥
export function memberPresets(m, G) {
  const ap = m.appearance || {};
  const look = [ap.face, ap.hair, ap.eyes].filter(Boolean).join('，');
  const build = [ap.body, m.heightFeel].filter(Boolean).join('，');
  const fashion = m.fashion || '';
  const stage = m.stageOutfit || fashion;
  const color = m.color || G.data.concept.mainColor;
  const suffix = styleSuffix(G, { hasRefs: memberHasRefs(G, m) });

  const lock = `【角色锁定·不得改变】面部特征（${look || '以参考图为准'}）；体型比例（${build || '以参考图为准'}）；全图美术风格统一，严格与参考图一致。`;
  const free = (intent) => `【自由发挥】姿态、表情、服饰造型、环境、光线、氛围均可自由设计，服务于：${intent}`;

  const list = [
    { key: 'base', label: t('基础立绘'),
      prompt: `${m.codename} 全身立绘。${lock}${free(`纯白背景全身立绘，超精细（服装灵感，可自由变化：${fashion || '造型师决定'}）`)}` },
    { key: 'stage', label: t('舞台造型'),
      prompt: `${m.codename} 舞台造型全身像。${lock}${free(`演出舞台氛围与灯光（舞台服灵感，可自由变化：${stage || '造型师决定'}）`)}` },
    { key: 'photo', label: t('写实写真'), size: '1024x1536',
      prompt: `${m.codename} 偶像棚拍写真。${lock}${free(`85mm 定焦 f/1.8 浅景深，柔光箱主光加发丝轮廓光，轻微胶片颗粒（Kodak Portra 400 质感），半身构图，高级时尚杂志气质，主色调围绕 ${color}。避免：过度磨皮、手部畸形、画面文字水印`)}` },
    { key: 'card', label: t('偶像小卡'), size: '1024x1536',
      prompt: `${m.codename} 偶像专辑随附小卡（photocard）。${lock}${free(`竖版圆角卡片构图，清爽棚拍光，胸像到半身特写，亲和自然的表情与手势，应援色 ${color} 细边框加少量贴纸感装饰，甜美干净收藏品质感。避免：文字拼写错误、多个人物`)}` },
    { key: 'sheet', label: t('角色设定表'), size: '1536x1024',
      prompt: `${m.codename} 角色设定表，横版 2×2 网格共 4 个等尺寸面板，细线分隔：正面全身、侧面全身、背面全身、表情特写。角色一致性前置——所有面板必须是同一角色，脸型、发型、服装、身体比例完全一致（${look}，服装：${fashion}）。纯白背景，技术参考图气质。约束：不要新增角色，不要在面板之间改变服装细节，不要复杂背景，不要彩色干扰` },
    { key: 'toy', label: t('3D 潮玩手办'), size: '1024x1024',
      prompt: `将偶像 ${m.codename} 设计成高端 3D 收藏潮玩手办。${lock}${free(`大头潮玩化设计，五官轻微夸张但保留身份识别；哑光 vinyl 收藏级材质，柔和棚拍光，${color} 干净背景，premium designer toy 渲染质感（服装灵感：${stage || '设计师决定'}）。避免：廉价塑料感、变成另一个人、多角色、文字水印`)}` },
    { key: 'ghibli', label: t('手绘涂鸦'), size: '1024x1536',
      prompt: `${m.codename} 手绘时尚涂鸦插画。${lock}${free(`铅笔与墨线的松弛笔触，局部上色，${color} 作为唯一强调色，大量纸张留白，杂志手绘时尚大片气质。避免：AI 默认塑料厚涂感、整齐上色`)}` },
  ];
  return list.map((p) => ({ ...p, prompt: p.prompt + suffix, locks: [p.key === 'sheet' ? '' : lock, suffix.trim()].filter(Boolean) }));
}

// 团体海报模板
export function posterPresets(G) {
  const c = G.data.concept;
  const n = (G.data.members || []).length;
  const lockN = `画面正好 ${n} 人，只有这 ${n} 位成员`;
  const single = '只要一张完成度极高的成品海报，不要 moodboard、不要多方案展示板、不要过程稿、不要样机';
  const titleLock = `海报大标题文字只有「${c.name}」，拼写必须完全正确，不要自行添加其他可读文字`;
  const suffix = styleSuffix(G, { hasRefs: (G.data.members || []).some((m) => memberHasRefs(G, m)) });
  const memberLock = '【角色锁定·不得改变】画面中每位成员的面部特征、体型比例与美术风格必须严格与其参考图一致，不得混淆不同成员的长相。';
  const posterFree = '【自由发挥】构图、队形、姿态、服饰细节、场景、光线与氛围可在模板方向内自由设计。';

  const list = [
    { key: 'main', label: t('官方主视觉'), size: '1536x1024',
      prompt: `虚拟偶像团体《${c.name}》官方主视觉海报，${c.visualStyle || c.vibe || ''}，全体成员同框，${lockN}。戏剧化光影，主色 ${c.mainColor}，强标题层级与清晰主体。${titleLock}。${single}` },
    { key: 'type', label: t('概念字体海报'), size: '1024x1536',
      prompt: `为虚拟偶像团体《${c.name}》设计一张高级概念字体海报。团名「${c.name}」必须成为画面的主视觉结构：巨大、可读、有力量、拼写完全正确。成员（${lockN}）必须与字体互动：重叠字母、从字母间浮现、被字母框住或在字母上投下阴影，而不是摆在旁边。使用围绕主色 ${c.mainColor} 的 4-6 色克制配色。构图风格：高端编辑海报、戏剧性尺度、强层级、少元素、聪明留白、丝网印刷颗粒质感。避免：通用字效、光泽 3D 字体、随机图标、杂乱拼贴、标题错字。${single}` },
    { key: 'concert', label: t('打歌舞台'), size: '1024x1536',
      prompt: `虚拟偶像团体《${c.name}》打歌舞台 Campaign 海报，单张强主视觉构图。主体：全体成员在舞台上的整齐队形动作，${lockN}。强舞台灯光与逆光剪影层次，反光舞台地面，飘散的应援灯海作背景光斑。品牌化配色：主色 ${c.mainColor} 加对比辅助色。大字标题「${c.name}」，可加一行小字演出日期占位。约束：主体清晰、文字可读、色调统一，不要杂乱拼贴。${single}` },
    { key: 'album', label: t('专辑封面'), size: '1024x1024',
      prompt: `虚拟偶像团体《${c.name}》专辑封面，方形构图，${c.visualStyle || c.vibe || ''}。全体成员（${lockN}）以电影感光影入画，极简高级留白，主色 ${c.mainColor} 主导的克制配色，团名「${c.name}」以小而精致的字体点缀，像高端唱片实体封面。避免：信息拥挤、多余文字、拼贴感。${single}` },
  ];
  // 运营方案里的海报创意也作为可选模板
  (G.data.operations?.posterIdeas || []).forEach((idea, i) => {
    if (idea?.desc) list.push({ key: `idea${i}`, label: idea.name || t('海报创意'), size: '1536x1024', prompt: `${idea.desc}，${lockN}。${titleLock}。${single}` });
  });
  return list.map((p) => ({ ...p, prompt: `${p.prompt} ${memberLock}${posterFree}${suffix}`, locks: [memberLock, suffix.trim()].filter(Boolean) }));
}

// ── 成员创作分类（造型设定 / 容貌写真 / 妆造 / 服饰 / 动态 / 杂志大片） ──
function appearanceText(member) {
  const appearance = member.appearance;
  if (typeof appearance === 'string' && appearance.trim()) return appearance.trim();
  if (appearance && typeof appearance === 'object') {
    const details = [appearance.face, appearance.hair, appearance.eyes, appearance.body]
      .filter((value) => typeof value === 'string' && value.trim());
    if (details.length) return details.join(', ');
  }
  return `${member.codename}, ${member.archetype || 'idol'} archetype`;
}

const designAnchor = (m) => `[CHARACTER LOCK — same character in every panel: face, hairstyle, body proportions and outfit details must stay identical. Character: ${appearanceText(m)}.]`;

// 造型设定资料 — 网格/编号/面板约束提炼自 awesome-gpt-image-2 的角色设定表技法
function designPrompt(m, g, style, hint) {
  const outfit = m.fashion || 'casual idol outfit';
  const stage = m.stageOutfit || outfit;
  const anchor = designAnchor(m);
  const P = {
    '三视图': `Character turnaround reference sheet, exactly three full-body views side by side: FRONT, SIDE, BACK, each labeled. Neutral standing pose, identical height and proportions across all three views. Outfit: ${outfit}. ${anchor} Clean white background, flat even lighting, subtle floor shadow, professional production art quality. No perspective distortion, no extra characters, no background props.`,
    '表情表': `Character expression sheet, 3x3 grid of nine head-and-shoulders portraits separated by thin divider lines, each panel labeled in small text: neutral, smile, laugh, angry, sad, surprised, shy, smug, crying. ${anchor} Same camera angle and framing in every panel — only the facial expression changes. Clean white background, anime production reference style.`,
    '服装设定': `Character costume design sheet: the same character shown in three full-body outfits side by side — daily wear (${outfit}), stage costume (${stage}), practice wear. Thin callout lines with short notes pointing to key accessories and fabric details. ${anchor} Clean white background, fashion design reference quality. No extra characters.`,
    '姿态表': `Character pose reference sheet, 2x3 grid of six full-body poses with panel numbers 1-6: standing idle, walking, signature dance move, sitting, waving to fans, jumping. Consistent outfit: ${outfit}. ${anchor} Clean white background, dynamic but readable silhouettes, animation reference quality.`,
  };
  return `${P[style] || P['三视图']} Color accent: ${m.color}.${hint ? ' ' + hint : ''}`;
}

// 锁定：美术风格、面部特征、体型比例；自由：姿态、服饰、表情、环境、光线、氛围
function lockBlock(m) {
  const ap = m.appearance || {};
  const face = [ap.face, ap.hair, ap.eyes].filter(Boolean).join('; ');
  const body = [ap.body, m.heightFeel].filter(Boolean).join('; ');
  return `[CHARACTER LOCK — these must stay EXACTLY consistent with the reference images and NEVER change: `
    + `facial features (${face || 'as shown in the reference images'}); `
    + `body type and proportions (${body || 'as shown in the reference images'}); `
    + `and one consistent art style throughout.]`;
}
function freeBlock(intent, hint) {
  return `[CREATIVE FREEDOM — pose, expression, outfit styling, environment, background, lighting and mood are yours to design freely, as long as they serve this request:] `
    + `${intent}${hint ? `. Extra request: ${hint}` : ''}`;
}

export const CATS = [
  {
    id: 'design', label: '造型设定',
    desc: '角色设定资料：三视图 / 表情表 / 服装设定 / 姿态表',
    styles: ['三视图', '表情表', '服装设定', '姿态表'],
    size: '1536x1024',
    sizeByStyle: { '表情表': '1024x1024' },
    lock: designAnchor,
    prompt: designPrompt,
  },
  {
    id: 'portrait', label: '容貌写真',
    desc: '人像 / 半身 / 侧脸，呈现角色核心气质',
    styles: ['日系清新', '韩系精致', '古典端庄', '中性帅气'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `Idol portrait of ${m.codename}. ${lockBlock(m)} ${freeBlock(`${style} portrait, head-and-shoulders to half body, magazine quality. Group vibe: ${g.vibe || 'youthful'}. Accent color ${m.color}`, hint)}`,
  },
  {
    id: 'makeup', label: '妆造设计',
    desc: '聚焦面部的美妆特写，展示不同妆容风格',
    styles: ['清透裸妆', '复古红唇', '舞台浓妆', '创意个性'],
    size: '1024x1024',
    prompt: (m, g, style, hint) =>
      `Beauty close-up of idol ${m.codename}, focused on makeup design. ${lockBlock(m)} ${freeBlock(`${style} makeup look, beauty-magazine quality. Design the makeup, expression, hair styling detail and backdrop freely around palette ${m.color}. Group vibe: ${g.vibe || 'fresh'}`, hint)}`,
  },
  {
    id: 'outfit', label: '服饰造型',
    desc: '全身造型，演出服 / 街拍 / 制服等场景',
    styles: ['演出舞台服', '街拍日常风', '制服学院风', '杂志高定'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `Full-body fashion look of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`outfit direction: ${style} — design the garments, accessories, pose, setting and lighting freely (wardrobe inspiration, optional: ${m.fashion || 'stylist decides'}). Concept: ${g.concept || g.name}. Accent color ${m.color}. Editorial quality`, hint)}`,
  },
  {
    id: 'dynamic', label: '动态写真',
    desc: '抓住动作瞬间：舞台高光 / 奔跑 / 日常',
    styles: ['舞台高光', '奔跑跳跃', '封面 Pose', '日常温柔'],
    size: '1536x1024',
    prompt: (m, g, style, hint) =>
      `Dynamic action shot of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`the moment: ${style} — choreograph the motion, expression, outfit, environment and cinematic lighting freely. Concept: ${g.concept || g.name}. Accent color ${m.color}`, hint)}`,
  },
  {
    id: 'editorial', label: '杂志大片',
    desc: '高时尚感编辑风格，适合海报与宣传物料',
    styles: ['封面故事', '时尚大片', '概念艺术', '全身时装'],
    size: '1024x1536',
    prompt: (m, g, style, hint) =>
      `High-fashion magazine editorial of idol ${m.codename}. ${lockBlock(m)} ${freeBlock(`editorial theme: ${style} — art-direct the styling, pose, expression, set design, atmosphere and lighting freely, luxury quality. Group aesthetic: ${g.vibe || g.concept || g.name}. Color scheme around ${m.color}`, hint)}`,
  },
];

// 分类模板 → 可选项 { key, label, size, build(hint) → { prompt, locks } }
export function catOptions(cat, m, G) {
  const suffix = styleSuffix(G, { hasRefs: memberHasRefs(G, m) });
  const lock = (cat.lock || lockBlock)(m);
  return cat.styles.map((style) => ({
    key: style, label: t(style),
    size: cat.sizeByStyle?.[style] || cat.size,
    build: (hint) => ({ prompt: cat.prompt(m, G.data.concept, style, hint) + suffix, locks: [lock, suffix.trim()].filter(Boolean) }),
  }));
}
