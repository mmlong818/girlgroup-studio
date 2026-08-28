const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

const fail = (message, statusCode) => { throw new ValidationError(message, statusCode); };

export function assertSafeJSON(value, path = '数据', depth = 0) {
  if (depth > 20) fail(`${path} 嵌套过深`);
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 500) fail(`${path} 数量过多`);
    value.forEach((item, i) => assertSafeJSON(item, `${path}[${i}]`, depth + 1));
    return value;
  }
  if (typeof value !== 'object') fail(`${path} 格式无效`);
  for (const [key, item] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(key)) fail(`${path} 包含不允许的字段`);
    assertSafeJSON(item, `${path}.${key}`, depth + 1);
  }
  return value;
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} 必须是对象`);
  return value;
}

function string(value, path, { min = 1, max = 10_000, optional = false } = {}) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string') fail(`${path} 必须是文本`);
  const out = value.trim();
  if (out.length < min || out.length > max) fail(`${path} 长度无效`);
  return out;
}

function array(value, path, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value)) fail(`${path} 必须是数组`);
  if (value.length < min || value.length > max) fail(`${path} 数量无效`);
  return value;
}

function validateConceptMember(member, path) {
  object(member, path);
  string(member.codename, `${path}.codename`, { max: 80 });
  string(member.archetype, `${path}.archetype`, { max: 120 });
  string(member.color, `${path}.color`, { max: 80 });
}

export function validateGroupData(data) {
  assertSafeJSON(data);
  object(data, '企划数据');
  const concept = object(data.concept, 'concept');
  string(concept.name, 'concept.name', { max: 120 });
  if (concept.members !== undefined) {
    array(concept.members, 'concept.members', { min: 1, max: 20 })
      .forEach((member, i) => validateConceptMember(member, `concept.members[${i}]`));
  }
  if (data.members !== undefined) {
    array(data.members, 'members', { min: 0, max: 20 }).forEach((member, i) => {
      object(member, `members[${i}]`);
      string(member.codename, `members[${i}].codename`, { max: 80 });
    });
  }
  return data;
}

export function validateStageRequest(body, stages) {
  object(body, '请求体');
  const stage = string(body.stage, 'stage', { max: 80 });
  if (!stages[stage]) fail(`未知阶段: ${stage}`);
  const payload = body.payload == null ? {} : object(body.payload, 'payload');
  assertSafeJSON(payload, 'payload');
  const lang = ['zh-CN', 'zh-TW', 'en', 'ja'].includes(body.lang) ? body.lang : 'zh-CN';
  return { stage, payload, lang };
}

function validateStageResultShape(stage, result) {
  assertSafeJSON(result, '模型结果');
  object(result, '模型结果');
  const modelFail = (message) => fail(`模型返回结构无效：${message}`, 502);
  const needObject = (value, path) => {
    try { return object(value, path); } catch { return modelFail(`${path} 必须是对象`); }
  };
  const needString = (value, path, optional = false) => {
    try { return string(value, path, { max: 20_000, optional }); } catch { return modelFail(`${path} 必须是文本`); }
  };
  const needArray = (value, path, min = 0, max = 100) => {
    try { return array(value, path, { min, max }); } catch { return modelFail(`${path} 必须是数组`); }
  };

  if (stage === 'concepts3' || stage === 'names') {
    const expected = stage === 'concepts3' ? 3 : 8;
    needArray(result.options, 'options', expected, expected).forEach((item, i) => {
      needObject(item, `options[${i}]`);
      needString(item.name, `options[${i}].name`);
      needString(stage === 'concepts3' ? item.concept : item.reason, `options[${i}].${stage === 'concepts3' ? 'concept' : 'reason'}`);
    });
  } else if (stage === 'reroll') {
    if (!Object.hasOwn(result, 'value')) modelFail('缺少 value');
  } else if (stage === 'imagePrompt') {
    needString(result.prompt, 'prompt');
  } else if (stage === 'concept') {
    needString(result.name, 'name');
    needString(result.concept, 'concept');
    needString(result.worldview, 'worldview');
    needArray(result.members, 'members', 1, 20).forEach((item, i) => validateConceptMember(item, `members[${i}]`));
  } else if (stage === 'member') {
    needString(result.codename, 'codename');
    needString(result.archetype, 'archetype');
    needArray(result.personality, 'personality', 1, 12).forEach((item, i) => needString(item, `personality[${i}]`));
    needObject(result.appearance, 'appearance');
  } else if (stage === 'profile') {
    needString(result.realName, 'realName');
    needString(result.birthday, 'birthday');
  } else if (stage === 'relations') {
    needString(result.overview, 'overview');
    needArray(result.pairs, 'pairs', 0, 100);
  } else if (stage === 'videoTopics' || stage === 'dailyTopics') {
    needArray(result.topics, 'topics', 1, 30).forEach((item, i) => {
      needObject(item, `topics[${i}]`);
      needString(item.title, `topics[${i}].title`);
    });
  } else if (stage === 'videoScript') {
    needString(result.title, 'title');
    needArray(result.shots, 'shots', 1, 30);
  } else if (stage === 'postCopy') {
    needString(result.copy, 'copy');
  } else if (stage === 'weekPlan') {
    needArray(result.days, 'days', 1, 14).forEach((day, i) => {
      needObject(day, `days[${i}]`);
      needString(day.date, `days[${i}].date`);
      needArray(day.items, `days[${i}].items`, 1, 10);
    });
  } else if (stage === 'history') {
    needString(result.background, 'background');
    needArray(result.milestones, 'milestones', 1, 10);
  } else if (stage === 'story') {
    needString(result.premise, 'premise');
    needArray(result.season1, 'season1', 1, 20);
  } else if (stage === 'operations') {
    needObject(result.debutSingle, 'debutSingle');
    needString(result.debutSingle.title, 'debutSingle.title');
    needArray(result.liveShows, 'liveShows', 0, 30);
    needArray(result.shortVideoColumns, 'shortVideoColumns', 0, 30);
  }
  return result;
}

export function validateStageResult(stage, result) {
  try {
    return validateStageResultShape(stage, result);
  } catch (err) {
    if (err instanceof ValidationError && err.statusCode !== 502) {
      throw new ValidationError(`模型返回结构无效：${err.message}`, 502);
    }
    throw err;
  }
}

export function validateStudioBody(body) {
  object(body, '请求体');
  string(body.groupId, 'groupId', { max: 80 });
  string(body.kind, 'kind', { max: 80 });
  assertSafeJSON(body.topics, 'topics');
  array(body.topics, 'topics', { max: 100 });
  return body;
}

export function validateWorkBody(body, { partial = false } = {}) {
  object(body, '请求体');
  assertSafeJSON(body);
  if (!partial) string(body.groupId, 'groupId', { max: 80 });
  if (body.title !== undefined) string(body.title, 'title', { max: 300 });
  if (body.type !== undefined) string(body.type, 'type', { max: 80 });
  if (body.status !== undefined) string(body.status, 'status', { max: 80 });
  return body;
}

export function validateBatchWorks(body) {
  object(body, '请求体');
  string(body.groupId, 'groupId', { max: 80 });
  array(body.works, 'works', { min: 1, max: 100 })
    .forEach((work) => validateWorkBody({ ...work, groupId: body.groupId }));
  return body;
}

export function validateImageUpload(body) {
  object(body, '请求体');
  string(body.groupId, 'groupId', { max: 80 });
  string(body.dataUrl, 'dataUrl', { max: 22 * 1024 * 1024 });
  if (body.member !== undefined) string(body.member, 'member', { max: 120, optional: true });
  return body;
}

export function validateImageGenerate(body) {
  object(body, '请求体');
  string(body.groupId, 'groupId', { max: 80 });
  string(body.prompt, 'prompt', { max: 20_000 });
  if (body.member !== undefined) string(body.member, 'member', { max: 120, optional: true });
  if (body.kind !== undefined) string(body.kind, 'kind', { max: 80, optional: true });
  if (body.size !== undefined && !['1024x1024', '1024x1536', '1536x1024'].includes(body.size)) fail('图片尺寸无效');
  if (body.quality !== undefined && !['low', 'medium', 'high'].includes(body.quality)) fail('图片质量无效');
  if (body.useRef !== undefined && typeof body.useRef !== 'boolean') fail('useRef 必须是布尔值');
  return body;
}

export function validateSettingsPatch(body) {
  object(body, '请求体');
  assertSafeJSON(body);
  for (const key of Object.keys(body)) if (!['text', 'image'].includes(key)) fail(`未知设置项: ${key}`);
  for (const kind of ['text', 'image']) {
    if (body[kind] === undefined) continue;
    object(body[kind], kind);
    const allowed = kind === 'text'
      ? ['baseUrl', 'apiKey', 'modelId', 'thinking']
      : ['baseUrl', 'apiKey', 'modelId'];
    for (const key of Object.keys(body[kind])) {
      if (!allowed.includes(key)) fail(`未知设置项: ${kind}.${key}`);
    }
    if (body[kind].baseUrl !== undefined) string(body[kind].baseUrl, `${kind}.baseUrl`, { max: 2_000 });
    if (body[kind].apiKey !== undefined) string(body[kind].apiKey, `${kind}.apiKey`, { max: 4_096, optional: true });
    if (body[kind].modelId !== undefined) string(body[kind].modelId, `${kind}.modelId`, { max: 200 });
    if (kind === 'text' && body[kind].thinking !== undefined && typeof body[kind].thinking !== 'boolean') {
      fail('text.thinking 必须是布尔值');
    }
  }
  return body;
}

export function validateModelListRequest(body) {
  object(body, '请求体');
  assertSafeJSON(body);
  if (!['text', 'image'].includes(body.kind)) fail('kind 必须是 text 或 image');
  if (body.baseUrl !== undefined) string(body.baseUrl, 'baseUrl', { max: 2_000, optional: true });
  if (body.apiKey !== undefined) string(body.apiKey, 'apiKey', { max: 4_096, optional: true });
  return body;
}

export function validateBackup(backup) {
  object(backup, '备份');
  assertSafeJSON(backup, '备份');
  if (backup.format !== 'starform-group-backup' || backup.version !== 1) fail('备份格式或版本不受支持');
  const group = object(backup.group, 'backup.group');
  validateGroupData(group.data);

  const works = array(backup.works ?? [], 'backup.works', { max: 500 });
  works.forEach((work) => validateWorkBody({ ...work, groupId: 'backup' }));

  const studio = object(backup.studio ?? {}, 'backup.studio');
  for (const [kind, topics] of Object.entries(studio)) {
    validateStudioBody({ groupId: 'backup', kind, topics });
  }

  const images = array(backup.images ?? [], 'backup.images', { max: 100 });
  images.forEach((image, i) => {
    object(image, `backup.images[${i}]`);
    string(image.member ?? '', `backup.images[${i}].member`, { max: 120, optional: true });
    string(image.kind, `backup.images[${i}].kind`, { max: 80 });
    string(image.dataUrl, `backup.images[${i}].dataUrl`, { max: 22 * 1024 * 1024 });
    if (image.isPrimary !== undefined && typeof image.isPrimary !== 'boolean') fail(`backup.images[${i}].isPrimary 必须是布尔值`);
    if (image.archived !== undefined && typeof image.archived !== 'boolean') fail(`backup.images[${i}].archived 必须是布尔值`);
  });
  backup.works = works;
  backup.studio = studio;
  backup.images = images;
  return backup;
}
