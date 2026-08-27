// 企划书 Markdown 导出
import { t } from './i18n.js';

export function buildMarkdown(d) {
  const { concept: c, members, story: s, operations: o, input, history } = d;
  const r = d.relations || { overview: '', pairs: [] };
  const C = t('：'); // 标签冒号（英文环境译为 ": "）
  const li = (label, value) => `- **${t(label)}**${C}${value}`;
  const L = [];
  L.push(`# ${c.name} · ${t('虚拟偶像企划书')}`, '', `> ${c.concept}`, '',
    `${t('主题方向')}${C}${input?.theme || ''}　${t('运营定位')}${C}${input?.positioning || ''}`, '');
  L.push('## ' + t('一、团体总设定'), '', li('名称含义', c.nameMeaning), li('成立原因', c.originReason),
    li('世界观', c.worldview), li('视觉风格', c.visualStyle), li('音乐风格', c.musicStyle),
    li('整体气质', c.vibe), li('粉丝称呼', c.fandomName), li('团体口号', c.slogan),
    li('代表色', c.mainColor), li('情绪价值', c.emotionalValue), '');
  L.push('## ' + t('二、成员档案'), '');
  for (const m of members) {
    L.push(`### ${m.codename}（${m.archetype}）`, '', `${m.fullName || ''}　${m.ageFeel || ''}　${m.heightFeel || ''}`, '',
      li('性格', (m.personality || []).join('、')),
      li('外貌', `${m.appearance?.hair}；${m.appearance?.eyes}；${m.appearance?.face}；${m.appearance?.body}`),
      li('日常穿搭', m.fashion), li('舞台造型', m.stageOutfit),
      `- **${t('标志配饰')}**${C}${m.accessories}　**${t('代表符号')}**${C}${m.symbol}　**${t('代表色')}**${C}${m.color}`,
      li('声音', m.voice), li('说话方式', m.speechStyle),
      `- **${t('特长')}**${C}${m.talent}　**${t('爱好')}**${C}${m.hobbies}`,
      li('缺点', m.flaw), li('反差点', m.contrast), li('秘密', m.secret),
      li('成长线', m.growthArc), li('粉丝缘', m.fanAppeal), '');
  }
  if (history?.length) {
    L.push('## ' + t('成员个人经历'), '');
    history.forEach((h, i) => {
      if (!h) return;
      L.push(`### ${h.codename || members[i]?.codename}`, '',
        li('成长背景', h.background), li('转折点', h.turning),
        li('入团经历', h.joining), li('队友初遇', h.firstMeet),
        ...(h.milestones || []).map((ms) => `- **${ms.title}**${C}${ms.desc}`),
        li('梦想与恐惧', h.dream), li('日常切片', h.dailyLife), '');
    });
  }
  L.push('## ' + t('三、关系网络'), '', r.overview, '');
  for (const p of r.pairs || []) {
    L.push(`### ${p.a} × ${p.b}（${p.type}）`, '', p.dynamic, '', `**${t('名场面')}**${C}${p.moments}`, '',
      `**${t('内容点子')}**${C}${(p.contentIdeas || []).join('；')}`, '');
  }
  L.push(`**${t('CP 线')}**${C}${(r.cpLines || []).map((x) => `${x.pair}（${x.fanName}）— ${x.why}`).join('；')}`, '',
    `**${t('喜剧搭档')}**${C}${r.comedyDuo?.pair} — ${r.comedyDuo?.why}`, '', `**${t('全员化学反应')}**${C}${r.teamDynamic}`, '');
  if (s) {
    L.push('## ' + t('四、世界观与故事线'), '', `**${t('故事前提')}**${C}${s.premise}`, '',
      li('团队目标', s.goal), li('主要矛盾', s.mainConflict), li('敌对势力', s.antagonist),
      li('成长主线', s.mainArc), li('团体危机', s.teamCrisis),
      li('舞台任务机制', s.stageMissions), li('粉丝参与机制', s.fanMechanic), '', '### ' + t('第一季剧情'), '');
    for (const e of s.season1 || []) L.push(`- EP${e.ep}《${e.title}》${C}${e.summary}`);
    L.push('', '### ' + t('成员个人线'), '');
    for (const a of s.memberArcs || []) L.push(`- **${a.codename}**${C}${a.arc}`);
    L.push('');
  }
  if (o) {
    L.push('## ' + t('五、内容运营'), '', '### ' + t('首支单曲《{title}》', { title: o.debutSingle?.title }), '',
      `**${t('歌曲概念')}**${C}${o.debutSingle?.concept}`, '', `**${t('MV 概念')}**${C}${o.debutSingle?.mvConcept}`, '');
    L.push('### ' + t('直播栏目'), '');
    for (const x of o.liveShows || []) L.push(`- **${x.name}**${C}${x.format}`);
    L.push('', '### ' + t('短视频栏目'), '');
    for (const x of o.shortVideoColumns || []) L.push(`- **${x.name}**${C}${x.format}`);
    L.push('', '### ' + t('成员个人账号'), '');
    for (const x of o.memberAccounts || []) L.push(`- **${x.codename}**${C}${x.style}`);
    L.push('', '### ' + t('粉丝互动与周边'), '');
    for (const x of o.fanInteraction || []) L.push(`- ${x}`);
    L.push(li('表情包方向', o.memeDirection));
    for (const x of o.merch || []) L.push(`- **${t('周边')}·${x.name}**${C}${x.desc}`);
    L.push('', `**${t('剧情短片')}**${C}${o.dramaShorts}`, '', `**${t('舞台演出')}**${C}${o.stageShow}`, '', `**${t('节日活动')}**${C}${o.festivalIdeas}`, '');
    L.push('## ' + t('六、商业包装'), '', `**${t('商业文案')}**${C}${o.pitchCopy}`, '', `**${t('对外介绍')}**${C}${o.productDescription}`, '');
  }
  L.push('## ' + t('视觉生成提示词'), '');
  for (const m of members) {
    L.push(`### ${m.codename}`, '', t('一致性提示词：'), '```', m.imagePromptEn || '', '```',
      t('舞台造型：'), '```', m.stagePromptEn || '', '```', t('日常造型：'), '```', m.dailyPromptEn || '', '```', '');
  }
  if (o?.posterIdeas?.length) {
    L.push('### ' + t('团体海报'), '');
    for (const p of o.posterIdeas) L.push(`**${p.name}** — ${p.desc}`, '', '```', p.posterPromptEn || '', '```', '');
  }
  return L.join('\n');
}
