import "dotenv/config";
import cors from "cors";
import express from "express";
import { buildReportFromMetrics, type BuildReportArgs } from "./report-builder";

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT ?? 3030);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/reports/build", (req, res) => {
  try {
    const payload = req.body as BuildReportArgs;
    validateBuildReportRequest(payload);
    const report = buildReportFromMetrics(payload);
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
  }
});

app.listen(port, () => {
  console.log(`Report Service running on http://localhost:${port}`);
});

function validateBuildReportRequest(
  payload: BuildReportArgs
): asserts payload is BuildReportArgs {
  if (!payload?.traceId) {
    throw new TypeError("traceId 必填");
  }

  if (!payload?.input || typeof payload.input !== "object") {
    throw new TypeError("input 必填");
  }

  if (!Array.isArray(payload?.fpyrDaily?.rows)) {
    throw new TypeError("fpyrDaily.rows 必须是数组");
  }

  if (!Array.isArray(payload?.defectBreakdown?.rows)) {
    throw new TypeError("defectBreakdown.rows 必须是数组");
  }

  if (!Array.isArray(payload?.equipmentTimeline?.rows)) {
    throw new TypeError("equipmentTimeline.rows 必须是数组");
  }

  if (!payload?.playbookResult?.playbookVersion) {
    throw new TypeError("playbookResult.playbookVersion 必填");
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}
