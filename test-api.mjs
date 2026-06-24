// 端到端 API 冒烟测试（运行后自动清理测试数据）。
// 未配置模型 Key 时会跳过真实 AI 调用，只验证本地 CRUD 和图片上传。
const BASE = process.env.STARFORM_BASE_URL || 'http://localhost:3210';
const req = async (method, url, body) => {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
};

const sample = {
  input: { theme: '测试团', memberCount: 2, positioning: '剧情 IP', needWorldview: false },
  concept: {
    name: '测试团', concept: '测试概念', worldview: '测试世界观', nameMeaning: '测试',
    originReason: '测试', visualStyle: '赛博', musicStyle: '电子', fandomName: '测试粉',
    slogan: '测试口号', mainColor: '#7c5cff', vibe: '冷感,锋利', emotionalValue: '测试',
    members: [
      { codename: '零', archetype: '队长型', oneLine: '冷静的防御系统', color: '#00E5FF' },
      { codename: '弧', archetype: '舞担型', oneLine: '会散架的家政AI', color: '#FF0080' },
    ],
  },
  members: [
    { codename: '零', fullName: 'Zero', archetype: '队长型', ageFeel: '20岁', personality: ['冷静', '可靠'],
      appearance: { hair: '银发', eyes: '蓝瞳', face: '冷感', body: '高挑' }, fashion: '机能风', stageOutfit: '银甲',
      accessories: '数据耳坠', color: '#00E5FF', symbol: '盾', voice: '低沉', speechStyle: '简短',
      talent: '统筹', hobbies: '下棋', flaw: '不会撒娇', contrast: '怕猫', secret: '感染了病毒',
      growthArc: '学会依赖他人', fanAppeal: '反差萌', imagePromptEn: 'silver hair, blue eyes, cool AI girl',
      stagePromptEn: 'silver armor stage outfit', dailyPromptEn: 'casual techwear' },
    { codename: '弧', fullName: 'Arc', archetype: '舞担型', ageFeel: '17岁', personality: ['狂热', '元气'],
      appearance: { hair: '粉发', eyes: '异色瞳', face: '元气', body: '娇小' }, fashion: '街头', stageOutfit: '荧光',
      accessories: '断裂数据线', color: '#FF0080', symbol: '齿轮', voice: '清亮', speechStyle: '语速快',
      talent: '舞蹈', hobbies: '打扫', flaw: '会散架', contrast: '强迫症', secret: '记忆是借来的',
      growthArc: '接受不完美', fanAppeal: '喜剧人', imagePromptEn: 'pink hair, heterochromia, energetic dancer',
      stagePromptEn: 'neon dance outfit', dailyPromptEn: 'street fashion' },
  ],
  relations: {
    overview: '一冷一热', pairs: [{ a: '零', b: '弧', type: '欢喜冤家', dynamic: '互补', moments: '后台拌嘴', contentIdeas: ['短剧'] }],
    cpLines: [{ pair: '零 x 弧', why: '反差', fanName: '零弧' }], comedyDuo: { pair: '零 x 弧', why: '一捧一逗' }, teamDynamic: '化学反应好',
  },
  story: null,
  operations: {
    debutSingle: { title: '重启', concept: '找回记忆', mvConcept: '废墟舞台' },
    liveShows: [{ name: '梦境解读', format: '读粉丝梦境' }], shortVideoColumns: [{ name: '隐藏设定', format: '30秒短剧' }],
    memberAccounts: [{ codename: '零', style: '冷淡日常' }], fanInteraction: ['打榜'], memeDirection: '散架梗',
    posterIdeas: [{ name: '出道海报', desc: '双人海报', posterPromptEn: 'two virtual idols, cyberpunk stage, neon' }],
    merch: [{ name: '徽章', desc: '代表符号' }], dramaShorts: '每集一个秘密', stageShow: '全息演唱会',
    festivalIdeas: '周年演唱会', pitchCopy: '测试文案', productDescription: '测试介绍',
  },
};

// 1x1 红色 PNG
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let groupId;
try {
  const config = await req('GET', '/api/config');

  // CRUD
  const { group } = await req('POST', '/api/groups', { data: sample });
  groupId = group.id;
  console.log('✔ 创建企划', group.id, group.shareId);

  const list = (await req('GET', '/api/groups')).groups;
  console.log('✔ 列表', list.length, '个，首个:', list[0].name);

  sample.concept.slogan = '修改后的口号';
  await req('PATCH', `/api/groups/${groupId}`, { data: sample });
  const got = (await req('GET', `/api/groups/${groupId}`)).group;
  console.log('✔ 更新+读取', got.data.concept.slogan);

  // 图片上传 + 主图 + 公开页
  const { image } = await req('POST', '/api/images/upload', { groupId, member: '零', dataUrl: TINY_PNG });
  console.log('✔ 上传图片', image.url, 'primary:', image.isPrimary);
  await req('POST', `/api/images/${image.id}/primary`);
  const pub = (await req('GET', `/api/public/${group.shareId}`)).group;
  console.log('✔ 公开页', pub.name, '图片数:', pub.images.length);

  if (config.textGen) {
    // 真实 reroll（文字模型）
    const rr = await req('POST', '/api/stage', { stage: 'reroll', payload: {
      context: '女团「测试团」：赛博世界的双人组合', target: sample.members[0],
      fieldKey: 'flaw', fieldLabel: '缺点', currentValue: '不会撒娇', hint: '',
    } });
    console.log('✔ 重roll（文字模型）新缺点:', JSON.stringify(rr.result.value).slice(0, 80));
  } else {
    console.log('↷ 跳过文字模型测试：未配置 API Key');
  }

  if (config.imageGen) {
    // 真实生图（低质量以减少成本）
    try {
      const gen = await req('POST', '/api/images/generate', {
        groupId, member: '弧', prompt: 'pink hair anime girl, simple test', size: '1024x1024', quality: 'low',
      });
      console.log('✔ 生图', gen.image.url);
    } catch (e) {
      console.log('✘ 生图失败:', e.message);
    }
  } else {
    console.log('↷ 跳过生图测试：未配置 API Key');
  }
} finally {
  if (groupId) {
    await req('DELETE', `/api/groups/${groupId}`);
    console.log('✔ 清理测试数据');
  }
}
console.log('\n全部测试完成');
