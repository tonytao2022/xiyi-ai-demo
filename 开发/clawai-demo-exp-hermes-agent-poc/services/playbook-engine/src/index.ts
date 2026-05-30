import "./load-env";
import cors from "cors";
import express from "express";
import mysql, { type RowDataPacket } from "mysql2/promise";

interface FpyrRow {
  date: string;
  totalBatchCount: number;
  qualifiedBatchCount: number;
  defectBatchCount: number;
  fpyr: number;
}

interface DefectRow {
  itemCategory: string;
  itemName: string;
  count: number;
  ratio: number;
}

interface EquipmentRow {
  eventTime: string;
  unit: string;
  eventType: string;
  faultDesc: string | null;
  faultGrade: string | null;
  repairStatus: string | null;
}

interface PlaybookRequest {
  traceId: string;
  analysisType: string;
  input?: Record<string, unknown>;
  facts: {
    fpyrDaily: { rows: FpyrRow[] };
    defectBreakdown: { rows: DefectRow[] };
    equipmentTimeline: { rows: EquipmentRow[] };
  };
}

interface PlaybookResult {
  playbookVersion: string;
  statusLevel: "normal" | "warning" | "critical";
  headline: string;
  keyFindings: string[];
  insights: Array<{
    id: string;
    content: string;
    source: "rule" | "hybrid";
    sourceRefs: string[];
  }>;
  ruleSummary: {
    latestFpyr: number;
    fpyrDelta: number;
    totalDefectBatches: number;
    totalDefectItems: number;
    topDefectCategory?: string;
    topDefectItemName?: string;
    equipmentEventCount: number;
  };
}

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT ?? 3020);
const appDatabase = process.env.APP_DB_NAME ?? "ce_agent_demo";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: appDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  dateStrings: true,
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: appDatabase });
  } catch (error) {
    res.status(500).json({ status: "error", error: getErrorMessage(error) });
  }
});

app.post("/playbooks/execute", async (req, res) => {
  try {
    const request = req.body as PlaybookRequest;
    validateRequest(request);
    const rules = await loadRuleConfig(request.analysisType);
    const result = buildPlaybookResult(request, rules);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
  }
});

/**
 * 只读：供 OpenClaw 插件拉取分支编排配置（来源 rule_config.openclaw_branch_routing）
 */
