// 企划书 Markdown 导出
export function buildMarkdown(d) {
  const { concept: c, members, story: s, operations: o, input, history } = d;
  const r = d.relations || { overview: '', pairs: [] };
  const L = [];
  L.push(`# ${c.name} · 虚拟偶像企划书`, '', `> ${c.concept}`, '',
    `主题方向：${input?.theme || ''}　运营定位：${input?.positioning || ''}`, '');
  L.push('## 一、团体总设定', '', `- **名称含义**：${c.nameMeaning}`, `- **成立原因**：${c.originReason}`,
    `- **世界观**：${c.worldview}`, `- **视觉风格**：${c.visualStyle}`, `- **音乐风格**：${c.musicStyle}`,
    `- **整体气质**：${c.vibe}`, `- **粉丝称呼**：${c.fandomName}`, `- **团体口号**：${c.slogan}`,
    `- **代表色**：${c.mainColor}`, `- **情绪价值**：${c.emotionalValue}`, '');
  L.push('## 二、成员档案', '');
  for (const m of members) {
    L.push(`### ${m.codename}（${m.archetype}）`, '', `${m.fullName || ''}　${m.ageFeel || ''}　${m.heightFeel || ''}`, '',
      `- **性格**：${(m.personality || []).join('、')}`,
      `- **外貌**：${m.appearance?.hair}；${m.appearance?.eyes}；${m.appearance?.face}；${m.appearance?.body}`,
      `- **日常穿搭**：${m.fashion}`, `- **舞台造型**：${m.stageOutfit}`,
      `- **标志配饰**：${m.accessories}　**代表符号**：${m.symbol}　**代表色**：${m.color}`,
      `- **声音**：${m.voice}`, `- **说话方式**：${m.speechStyle}`,
      `- **特长**：${m.talent}　**爱好**：${m.hobbies}`,
      `- **缺点**：${m.flaw}`, `- **反差点**：${m.contrast}`, `- **秘密**：${m.secret}`,
      `- **成长线**：${m.growthArc}`, `- **粉丝缘**：${m.fanAppeal}`, '');
  }
  if (history?.length) {
    L.push('## 成员个人经历', '');
    history.forEach((h, i) => {
      if (!h) return;
      L.push(`### ${h.codename || members[i]?.codename}`, '',
        `- **成长背景**：${h.background}`, `- **转折点**：${h.turning}`,
        `- **入团经历**：${h.joining}`, `- **队友初遇**：${h.firstMeet}`,
        ...(h.milestones || []).map((ms) => `- **${ms.title}**：${ms.desc}`),
        `- **梦想与恐惧**：${h.dream}`, `- **日常切片**：${h.dailyLife}`, '');
    });
  }
  L.push('## 三、关系网络', '', r.overview, '');
  for (const p of r.pairs || []) {
    L.push(`### ${p.a} × ${p.b}（${p.type}）`, '', p.dynamic, '', `**名场面**：${p.moments}`, '',
      `**内容点子**：${(p.contentIdeas || []).join('；')}`, '');
  }
  L.push(`**CP 线**：${(r.cpLines || []).map((x) => `${x.pair}（${x.fanName}）— ${x.why}`).join('；')}`, '',
    `**喜剧搭档**：${r.comedyDuo?.pair} — ${r.comedyDuo?.why}`, '', `**全员化学反应**：${r.teamDynamic}`, '');
  if (s) {
    L.push('## 四、世界观与故事线', '', `**故事前提**：${s.premise}`, '',
      `- **团队目标**：${s.goal}`, `- **主要矛盾**：${s.mainConflict}`, `- **敌对势力**：${s.antagonist}`,
      `- **成长主线**：${s.mainArc}`, `- **团体危机**：${s.teamCrisis}`,
      `- **舞台任务机制**：${s.stageMissions}`, `- **粉丝参与机制**：${s.fanMechanic}`, '', '### 第一季剧情', '');
    for (const e of s.season1 || []) L.push(`- EP${e.ep}《${e.title}》：${e.summary}`);
    L.push('', '### 成员个人线', '');
    for (const a of s.memberArcs || []) L.push(`- **${a.codename}**：${a.arc}`);
    L.push('');
  }
  if (o) {
    L.push('## 五、内容运营', '', `### 首支单曲《${o.debutSingle?.title}》`, '',
      `**歌曲概念**：${o.debutSingle?.concept}`, '', `**MV 概念**：${o.debutSingle?.mvConcept}`, '');
    L.push('### 直播栏目', '');
    for (const x of o.liveShows || []) L.push(`- **${x.name}**：${x.format}`);
    L.push('', '### 短视频栏目', '');
    for (const x of o.shortVideoColumns || []) L.push(`- **${x.name}**：${x.format}`);
    L.push('', '### 成员个人账号', '');
    for (const x of o.memberAccounts || []) L.push(`- **${x.codename}**：${x.style}`);
    L.push('', '### 粉丝互动与周边', '');
    for (const x of o.fanInteraction || []) L.push(`- ${x}`);
    L.push(`- **表情包方向**：${o.memeDirection}`);
    for (const x of o.merch || []) L.push(`- **周边·${x.name}**：${x.desc}`);
    L.push('', `**剧情短片**：${o.dramaShorts}`, '', `**舞台演出**：${o.stageShow}`, '', `**节日活动**：${o.festivalIdeas}`, '');
    L.push('## 六、商业包装', '', `**商业文案**：${o.pitchCopy}`, '', `**对外介绍**：${o.productDescription}`, '');
  }
  L.push('## 视觉生成提示词', '');
  for (const m of members) {
    L.push(`### ${m.codename}`, '', '一致性提示词：', '```', m.imagePromptEn || '', '```',
      '舞台造型：', '```', m.stagePromptEn || '', '```', '日常造型：', '```', m.dailyPromptEn || '', '```', '');
  }
  if (o?.posterIdeas?.length) {
    L.push('### 团体海报', '');
    for (const p of o.posterIdeas) L.push(`**${p.name}** — ${p.desc}`, '', '```', p.posterPromptEn || '', '```', '');
  }
  return L.join('\n');
}
