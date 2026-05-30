import type { ChartBlock as ChartBlockType } from "@ce-demo/report-schema";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#a78bfa", "#f59e0b", "#10b981", "#ef4444"];
const LINE_COLORS = ["#3b82f6", "#f59e0b", "#10b981"];

export default function ChartBlock({ block }: { block: ChartBlockType }) {
  const data = block.data as Array<Record<string, string | number>>;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-3">{block.title}</h3>
      <div className="bg-white border border-slate-100 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={260}>
          {block.chartType === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={block.yField}
                nameKey={block.xField}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(1)}%`
                }
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : block.chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={block.xField} tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                domain={["auto", "auto"]}
              />
              <Tooltip />
              <Bar
                dataKey={block.yField}
                fill={LINE_COLORS[0]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={block.xField} tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                domain={["auto", "auto"]}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={block.yField}
                stroke={LINE_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* Render target line if present in data */}
              {"target" in (data[0] ?? {}) && (
                <Line
                  type="monotone"
                  dataKey="target"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}
              <Legend />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