app.get("/rules/branch-routing", async (req, res) => {
  try {
    const analysisType =
      typeof req.query.analysisType === "string" ? req.query.analysisType : "";
    if (!analysisType) {
      return res.status(400).json({ error: "analysisType 必填" });
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT rule_version, threshold_config
        FROM rule_config
        WHERE analysis_type = ?
          AND rule_key = 'openclaw_branch_routing'
          AND is_active = 1
        ORDER BY id DESC
        LIMIT 1
      `,
      [analysisType]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "未配置 openclaw_branch_routing" });
    }

    const threshold = parseJson<Record<string, unknown>>(row.threshold_config, {});
    const orderedBranches = threshold.orderedBranches;
    if (!Array.isArray(orderedBranches)) {
      return res.status(500).json({ error: "openclaw_branch_routing 缺少 orderedBranches" });
    }

    res.json({
      ruleKey: "openclaw_branch_routing",
      ruleVersion: String(row.rule_version ?? "v1"),
      analysisType,
      orderedBranches,
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.listen(port, () => {
  console.log(`Playbook Engine running on http://localhost:${port}`);
});

async function loadRuleConfig(analysisType: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT rule_key, rule_version, threshold_config
      FROM rule_config
      WHERE analysis_type = ?
        AND is_active = 1
    `,
    [analysisType]
  );

  const configMap = new Map<string, Record<string, unknown>>();
  let playbookVersion = "quality-fpyr-v1";

  for (const row of rows) {
    const parsed = parseJson<Record<string, unknown>>(row.threshold_config, {});
    configMap.set(String(row.rule_key), parsed);
    playbookVersion = String(row.rule_version ?? playbookVersion);
  }

  return {
    playbookVersion,
    fpyrThreshold:
      configMap.get("fpyr_threshold") ??
      ({ warningFpyr: 92, criticalFpyr: 90 } as Record<string, unknown>),
    rootCauseBranching:
      configMap.get("root_cause_branching") ?? ({} as Record<string, unknown>),
  };
}

function buildPlaybookResult(
  request: PlaybookRequest,
  rules: Awaited<ReturnType<typeof loadRuleConfig>>
): PlaybookResult {
  if (request.analysisType === "first_pass_yield_trend_brief") {
    return buildBriefPlaybookResult(request, rules);
  }

  const fpyrRows = request.facts.fpyrDaily.rows;
  const defectRows = request.facts.defectBreakdown.rows;
  const equipmentRows = request.facts.equipmentTimeline.rows;

  const latestFpyr = fpyrRows.at(-1)?.fpyr ?? 0;
  const previousFpyr = fpyrRows.at(-2)?.fpyr ?? latestFpyr;
  const fpyrDelta = round1(latestFpyr - previousFpyr);
  const totalDefectBatches = fpyrRows.reduce(
    (sum, row) => sum + row.defectBatchCount,
    0
  );
  const totalDefectItems = defectRows.reduce((sum, row) => sum + row.count, 0);
  const topDefect = defectRows[0];
  const equipmentEventCount = equipmentRows.length;

  const warningFpyr = toNumber(rules.fpyrThreshold.warningFpyr, 92);
  const criticalFpyr = toNumber(rules.fpyrThreshold.criticalFpyr, 90);
  let statusLevel: PlaybookResult["statusLevel"] = "normal";
  if (latestFpyr < criticalFpyr) {
    statusLevel = "critical";
  } else if (latestFpyr < warningFpyr) {
    statusLevel = "warning";
  }

  const headline = buildHeadline(
    latestFpyr,
    fpyrDelta,
    statusLevel,
    topDefect,
    equipmentEventCount
  );

  const keyFindings = [
    `最新一次校验合格率为 ${latestFpyr}% ，${describeLevel(statusLevel, warningFpyr, criticalFpyr)}。`,
    `当前周期累计不合格批次数 ${totalDefectBatches} 批，不合格项目数 ${totalDefectItems} 条。`,
    topDefect
      ? `主导异常类别为 ${topDefect.itemCategory}，重点项目 ${topDefect.itemName}，占比 ${topDefect.ratio}%。`
      : "当前周期未识别出主导不合格项目类别。",
    equipmentEventCount > 0
      ? `命中 ${equipmentEventCount} 条设备事件，建议与异常批次时间点交叉对照。`
      : "未命中设备事件线索，可优先从检验项目和原料方向排查。",
  ];

  return {
    playbookVersion: rules.playbookVersion,
    statusLevel,
    headline,
    keyFindings,
    insights: buildInsights(statusLevel, topDefect, equipmentEventCount),
    ruleSummary: {
      latestFpyr,
      fpyrDelta,
      totalDefectBatches,
      totalDefectItems,
      topDefectCategory: topDefect?.itemCategory,
      topDefectItemName: topDefect?.itemName,
      equipmentEventCount,
    },
  };
}

/** 趋势简报：仅依据 FPY 序列与阈值，不依赖不合格结构 / 设备时间线事实 */
function buildBriefPlaybookResult(
  request: PlaybookRequest,
  rules: Awaited<ReturnType<typeof loadRuleConfig>>
): PlaybookResult {
  const fpyrRows = request.facts.fpyrDaily.rows;
  const latestFpyr = fpyrRows.at(-1)?.fpyr ?? 0;
  const previousFpyr = fpyrRows.at(-2)?.fpyr ?? latestFpyr;
  const fpyrDelta = round1(latestFpyr - previousFpyr);
  const totalDefectBatches = fpyrRows.reduce(
    (sum, row) => sum + row.defectBatchCount,
    0
  );

  const warningFpyr = toNumber(rules.fpyrThreshold.warningFpyr, 92);
  const criticalFpyr = toNumber(rules.fpyrThreshold.criticalFpyr, 90);
  let statusLevel: PlaybookResult["statusLevel"] = "normal";
  if (latestFpyr < criticalFpyr) {
    statusLevel = "critical";
  } else if (latestFpyr < warningFpyr) {
    statusLevel = "warning";
  }

  const headline = `当前周期最新一次校验合格率为 ${latestFpyr}%，较上一统计点${formatDelta(
    fpyrDelta
  )}，${getLevelText(statusLevel)}（趋势简报，未展开检验项与设备关联）。`;

  const keyFindings = [
    `最新一次校验合格率为 ${latestFpyr}% ，${describeLevel(statusLevel, warningFpyr, criticalFpyr)}。`,
    `当前周期累计不合格批次数 ${totalDefectBatches} 批（仅由合格率序列汇总，未在本次简报中查询不合格项目结构）。`,
  ];

  return {
    playbookVersion: rules.playbookVersion,
    statusLevel,
    headline,
    keyFindings,
    insights: [
      {
        id: "insight-brief-1",
        content:
          statusLevel === "normal"
            ? "合格率处于目标阈值内，如需根因分析请使用「深度诊断」任务。"
            : "已触发预警级别，建议发起深度诊断任务以获得检验项与设备关联结论。",
        source: "rule",
        sourceRefs: ["ref-fpyr-metric"],
      },
    ],
    ruleSummary: {
      latestFpyr,
      fpyrDelta,
      totalDefectBatches,
      totalDefectItems: 0,
      equipmentEventCount: 0,
    },
  };
}

function buildHeadline(
  latestFpyr: number,
  fpyrDelta: number,
  statusLevel: PlaybookResult["statusLevel"],
  topDefect: DefectRow | undefined,
  equipmentEventCount: number
) {
  const levelText = getLevelText(statusLevel);
  const equipmentHint =
    equipmentEventCount > 0
      ? `同期发现 ${equipmentEventCount} 条设备事件，可作为辅助排查线索。`
      : "当前未发现设备事件线索。";

  if (!topDefect) {
    return `当前周期最新一次校验合格率为 ${latestFpyr}%，较上一统计点${formatDelta(
      fpyrDelta
    )}，${levelText}。`;
  }

  return `当前周期最新一次校验合格率为 ${latestFpyr}%，较上一统计点${formatDelta(
    fpyrDelta
  )}，${levelText}；主导异常类别为 ${topDefect.itemCategory}，首位项目为 ${topDefect.itemName}。${equipmentHint}`;
}

function buildInsights(
  statusLevel: PlaybookResult["statusLevel"],
  topDefect: DefectRow | undefined,
  equipmentEventCount: number
) {
  const insights: PlaybookResult["insights"] = [
    {
      id: "insight-1",
      content:
        statusLevel === "normal"
          ? "当前一次校验合格率处于目标阈值内，建议继续保持日常监控。"
          : "当前一次校验合格率低于目标阈值，建议触发质量异常排查流程。",
      source: "rule",
      sourceRefs: ["ref-fpyr-metric"],
    },
  ];

  if (topDefect) {
    insights.push({
      id: "insight-2",
      content: `${topDefect.itemCategory} 为当前主导异常类别，建议优先核查 ${topDefect.itemName} 对应工艺、来料或检验环节。`,
      source: "rule",
      sourceRefs: ["ref-defect-metric"],
    });
  }

  insights.push({
    id: "insight-3",
    content:
      equipmentEventCount > 0
        ? `检测到 ${equipmentEventCount} 条设备事件，建议按时间线与异常批次进行对照，判断设备因素是否为辅助诱因。`
        : "未检出设备事件，建议优先从检验项目结构和原料方向继续排查。",
    source: "hybrid",
    sourceRefs: ["ref-equipment-metric"],
  });

  return insights;
}

function validateRequest(request: PlaybookRequest): asserts request is PlaybookRequest {
  if (!request?.traceId) {
    throw new TypeError("traceId 必填");
  }

  if (!request?.analysisType) {
    throw new TypeError("analysisType 必填");
  }

  if (!request?.facts?.fpyrDaily?.rows || !Array.isArray(request.facts.fpyrDaily.rows)) {
    throw new TypeError("facts.fpyrDaily.rows 必须为数组");
  }

  if (
    !request?.facts?.defectBreakdown?.rows ||
    !Array.isArray(request.facts.defectBreakdown.rows)
  ) {
    throw new TypeError("facts.defectBreakdown.rows 必须为数组");
  }

  if (
    !request?.facts?.equipmentTimeline?.rows ||
    !Array.isArray(request.facts.equipmentTimeline.rows)
  ) {
    throw new TypeError("facts.equipmentTimeline.rows 必须为数组");
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function formatDelta(delta: number) {
  if (delta === 0) {
    return "持平";
  }
  return `${delta > 0 ? "上升" : "下降"} ${Math.abs(delta)}pp`;
}

function describeLevel(
  statusLevel: PlaybookResult["statusLevel"],
  warningFpyr: number,
  criticalFpyr: number
) {
  switch (statusLevel) {
    case "critical":
      return `低于严重阈值 ${criticalFpyr}%`;
    case "warning":
      return `低于预警阈值 ${warningFpyr}%`;
    default:
      return `高于预警阈值 ${warningFpyr}%`;
  }
}

function getLevelText(statusLevel: PlaybookResult["statusLevel"]) {
  switch (statusLevel) {
    case "critical":
      return "已触发严重预警";
    case "warning":
      return "已触发预警";
    default:
      return "当前处于正常区间";
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}
