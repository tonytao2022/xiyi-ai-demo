import "./load-env";
import cors from "cors";
import express from "express";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import type {
  MetricDefinitionRef,
  MetricFilter,
  MetricQuery,
  MetricQueryResult,
} from "@ce-demo/metric-contract";

type SupportedMetricKey =
  | "fpyr_daily"
  | "defect_item_breakdown"
  | "equipment_event_timeline";

interface AppConfig {
  port: number;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  mesDatabase: string;
  appDatabase: string;
}

interface QueryExecutionResult {
  rows: Array<Record<string, string | number | boolean | null>>;
  dataTimestamp: string;
  queryTemplateKey: string;
  metricDefinitions: MetricDefinitionRef[];
}

interface SqlFilterContext {
  stockAlias?: string;
  judgeAlias?: string;
  itemAlias?: string;
  equipmentAlias?: string;
}

const app = express();
app.use(cors());
app.use(express.json());

const config = loadConfig();
const mesPool = createPool(config.mesDatabase);
const appPool = createPool(config.appDatabase);

app.get("/health", async (_req, res) => {
  try {
    await mesPool.query("SELECT 1");
    await appPool.query("SELECT 1");
    res.json({
      status: "ok",
      databases: {
        mes: config.mesDatabase,
        app: config.appDatabase,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

app.post("/metrics/query", async (req, res) => {
  const startedAt = Date.now();
  const query = req.body as MetricQuery;

  try {
    validateMetricQuery(query);
    const result = await executeMetricQuery(query);
    const queryAuditId = uuidv4();

    await insertAuditRecord({
      queryAuditId,
      query,
      result,
      durationMs: Date.now() - startedAt,
      status: "completed",
    });

    const payload: MetricQueryResult = {
      queryAuditId,
      requestedAt: new Date().toISOString(),
      sourceSystem: "MES",
      dataTimestamp: result.dataTimestamp,
      metricDefinitions: result.metricDefinitions,
      rows: result.rows,
    };

    res.json(payload);
  } catch (error) {
    if (query?.auditContext?.traceId && query?.metricKey) {
      await insertAuditRecord({
        queryAuditId: uuidv4(),
        query,
        result: null,
        durationMs: Date.now() - startedAt,
        status: "failed",
        errorMessage: getErrorMessage(error),
      });
    }

    res.status(400).json({
      error: getErrorMessage(error),
    });
  }
});

app.listen(config.port, () => {
  console.log(`Semantic API running on http://localhost:${config.port}`);
});

function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3010),
    dbHost: process.env.DB_HOST ?? "127.0.0.1",
    dbPort: Number(process.env.DB_PORT ?? 3306),
    dbUser: process.env.DB_USER ?? "root",
    dbPassword: process.env.DB_PASSWORD ?? "",
    mesDatabase: process.env.MES_DB_NAME ?? "mes_demo",
    appDatabase: process.env.APP_DB_NAME ?? "ce_agent_demo",
  };
}

function createPool(database: string): Pool {
  return mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    dateStrings: true,
  });
}

function validateMetricQuery(query: MetricQuery): asserts query is MetricQuery {
  if (!query || typeof query !== "object") {
    throw new Error("请求体必须是合法的 MetricQuery 对象");
  }

  const supportedMetricKeys: SupportedMetricKey[] = [
    "fpyr_daily",
    "defect_item_breakdown",
    "equipment_event_timeline",
  ];

  if (!supportedMetricKeys.includes(query.metricKey as SupportedMetricKey)) {
    throw new Error(`暂不支持的 metricKey: ${query.metricKey}`);
  }

  if (!Array.isArray(query.dimensions)) {
    throw new TypeError("dimensions 必须是数组");
  }

  if (!Array.isArray(query.filters)) {
    throw new TypeError("filters 必须是数组");
  }

  if (!query.timeRange?.startAt || !query.timeRange?.endAt) {
    throw new Error("timeRange.startAt 和 timeRange.endAt 必填");
  }

  if (!query.auditContext?.traceId) {
    throw new Error("auditContext.traceId 必填");
  }
}

async function executeMetricQuery(query: MetricQuery): Promise<QueryExecutionResult> {
  switch (query.metricKey as SupportedMetricKey) {
    case "fpyr_daily":
      return executeFpyrDaily(query);
    case "defect_item_breakdown":
      return executeDefectItemBreakdown(query);
    case "equipment_event_timeline":
      return executeEquipmentEventTimeline(query);
  }
}

async function executeFpyrDaily(query: MetricQuery): Promise<QueryExecutionResult> {
  const params: Array<string | number> = [
    toMysqlDateTime(query.timeRange.startAt),
    toMysqlDateTime(query.timeRange.endAt),
  ];
  const where = [
    "s.stock_chng_time BETWEEN ? AND ?",
    "d.pch_judge_code IN ('S', 'A', 'B', 'F', 'N')",
  ];

  appendFilters(query.filters, where, params, {
    stockAlias: "s",
    judgeAlias: "d",
  });

  const [rows] = await mesPool.query<RowDataPacket[]>(
    `
      SELECT
        DATE_FORMAT(s.stock_chng_time, '%Y-%m-%d') AS date,
        SUM(CASE WHEN d.pch_judge_code IN ('S', 'A', 'B', 'F') THEN 1 ELSE 0 END) AS totalBatchCount,
        SUM(CASE WHEN d.pch_judge_code = 'S' THEN 1 ELSE 0 END) AS qualifiedBatchCount,
        SUM(CASE WHEN d.pch_judge_code IN ('A', 'B', 'F') THEN 1 ELSE 0 END) AS defectBatchCount,
        ROUND(
          SUM(CASE WHEN d.pch_judge_code = 'S' THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN d.pch_judge_code IN ('S', 'A', 'B', 'F') THEN 1 ELSE 0 END), 0)
          * 100,
          1
        ) AS fpyr
      FROM ${config.mesDatabase}.tsh_pro_stock_record s
      INNER JOIN ${config.mesDatabase}.tdmmm d ON d.mat_no = s.mat_no
      WHERE ${where.join(" AND ")}
      GROUP BY DATE_FORMAT(s.stock_chng_time, '%Y-%m-%d')
      ORDER BY date ASC
      LIMIT ?
    `,
    [...params, query.limit ?? 100]
  );

  const dataTimestamp = await getScalarTimestamp(
    `
      SELECT MAX(s.stock_chng_time) AS dataTimestamp
      FROM ${config.mesDatabase}.tsh_pro_stock_record s
      INNER JOIN ${config.mesDatabase}.tdmmm d ON d.mat_no = s.mat_no
      WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows: rows.map((row) => ({
      date: String(row.date),
      totalBatchCount: Number(row.totalBatchCount ?? 0),
      qualifiedBatchCount: Number(row.qualifiedBatchCount ?? 0),
      defectBatchCount: Number(row.defectBatchCount ?? 0),
      fpyr: Number(row.fpyr ?? 0),
    })),
    dataTimestamp,
    queryTemplateKey: "fpyr_daily_v1",
    metricDefinitions: [
      {
        metricKey: "fpyr_daily",
        metricName: "日一次校验合格率",
        definitionVersion: "v1",
        unit: "%",
      },
    ],
  };
}

async function executeDefectItemBreakdown(
  query: MetricQuery
): Promise<QueryExecutionResult> {
  const params: Array<string | number> = [
    toMysqlDateTime(query.timeRange.startAt),
    toMysqlDateTime(query.timeRange.endAt),
  ];
  const where = [
    "s.stock_chng_time BETWEEN ? AND ?",
    "d.pch_judge_code IN ('A', 'B', 'F')",
    "r.result_judge_code IN ('A', 'B', 'F')",
  ];

  appendFilters(query.filters, where, params, {
    stockAlias: "s",
    judgeAlias: "d",
    itemAlias: "r",
  });

  const [rows] = await mesPool.query<RowDataPacket[]>(
    `
      WITH defect_rows AS (
        SELECT
          COALESCE(
            m.item_category,
            CASE
              WHEN r.item_name LIKE '%磁%' OR r.item_name LIKE '%磁性%' THEN '磁物类'
              WHEN r.item_name LIKE '%ICP%' OR r.item_name LIKE '%AAS%' THEN 'ICP类'
              WHEN r.item_name LIKE '%粒度%' OR r.item_name LIKE '%筛分%' OR r.item_name LIKE '%D50%' OR r.item_name LIKE '%粒径%' THEN '粒度类'
              ELSE '其他类'
            END
          ) AS itemCategory,
          r.item_name AS itemName
        FROM ${config.mesDatabase}.tsh_pro_stock_record s
        INNER JOIN ${config.mesDatabase}.tdmmm d ON d.mat_no = s.mat_no
        INNER JOIN ${config.mesDatabase}.tqmtq_entrust_result r ON r.entr_no = d.entr_no
        LEFT JOIN ${config.appDatabase}.item_category_mapping m
          ON m.dict_type = 'qm_test_type'
         AND m.is_active = 1
         AND (
            (m.item_code IS NOT NULL AND m.item_code = r.item_code)
            OR (m.item_name IS NOT NULL AND m.item_name = r.item_name)
         )
        WHERE ${where.join(" AND ")}
      ),
      agg AS (
        SELECT itemCategory, itemName, COUNT(*) AS itemCount
        FROM defect_rows
        GROUP BY itemCategory, itemName
      ),
      total AS (
        SELECT SUM(itemCount) AS totalCount FROM agg
      )
      SELECT
        agg.itemCategory,
        agg.itemName,
        agg.itemCount AS count,
        ROUND(agg.itemCount / NULLIF(total.totalCount, 0) * 100, 1) AS ratio
      FROM agg
      CROSS JOIN total
      ORDER BY agg.itemCount DESC, agg.itemCategory ASC, agg.itemName ASC
      LIMIT ?
    `,
    [...params, query.limit ?? 100]
  );

  const dataTimestamp = await getScalarTimestamp(
    `
      SELECT MAX(COALESCE(r.test_time, d.judge_time, s.stock_chng_time)) AS dataTimestamp
      FROM ${config.mesDatabase}.tsh_pro_stock_record s
      INNER JOIN ${config.mesDatabase}.tdmmm d ON d.mat_no = s.mat_no
      INNER JOIN ${config.mesDatabase}.tqmtq_entrust_result r ON r.entr_no = d.entr_no
      WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows: rows.map((row) => ({
      itemCategory: String(row.itemCategory),
      itemName: String(row.itemName),
      count: Number(row.count ?? 0),
      ratio: Number(row.ratio ?? 0),
    })),
    dataTimestamp,
    queryTemplateKey: "defect_item_breakdown_v1",
    metricDefinitions: [
      {
        metricKey: "defect_item_breakdown",
        metricName: "不合格项目结构分布",
        definitionVersion: "v1",
      },
    ],
  };
}

async function executeEquipmentEventTimeline(
  query: MetricQuery
): Promise<QueryExecutionResult> {
  const params: Array<string | number> = [
    toMysqlDateTime(query.timeRange.startAt),
    toMysqlDateTime(query.timeRange.endAt),
  ];
  const where = ["e.fault_time BETWEEN ? AND ?"];

  appendFilters(query.filters, where, params, {
    equipmentAlias: "e",
  });

  const [rows] = await mesPool.query<RowDataPacket[]>(
    `
      SELECT
        DATE_FORMAT(e.fault_time, '%Y-%m-%dT%H:%i:%s') AS eventTime,
        e.affiliated_unit AS unit,
        e.event_type AS eventType,
        e.fault_desc AS faultDesc,
        e.fault_grade AS faultGrade,
        e.repair_status AS repairStatus
      FROM ${config.mesDatabase}.teq_repair_manage e
      WHERE ${where.join(" AND ")}
      ORDER BY e.fault_time ASC
      LIMIT ?
    `,
    [...params, query.limit ?? 100]
  );

  const dataTimestamp = await getScalarTimestamp(
    `
      SELECT MAX(e.fault_time) AS dataTimestamp
      FROM ${config.mesDatabase}.teq_repair_manage e
      WHERE ${where.join(" AND ")}
    `,
    params
  );

  return {
    rows: rows.map((row) => ({
      eventTime: String(row.eventTime),
      unit: String(row.unit ?? ""),
      eventType: String(row.eventType ?? ""),
      faultDesc: row.faultDesc ? String(row.faultDesc) : null,
      faultGrade: row.faultGrade ? String(row.faultGrade) : null,
      repairStatus: row.repairStatus ? String(row.repairStatus) : null,
    })),
    dataTimestamp,
    queryTemplateKey: "equipment_event_timeline_v1",
    metricDefinitions: [
      {
        metricKey: "equipment_event_timeline",
        metricName: "设备事件时间线",
        definitionVersion: "v1",
      },
    ],
  };
}

function appendFilters(
  filters: MetricFilter[],
  where: string[],
  params: Array<string | number>,
  context: SqlFilterContext
) {
  for (const filter of filters) {
    if (filter.value === undefined || filter.value === null) {
      continue;
    }

    const column = resolveFilterColumn(filter.field, context);
    if (!column) {
      continue;
    }

    appendFilterClause(column, filter, where, params);
  }
}

function resolveFilterColumn(
  field: string,
  context: SqlFilterContext
): string | null {
  const stockColumns: Record<string, string> = {
    siteId: "factory_code",
    factoryCode: "factory_code",
    workshopCode: "workshop_code",
    stock_oper_order: "stock_oper_order",
  };

  if (field in stockColumns) {
    return context.stockAlias
      ? `${context.stockAlias}.${stockColumns[field]}`
      : null;
  }

  if (field === "judgeCode") {
    return context.judgeAlias ? `${context.judgeAlias}.pch_judge_code` : null;
  }

  if (field === "itemCode") {
    return context.itemAlias ? `${context.itemAlias}.item_code` : null;
  }

  if (field === "lineCode" || field === "unit") {
    if (context.stockAlias && field === "lineCode") {
      return `${context.stockAlias}.line_code`;
    }

    return context.equipmentAlias
      ? `${context.equipmentAlias}.affiliated_unit`
      : null;
  }

  return null;
}

function appendFilterClause(
  column: string,
  filter: MetricFilter,
  where: string[],
  params: Array<string | number>
) {
  switch (filter.operator) {
    case "eq":
      where.push(`${column} = ?`);
      params.push(String(filter.value));
      break;
    case "in": {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        return;
      }

      const placeholders = filter.value.map(() => "?").join(", ");
      where.push(`${column} IN (${placeholders})`);
      params.push(...filter.value.map(String));
      break;
    }
    default:
      throw new Error(`暂不支持的过滤操作符: ${filter.operator}`);
  }
}

