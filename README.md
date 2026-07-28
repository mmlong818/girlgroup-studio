# 成团 StarForm · 虚拟偶像工坊

StarForm 是一个本地优先的虚拟偶像 IP 创建与运营设计工具。输入一个想法，就可以生成团体概念、成员档案、关系网络、故事线、内容运营方案、视觉提示词和公开出道页。

支持女团、男团、混合团与单人偶像。前端是原生 ES Modules，后端是 Node.js 原生 HTTP 服务和内置 SQLite，无构建步骤、无 npm 运行依赖。

## 功能

- 企划生成：从 3 个概念方向开始，逐阶段生成并锁定概念、成员、关系、故事和运营内容。
- 工作台：成团后仍可编辑字段、重写模块、导出 Markdown 和完整备份 JSON。
- 视觉车间：支持上传图片，也可接入 OpenAI 兼容图像模型生成成员图和团体海报。
- 运营中心：作品库、发布日历、短视频创作间、日常选题工坊和 AI 排期助理。
- 公开页：每个团有本地分享链接 `/g/:shareId`，用于展示出道页。
- 本地数据：业务数据统一进入 SQLite，上传图片保存在 `data/`，不会依赖浏览器存储。

## 环境要求

- Node.js 24 或更新版本
- 可选：智谱 GLM 兼容文字模型 Key
- 可选：OpenAI 兼容图像模型 Key

项目没有 npm 依赖，`npm install` 不是必须的。保留 `package.json` 只是为了提供统一脚本。

## 快速启动

```powershell
cd girlgroup-studio
copy .env.example .env
npm start
```

然后打开：

```text
http://localhost:3210/
```

Windows 也可以双击 `启动偶像工坊.bat`。

如果 PowerShell 提示禁止加载 `npm.ps1`，可以改用 `npm.cmd start`，或直接运行 `node server.mjs`。

如果需要排查浏览器或服务状态，可以访问轻量页：

```text
http://localhost:3210/safe.html
```

## 配置

复制 `.env.example` 为 `.env`，按需填写：

```env
PORT=3210
HOST=127.0.0.1
ALLOWED_HOSTS=

ZHIPUAI_API_KEY=
MODEL_ID=glm-5.2

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
IMAGE_MODEL_ID=gpt-image-2
```

文字模型 Key 也可以在应用右上角设置页配置。没有文字模型 Key 时，AI 生成接口会返回配置提示；没有图片模型 Key 时，仍可使用图片上传功能。

## 常用脚本

```powershell
npm start       # 启动本地服务
npm run check   # 对所有 JS/MJS 文件做 node --check 语法检查
npm test        # 使用临时 SQLite 数据库运行隔离测试
npm run smoke:api
```

`smoke:api` 会创建并清理一组测试数据。未配置模型 Key 时，它只测试本地 CRUD、公开页和图片上传；配置 Key 后会额外调用真实文字/图片模型。

## 项目结构

```text
server.mjs              HTTP 服务与 API 路由
db.mjs                  SQLite 数据层
settings.mjs            模型配置读写，保存到 SQLite
validation.mjs          API 输入与模型返回结构校验
config.mjs              .env 与环境变量读取
glm.mjs                 文字模型调用与 JSON 容错解析
images.mjs              图片上传、落盘与图像模型调用
prompts.mjs             多阶段生成提示词
test-api.mjs            API 冒烟测试
scripts/check.mjs       源码语法检查脚本
public/                 前端静态资源
public/index.html       唯一的完整工作台入口
public/app.html         兼容旧链接的跳转入口
public/full.html        兼容旧链接的跳转入口
public/safe.html        轻量排障页
data/                   SQLite 数据库和上传图片，已 gitignore
```

企划、作品、创作间内容、运营周期和模型设置都保存在 `data/starform.db`。图片原文件保存在 `data/uploads/`，数据库保存图片元数据。旧版 `data/settings.json` 会在首次启动时自动迁移到 SQLite，原文件不会自动删除。

工作台的“完整备份”包含企划、作品、创作间选题和图片，可从首页直接恢复；模型 API Key 不会写入备份文件。

## 发布前检查

- 不要提交 `.env`。
- 不要提交 `data/`，里面包含本地数据库、模型 Key 设置和上传图片。
- 不要提交 `design-ref/`，它是本地设计参考资料，不是运行时必需内容。
- 确认 `npm run check` 通过。
- 如果要公开部署，请先阅读 `SECURITY.md`。当前项目默认是单机本地工具，没有账号体系和公网鉴权。

## 许可证

本项目采用 PolyForm Noncommercial License 1.0.0。源码可以公开查看、学习和非商业使用；商业使用不在该许可证授权范围内，需要另行获得许可。

完整条款见 `LICENSE`。
