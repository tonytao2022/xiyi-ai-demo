# 兮易AI大脑 · API文档

> 更新日期：2026-05-30
> 基础路径：`/api/v1/xiyi/`（通过Nginx转发到 127.0.0.1:8890）
> 数据格式：所有请求和响应均为 JSON

---

## 场景管理

| 方法 | 路径 | 说明 | 参数 |
|:----|:-----|:-----|:-----|
| GET | `/scenes` | 获取所有场景 | — |
| GET | `/scenes/:id` | 获取场景详情+步骤 | — |
| POST | `/scenes` | 创建新场景（含默认7步） | `{scene_code,scene_name,category?,description?}` |
| PUT | `/scenes/:id` | 更新场景信息 | `{scene_name?,category?,description?,status?}` |
| GET | `/scenes/:id/steps` | 获取场景七步流程 | — |
| POST | `/scenes/:id/steps` | 添加步骤 | `{step_code?,step_name,step_type?,description?}` |
| POST | `/scenes/:id/steps/reorder` | 重新排序步骤 | `{step_ids:[顺序排列的步骤ID]}` |
| PUT | `/steps/:id` | 更新步骤信息 | `{step_name?,step_type?,description?,sort_order?}` |
| DELETE | `/steps/:id` | 删除步骤 | — |

## 分析流程

| 方法 | 路径 | 说明 | 参数 |
|:----|:-----|:-----|:-----|
| POST | `/analysis/start` | 启动分析实例 | `{scene_id,title?}` |
| GET | `/analysis/:id` | 获取分析实例 | — |
| POST | `/analysis/:id/step/:step_id` | 更新步骤结果 | `{status?,output?,ai_response?}` |

## 指标体系

| 方法 | 路径 | 说明 |
|:----|:-----|:-----|
| GET | `/indicators` | 获取所有原子指标 |
| GET | `/standards` | 获取标准字段 |

## CAPA管理

| 方法 | 路径 | 说明 | 参数 |
|:----|:-----|:-----|:-----|
| GET | `/capa/plans` | 获取CAPA方案列表 | `?instance_id=` |
| POST | `/capa/plans` | 创建CAPA方案 | `{plan_code,title,root_cause?,plan_content?,priority?}` |
| GET | `/capa/plans/:id` | 获取方案详情+任务 | — |
| POST | `/capa/tasks` | 创建任务 | `{plan_id,task_code,title,assignee?,deadline?}` |
| PUT | `/capa/tasks/:id` | 更新任务 | `{status?,assignee?,deadline?}` |
| POST | `/capa/tasks/:id/track` | 添加跟踪记录 | `{track_type,content,verifier?}` |
| GET | `/capa/tasks/:id/tracks` | 获取跟踪记录 | — |

## 模拟数据

| 方法 | 路径 | 说明 |
|:----|:-----|:-----|
| GET | `/mock/:scene_id` | 获取场景模拟数据 |
| GET | `/mock/kpi` | 获取实时KPI值 |

---

## 响应格式

成功：
```json
{"code": 0, "data": { ... }}
```

失败：
```json
{"code": -1, "error": "错误描述"}
```
