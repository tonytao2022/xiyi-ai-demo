import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  executeSkill,
  listSkillDefinitions,
  validateRuntimeRequest,
  type RuntimeRequest,
} from "@ce-demo/openclaw-domain-tools";

const app = express();
app.use(cors());
app.use(express.json());

const SEMANTIC_API_BASE_URL =
  process.env.SEMANTIC_API_BASE_URL ?? "http://localhost:3010";
const PLAYBOOK_ENGINE_BASE_URL =
  process.env.PLAYBOOK_ENGINE_BASE_URL ?? "http://localhost:3020";
const REPORT_SERVICE_BASE_URL =
  process.env.REPORT_SERVICE_BASE_URL ?? "http://localhost:3030";
const port = Number(process.env.PORT ?? 3040);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    skillKeys: listSkillDefinitions().map((skill) => skill.skillKey),
  });
});

app.get("/skills", (_req, res) => {
  res.json(listSkillDefinitions());
});

const ALLOWED_SKILL_KEYS = new Set(
  listSkillDefinitions().map((skill) => skill.skillKey)
);

app.post("/skills/:skillKey/execute", async (req, res) => {
  try {
    const skillKey = req.params.skillKey;
    if (!ALLOWED_SKILL_KEYS.has(skillKey as RuntimeRequest["skillKey"])) {
      return res.status(404).json({ error: `未知技能: ${skillKey}` });
    }
    const request = req.body as RuntimeRequest;
    if (request.skillKey !== skillKey) {
      return res
        .status(400)
        .json({ error: "URL 中的 skillKey 与请求体 skillKey 不一致" });
    }
    validateRuntimeRequest(request);
    const result = await executeSkill(request, {
      semanticApiBaseUrl: SEMANTIC_API_BASE_URL,
      playbookEngineBaseUrl: PLAYBOOK_ENGINE_BASE_URL,
      reportServiceBaseUrl: REPORT_SERVICE_BASE_URL,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: getErrorMessage(error) });
  }
});

app.listen(port, () => {
  console.log(`OpenClaw Runtime running on http://localhost:${port}`);
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}
