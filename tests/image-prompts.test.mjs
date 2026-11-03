import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { localStorage: { setItem() {}, removeItem() {}, getItem() { return null; } } };
globalThis.document = { documentElement: {} };

const { memberPresets, posterPresets, catOptions, CATS, refsFor } = await import('../public/js/style-presets.js');
const { STAGES } = await import('../prompts.mjs');

const member = {
  codename: '星', appearance: { face: '圆脸', hair: '黑色短发', eyes: '棕色眼睛', body: '修长' },
  fashion: '白色外套', stageOutfit: '银色舞台服', color: '#123456',
};
const group = (images = [], artStyle = '') => ({
  data: { concept: { name: '星光计划', mainColor: '#123456', vibe: '明亮' }, members: [member, { codename: '月', color: '#654321' }], artStyle },
  images,
});

test('member prompt keeps known identity, lets the outfit change, and does not assume references exist', () => {
  const prompts = memberPresets(member, group());
  const stage = prompts.find((p) => p.key === 'stage');
  assert.match(stage.prompt, /黑色短发/);
  assert.match(stage.prompt, /目光/);
  assert.match(stage.prompt, /材质/);
  assert.match(stage.prompt, /后续附加要求仅改变自由发挥部分/);
  assert.match(stage.prompt, /可按任务换装/);
  assert.doesNotMatch(stage.prompt, /Reference 1|Strictly match.*outfit design/);
  assert.ok(stage.locks.every((lock) => stage.prompt.includes(lock)));

  const unknown = memberPresets({ codename: '新星', color: '#fff' }, group()).find((p) => p.key === 'base');
  assert.doesNotMatch(unknown.prompt, /undefined|银发|蓝眼|女性/);
});

test('reference roles stay conditional even when a primary is not first or attachments change', () => {
  const images = [
    { id: 'design-1', member: '星', kind: 'design', isPrimary: false },
    { id: 'design-2', member: '星', kind: 'design', isPrimary: true },
  ];
  const G = group(images, 'anime');
  assert.deepEqual(refsFor(G, member).map((ref) => ref.id), ['design-1', 'design-2']);
  const prompt = memberPresets(member, G)[0].prompt;
  assert.match(prompt, /If a primary image is attached, use it for identity/);
  assert.match(prompt, /if design sheets are attached, use them for established design details/);
  assert.doesNotMatch(prompt, /Reference [1-9]/);
  assert.match(prompt, /If reference images are attached/);
  assert.match(prompt, /ART STYLE LOCK.*Japanese anime illustration/);
  assert.match(prompt, /overriding any style words above or in later extra requests/);
});

test('design and outfit categories retain their formats and preserve literal extra requests', () => {
  const G = group();
  const design = catOptions(CATS.find((cat) => cat.id === 'design'), member, G)[0].build('衣袖写 "A&B"');
  assert.match(design.prompt, /exactly three full-body views side by side: FRONT, SIDE, BACK/);
  assert.match(design.prompt, /衣袖写 "A&B"/);
  assert.ok(design.locks.every((lock) => design.prompt.includes(lock)));

  const outfit = catOptions(CATS.find((cat) => cat.id === 'outfit'), member, G)[0].build('换成红色夹克');
  assert.match(outfit.prompt, /换成红色夹克/);
  assert.match(outfit.prompt, /allow the requested outfit/);
  assert.doesNotMatch(outfit.prompt, /outfit details must stay identical/);
});

test('posters require the exact main title by default and exact member count; AI stage preserves locks', () => {
  const G = group();
  for (const poster of posterPresets(G)) {
    assert.match(poster.prompt, /画面正好 2 人，只有这 2 位成员/);
    assert.match(poster.prompt, /海报主标题原文为「星光计划」/);
    assert.match(poster.prompt, /默认只出现一次/);
    assert.ok(poster.locks.every((lock) => poster.prompt.includes(lock)));
  }
  const stage = STAGES.imagePrompt;
  const user = stage.buildUser({ member, concept: '星光计划', task: '海报', hint: '', draft: '草稿', locks: ['LOCK-A'] });
  assert.match(user, /LOCK-A/);
  assert.match(stage.system, /locks 中每个片段必须逐字保留/);
  assert.match(stage.system, /仅当本次附有参考图时/);
  assert.match(stage.system, /默认出现一次/);
});

test('explicit poster copy survives template and AI rules without turning descriptive hints into text', () => {
  const hint = '左下角副标题原文「夜航」；右下角日期原文「11月3日」；顶部口号原文「一起发光」；人物在雨后街道';
  const prompt = `${posterPresets(group()).find((poster) => poster.key === 'concert').prompt} 附加要求：${hint}`;
  const system = STAGES.imagePrompt.system;
  for (const copy of ['夜航', '11月3日', '一起发光']) assert.ok(prompt.includes(copy));
  assert.match(prompt, /逐字放在指定位置，未指定次数时各出现一次/);
  assert.match(prompt, /描述性附加要求不是画面文字/);
  assert.match(prompt, /默认只出现一次，若用户明确要求特殊排版重复则按要求重复/);
  assert.doesNotMatch(prompt, /不要其他可读文字|可加一行小字演出日期占位/);
  assert.match(system, /明确指定要呈现的副标题、日期、口号等文案必须逐字保留/);
  assert.match(system, /描述性附加要求不是画面文字/);
  assert.doesNotMatch(system, /不增添其他可读文字|标题原文清晰且只出现一次/);
  const user = STAGES.imagePrompt.buildUser({ member: [], concept: '星光计划', task: '打歌海报', hint, draft: prompt, locks: [] });
  assert.ok(user.includes(hint));
});
