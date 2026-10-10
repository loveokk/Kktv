#!/usr/bin/env node

/**
 * Kktv script-to-storyboard
 *
 * 将剧本、故事梗概或小说片段转换为可拍摄的 AI 短剧分镜脚本。
 * 输出内容遵循 ai-drama-master-shot 的核心规则：
 *   - 先做保留剪辑
 *   - 建立角色 / 场景 / 道具资产表
 *   - 按场景级 master shot 生成
 *   - 再从 master shot 中剪辑出镜头表
 *
 * 无第三方依赖，Node.js 18+。
 *
 * 示例：
 *   node scripts/script-to-storyboard.mjs --input story.md --out ./storyboard-output
 *   node scripts/script-to-storyboard.mjs --idea "女频复仇，现代都市，30集短剧" --out ./out
 *   node scripts/script-to-storyboard.mjs --input story.md --dry-run
 *
 * 环境变量：
 *   KKTV_SCRIPT_API_BASE   OpenAI 兼容接口，例如 https://ark.cn-beijing.volces.com/api/v3
 *   KKTV_SCRIPT_API_KEY    接口 Key
 *   KKTV_SCRIPT_MODEL      模型 ID，例如 doubao-seed-1-6 或任意文本模型
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUT = "./storyboard-output";
const DEFAULT_ASPECT = "9:16";
const DEFAULT_EPISODE_DURATION = "60秒";
const DEFAULT_PLATFORM = "竖屏短剧";
const JSON_SCHEMA_VERSION = "kktv.storyboard.v1";

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith("--")) {
            args._.push(token);
            continue;
        }
        const [rawKey, inlineValue] = token.slice(2).split("=", 2);
        const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        if (inlineValue !== undefined) {
            args[key] = inlineValue;
            continue;
        }
        const next = argv[i + 1];
        if (!next || next.startsWith("--")) {
            args[key] = true;
            continue;
        }
        args[key] = next;
        i += 1;
    }
    return args;
}

function usage() {
    return `Kktv 剧本转分镜脚本

用法:
  node scripts/script-to-storyboard.mjs --input <剧本文件> [选项]
  node scripts/script-to-storyboard.mjs --idea "<故事创意>" [选项]

选项:
  --input <file>          输入剧本 / 小说 / 梗概文件
  --idea <text>           直接输入故事创意
  --out <dir>             输出目录，默认 ${DEFAULT_OUT}
  --model <id>            覆盖模型 ID
  --base-url <url>        覆盖 OpenAI 兼容接口
  --api-key <key>         覆盖 API Key（不建议写进命令历史）
  --aspect <ratio>        画幅，默认 ${DEFAULT_ASPECT}
  --episode-duration <s>  单集目标时长，默认 ${DEFAULT_EPISODE_DURATION}
  --platform <name>       目标平台，默认 ${DEFAULT_PLATFORM}
  --dry-run               不调用模型，输出可编辑的骨架文件
  --print                 同时把 Markdown 输出到终端
  --help                  显示帮助
`;
}

function requireInput(args) {
    if (args.idea) return `【故事创意】\n${args.idea}`;
    if (args.input) return null;
    if (args._.length) return null;
    return null;
}

async function readInput(args) {
    if (args.idea) return `【故事创意】\n${args.idea}`;
    if (args.input) return readFile(path.resolve(args.input), "utf8");
    if (args._.length) return readFile(path.resolve(args._[0]), "utf8");
    return null;
}

function extractJson(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("模型返回为空");
    const candidates = [trimmed];
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) candidates.push(fenced[1].trim());
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    for (const candidate of candidates) {
        try { return JSON.parse(candidate); } catch { /* try next */ }
    }
    throw new Error("无法解析模型返回的 JSON。请让模型只输出 JSON，或重试。");
}

function normalize(value) {
    return String(value ?? "").trim();
}

function normalizeList(value) {
    if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
    if (typeof value === "string") return value.split(/[，,、]/).map(normalize).filter(Boolean);
    return [];
}