async function getScalarTimestamp(
  sql: string,
  params: Array<string | number>
): Promise<string> {
  const [rows] = await mesPool.query<RowDataPacket[]>(sql, params);
  const value = rows[0]?.dataTimestamp;
  return value ? new Date(String(value)).toISOString() : new Date().toISOString();
}

async function insertAuditRecord(args: {
  queryAuditId: string;
  query: MetricQuery;
  result: QueryExecutionResult | null;
  durationMs: number;
  status: "completed" | "failed";
  errorMessage?: string;
}) {
  const resultSummary = args.result
    ? JSON.stringify({
        queryAuditId: args.queryAuditId,
        rowCount: args.result.rows.length,
        queryTemplateKey: args.result.queryTemplateKey,
      })
    : null;

  await appPool.execute(
    `
      INSERT INTO ${config.appDatabase}.metric_query_audit (
        trace_id,
        metric_key,
        query_template_key,
        query_params,
        result_summary,
        duration_ms,
        status,
        error_message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    `,
    [
      args.query.auditContext.traceId,
      args.query.metricKey,
      args.result?.queryTemplateKey ?? null,
      JSON.stringify({
        dimensions: args.query.dimensions,
        filters: args.query.filters,
        grain: args.query.grain,
        timeRange: args.query.timeRange,
      }),
      resultSummary,
      args.durationMs,
      args.status,
      args.errorMessage ?? null,
    ]
  );
}

function toMysqlDateTime(value: string): string {
  const dateTimePattern =
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
  const match = dateTimePattern.exec(value);

  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  return value.replace("T", " ").slice(0, 19);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}