function normalizeStoryboard(data, meta) {
    const project = data.project || {};
    const characters = Array.isArray(data.characters) ? data.characters : [];
    const scenes = Array.isArray(data.scenes) ? data.scenes : [];
    const props = Array.isArray(data.props) ? data.props : [];
    const masters = Array.isArray(data.masters) ? data.masters : Array.isArray(data.masterShots) ? data.masterShots : [];
    const shots = Array.isArray(data.shots) ? data.shots : Array.isArray(data.storyboard) ? data.storyboard : [];
    return {
        schemaVersion: JSON_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        meta,
        project: {
            title: normalize(project.title || "未命名短剧"),
            logline: normalize(project.logline),
            genre: normalize(project.genre),
            tone: normalize(project.tone),
            targetAudience: normalize(project.targetAudience),
            platform: normalize(project.platform || meta.platform),
            aspectRatio: normalize(project.aspectRatio || meta.aspectRatio),
            episodeDuration: normalize(project.episodeDuration || meta.episodeDuration),
        },
        retentionEdit: Array.isArray(data.retentionEdit) ? data.retentionEdit : [],
        characters: characters.map((item, index) => ({
            id: normalize(item.id || `CHAR-${String(index + 1).padStart(2, "0")}`),
            name: normalize(item.name),
            role: normalize(item.role),
            firstAppearance: normalize(item.firstAppearance),
            fixedAttributes: normalize(item.fixedAttributes || item.appearance),
            wardrobe: normalize(item.wardrobe),
            props: normalize(item.props),
            referencePrompt: normalize(item.referencePrompt || item.imagePrompt),
            continuityLock: normalize(item.continuityLock),
        })).filter((item) => item.name || item.referencePrompt),
        scenes: scenes.map((item, index) => ({
            id: normalize(item.id || `SCENE-${String(index + 1).padStart(2, "0")}`),
            name: normalize(item.name),
            time: normalize(item.time || item.timeOfDay),
            location: normalize(item.location),
            fixedLayout: normalize(item.fixedLayout || item.layout),
            lighting: normalize(item.lighting),
            weather: normalize(item.weather),
            referencePrompt: normalize(item.referencePrompt || item.imagePrompt),
        })).filter((item) => item.name || item.referencePrompt),
        props: props.map((item, index) => ({
            id: normalize(item.id || `PROP-${String(index + 1).padStart(2, "0")}`),
            name: normalize(item.name),
            state: normalize(item.state),
            scale: normalize(item.scale),
            referencePrompt: normalize(item.referencePrompt || item.imagePrompt),
        })).filter((item) => item.name || item.referencePrompt),
        masters: masters.map((item, index) => ({
            masterId: normalize(item.masterId || item.id || `M${String(index + 1).padStart(2, "0")}`),
            sceneId: normalize(item.sceneId),
            durationSeconds: Number(item.durationSeconds || item.duration || 10),
            characters: normalizeList(item.characters || item.characterIds),
            referenceIds: normalizeList(item.referenceIds),
            objective: normalize(item.objective || item.dramaticObjective),
            camera: normalize(item.camera),
            dialogueSound: normalize(item.dialogueSound || item.dialogue),
            fallback: normalize(item.fallback),
        })).filter((item) => item.masterId || item.objective),
        shots: shots.map((item, index) => ({
            shotId: normalize(item.shotId || item.id || `S${String(index + 1).padStart(3, "0")}`),
            sourceMaster: normalize(item.sourceMaster || item.masterId),
            timeInMaster: normalize(item.timeInMaster || item.time),
            finalDuration: normalize(item.finalDuration || item.duration),
            shotSize: normalize(item.shotSize),
            crop: normalize(item.crop || item.punchIn),
            dialogueSound: normalize(item.dialogueSound || item.dialogue),
            purpose: normalize(item.purpose),
            sceneId: normalize(item.sceneId),
            characters: normalizeList(item.characters),
            action: normalize(item.action),
            imagePrompt: normalize(item.imagePrompt),
            videoPrompt: normalize(item.videoPrompt),
            negativePrompt: normalize(item.negativePrompt),
            continuityLock: normalize(item.continuityLock),
        })).filter((item) => item.shotId || item.action || item.videoPrompt),
        qcChecklist: Array.isArray(data.qcChecklist) ? data.qcChecklist.map(normalize).filter(Boolean) : [],
        assumptions: Array.isArray(data.assumptions) ? data.assumptions.map(normalize).filter(Boolean) : [],
    };
}

function buildSystemPrompt() {
    return `你是 Kktv 的 AI 短剧分镜总监。你的任务是把剧本、小说片段或故事创意转换为可执行的 AI 短剧分镜脚本。

必须遵守：
1. 先做保留剪辑：前3秒必须有异常、冲突、威胁、冲击或问题；每10-15秒必须有新信息；结尾必须有决定、反转、悬念或未解问题。
2. 不要按每个短切镜头直接生成视频。先按“地点 + 连续时间 + 一个戏剧目标”拆成场景级 master shot，再从 master shot 规划剪辑镜头。
3. 默认安全生成时长 8-12 秒；如无明确模型能力，不确定多镜头、口型、音频能力。
4. 重要角色必须稳定：建立 CHAR-01 等角色资产，固定脸、发型、服装、道具和连续性锁。
5. 场景建立 SCENE-01 等资产，固定布局、门窗位置、光线方向、时间和天气。
6. 道具建立 PROP-01 等资产，固定手别、朝向、损坏状态和比例。
7. 视频提示词只描述一个 master generation unit，不要把整张分镜表塞进视频模型。
8. 对白要短，约每秒 3-5 个中文字符；口型不可靠时优先静音生成 + 后期配音。
9. 不编造不可控复杂动作：默认避免复杂打斗、追车、儿童、动物、手部特写和多人混乱场景。
10. 屏幕文字、手机消息、文件、日期必须作为静态插入镜头或后期添加，不要求视频模型生成可读文字。

只输出 JSON，不要 Markdown，不要解释。JSON 顶层字段必须包括：
project, assumptions, retentionEdit, characters, scenes, props, masters, shots, qcChecklist。

字段要求：
project: { title, logline, genre, tone, targetAudience, platform, aspectRatio, episodeDuration }
assumptions: string[]
retentionEdit: [{ item, decision, reason, replacement }]，decision 使用 keep/cut/compress
characters: [{ id, name, role, firstAppearance, fixedAttributes, wardrobe, props, referencePrompt, continuityLock }]
scenes: [{ id, name, time, location, fixedLayout, lighting, weather, referencePrompt }]
props: [{ id, name, state, scale, referencePrompt }]
masters: [{ masterId, sceneId, durationSeconds, characters, referenceIds, objective, camera, dialogueSound, fallback }]
shots: [{ shotId, sourceMaster, sceneId, timeInMaster, finalDuration, shotSize, crop, dialogueSound, purpose, characters, action, imagePrompt, videoPrompt, negativePrompt, continuityLock }]
qcChecklist: string[]

要求：
- 角色参考图 prompt 必须包含：媒介风格、年龄/体型、面部特征、发型、服装材质、道具、正面/三分之四/背面/特写、中性背景、光线、无文字无水印。
- 场景参考图 prompt 必须包含：媒介风格、地点、时间、固定建筑/家具、光源方向、天气氛围、机位高度/镜头、无人或虚化人物、无文字无水印。
- 视频 prompt 必须包含：风格与媒介、时长与单镜、参考图角色、首帧、动作节奏、运镜、对白/声音、光线环境、连续性锁、负面约束、可支持的后期剪点。
- 所有镜头必须能追溯到 masterId。
- 每个 master 只能有一个地点、一个连续时间、一个戏剧目标。`;
}

function buildUserPrompt(source, meta) {
    return `目标平台：${meta.platform}
画幅：${meta.aspectRatio}
单集目标时长：${meta.episodeDuration}

请把下面的剧本/故事素材转换为完整分镜脚本。只输出 JSON。

【素材开始】
${source}
【素材结束】`;
}

function dryRunData(source, meta) {
    const ideaLine = source.match(/^【故事创意】\s*\n(.+)$/m)?.[1]?.trim();
    const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || ideaLine || "未命名短剧";
    return normalizeStoryboard({
        project: {
            title,
            logline: "请根据输入素材补充一句话故事线。",
            genre: "待填写",
            tone: "待填写",
            targetAudience: "待填写",
            platform: meta.platform,
            aspectRatio: meta.aspectRatio,
            episodeDuration: meta.episodeDuration,
        },
        assumptions: [
            "当前为 dry-run 骨架，没有调用模型。",
            "请补充目标模型的最大单段时长、是否支持参考图、首帧、多镜头、口型和音频。",
        ],
        retentionEdit: [
            { item: "前3秒钩子", decision: "keep", reason: "决定首屏留存", replacement: "用异常、冲突或悬念开场" },
            { item: "长段背景解释", decision: "compress", reason: "降低信息密度", replacement: "改为一句台词或一个视觉插入" },
        ],
        characters: [
            {
                id: "CHAR-01",
                name: "主角",
                role: "主角",
                firstAppearance: "第1场",
                fixedAttributes: "年龄、脸型、眼睛、肤色、体型、发型请在这里写死",
                wardrobe: "服装、材质、颜色、配饰请在这里写死",
                props: "随身道具请在这里写死",
                referencePrompt: "请填写完整角色参考图 prompt",
                continuityLock: "脸、发型、服装、道具、体型、肤色保持一致",
            },
        ],
        scenes: [
            {
                id: "SCENE-01",
                name: "主场景",
                time: "日/夜",
                location: "地点",
                fixedLayout: "门窗、家具、桌椅、空间关系",
                lighting: "主光方向、色温、阴影",
                weather: "晴/雨/雪/雾",
                referencePrompt: "请填写完整场景参考图 prompt",
            },
        ],
        props: [
            { id: "PROP-01", name: "关键道具", state: "初始状态", scale: "手持/桌面/房间尺度", referencePrompt: "请填写完整道具参考图 prompt" },
        ],
        masters: [
            { masterId: "M01", sceneId: "SCENE-01", durationSeconds: 10, characters: ["CHAR-01"], referenceIds: ["CHAR-01", "SCENE-01"], objective: "本场戏剧目标", camera: "缓慢推进", dialogueSound: "一句短对白 + 环境声", fallback: "如果身份漂移，拆成两个 master 或静音生成" },
        ],
        shots: [
            { shotId: "S001", sourceMaster: "M01", sceneId: "SCENE-01", timeInMaster: "0.0-2.0s", finalDuration: "2.0s", shotSize: "中近景", crop: "1.0x", dialogueSound: "无", purpose: "建立人物", characters: ["CHAR-01"], action: "主角进入画面并停住", imagePrompt: "请填写首帧图片 prompt", videoPrompt: "请填写单 master 视频 prompt", negativePrompt: "换脸、换装、多人、手部畸变、文字、水印、镜头抖动", continuityLock: "与 CHAR-01 和 SCENE-01 保持一致" },
        ],
        qcChecklist: [
            "每个 master 只有一个地点、一个连续时间、一个戏剧目标。",
            "每个镜头都能追溯到 masterId。",
            "角色、服装、道具、场景、光线方向、轴线一致。",
            "前3秒有钩子，每10-15秒有新信息，结尾有悬念或决定。",
        ],
    }, meta);
}

function markdown(data) {
    const lines = [];
    lines.push(`# ${data.project.title}`);
    lines.push("");
    lines.push(`- 类型：${data.project.genre || "待填写"}`);
    lines.push(`- 基调：${data.project.tone || "待填写"}`);
    lines.push(`- 平台：${data.project.platform}`);
    lines.push(`- 画幅：${data.project.aspectRatio}`);
    lines.push(`- 单集时长：${data.project.episodeDuration}`);
    lines.push(`- 故事线：${data.project.logline || "待填写"}`);
    lines.push("");
    lines.push("## 1. 保留剪辑");
    lines.push("");
    lines.push("| 条目 | 保留/删除/压缩 | 原因 | 替代方式 |");
    lines.push("|---|---|---|---|");
    for (const item of data.retentionEdit) lines.push(`| ${item.item || ""} | ${item.decision || ""} | ${item.reason || ""} | ${item.replacement || ""} |`);
    lines.push("");
    lines.push("## 2. 角色资产表");
    lines.push("");
    lines.push("| ID | 角色 | 固定属性 | 服装/道具 | 参考图 Prompt |");
    lines.push("|---|---|---|---|---|");
    for (const item of data.characters) lines.push(`| ${item.id} | ${item.name} | ${item.fixedAttributes} | ${[item.wardrobe, item.props].filter(Boolean).join("；")} | ${item.referencePrompt} |`);
    lines.push("");
    lines.push("## 3. 场景与道具");
    lines.push("");
    lines.push("| ID | 场景 | 时间/天气 | 固定布局 | 光线 | 参考图 Prompt |");
    lines.push("|---|---|---|---|---|---|");
    for (const item of data.scenes) lines.push(`| ${item.id} | ${item.name} / ${item.location} | ${[item.time, item.weather].filter(Boolean).join("；")} | ${item.fixedLayout} | ${item.lighting} | ${item.referencePrompt} |`);
    if (data.props.length) {
        lines.push("");
        lines.push("| ID | 道具 | 状态 | 尺度 | 参考图 Prompt |");
        lines.push("|---|---|---|---|---|");
        for (const item of data.props) lines.push(`| ${item.id} | ${item.name} | ${item.state} | ${item.scale} | ${item.referencePrompt} |`);
    }
    lines.push("");
    lines.push("## 4. Master Shot 表");
    lines.push("");
    lines.push("| Master | 场景 | 时长 | 角色 | 参考资产 | 戏剧目标 | 运镜 | 对白/声音 | 兜底 |");
    lines.push("|---|---|---:|---|---|---|---|---|---|");
    for (const item of data.masters) lines.push(`| ${item.masterId} | ${item.sceneId} | ${item.durationSeconds}s | ${item.characters.join("、")} | ${item.referenceIds.join("、")} | ${item.objective} | ${item.camera} | ${item.dialogueSound} | ${item.fallback} |`);
    lines.push("");
    lines.push("## 5. 镜头剪辑表");
    lines.push("");
    lines.push("| 镜头 | 来源 Master | Master 时间 | 成片时长 | 景别 | 裁剪 | 对白/声音 | 目的 | 画面动作 |");
    lines.push("|---|---|---|---:|---|---|---|---|---|");
    for (const item of data.shots) lines.push(`| ${item.shotId} | ${item.sourceMaster} | ${item.timeInMaster} | ${item.finalDuration} | ${item.shotSize} | ${item.crop} | ${item.dialogueSound} | ${item.purpose} | ${item.action} |`);
    lines.push("");
    lines.push("## 6. 生成 Prompt");
    for (const item of data.shots) {
        lines.push("");
        lines.push(`### ${item.shotId} · ${item.sourceMaster || "未指定 master"}`);
        lines.push("");
        lines.push(`- 图片 Prompt：${item.imagePrompt || "待填写"}`);
        lines.push(`- 视频 Prompt：${item.videoPrompt || "待填写"}`);
        lines.push(`- 连续性锁：${item.continuityLock || "待填写"}`);
        lines.push(`- 负面约束：${item.negativePrompt || "待填写"}`);
    }
    lines.push("");
    lines.push("## 7. QC 清单");
    for (const item of data.qcChecklist) lines.push(`- [ ] ${item}`);
    lines.push("");
    lines.push("## 8. 假设与模型约束");
    for (const item of data.assumptions) lines.push(`- ${item}`);
    lines.push("");
    return lines.join("\n");
}

async function callModel({ baseUrl, apiKey, model, system, user }) {
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`模型接口返回 ${response.status}: ${text.slice(0, 800)}`);
    const payload = JSON.parse(text);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`模型返回缺少 choices[0].message.content: ${text.slice(0, 800)}`);
    return extractJson(content);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(usage());
        return;
    }
    const source = await readInput(args);
    if (!source || !source.trim()) {
        console.error(usage());
        process.exitCode = 2;
        return;
    }
    const meta = {
        platform: args.platform || DEFAULT_PLATFORM,
        aspectRatio: args.aspect || DEFAULT_ASPECT,
        episodeDuration: args.episodeDuration || DEFAULT_EPISODE_DURATION,
    };
    const outDir = path.resolve(args.out || DEFAULT_OUT);
    await mkdir(outDir, { recursive: true });
    let data;
    if (args.dryRun) {
        data = dryRunData(source, meta);
    } else {
        const baseUrl = args.baseUrl || process.env.KKTV_SCRIPT_API_BASE;
        const apiKey = args.apiKey || process.env.KKTV_SCRIPT_API_KEY || "";
        const model = args.model || process.env.KKTV_SCRIPT_MODEL;
        if (!baseUrl) throw new Error("缺少 --base-url 或 KKTV_SCRIPT_API_BASE");
        if (!model) throw new Error("缺少 --model 或 KKTV_SCRIPT_MODEL");
        const raw = await callModel({
            baseUrl,
            apiKey,
            model,
            system: buildSystemPrompt(),
            user: buildUserPrompt(source, meta),
        });
        data = normalizeStoryboard(raw, meta);
    }
    const jsonPath = path.join(outDir, "storyboard.json");
    const mdPath = path.join(outDir, "storyboard.md");
    await writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    const md = markdown(data);
    await writeFile(mdPath, md, "utf8");
    console.log(`已生成：${jsonPath}`);
    console.log(`已生成：${mdPath}`);
    if (args.print) console.log(`\n${md}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
