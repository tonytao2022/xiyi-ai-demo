import type { TableBlock as TableBlockType } from "@ce-demo/report-schema";

const RISK_STYLE: Record<string, string> = {
  高: "bg-red-100 text-red-700",
  中: "bg-amber-100 text-amber-700",
  低: "bg-green-100 text-green-700",
  异常升高: "bg-red-100 text-red-700",
  基本稳定: "bg-slate-100 text-slate-600",
  好转: "bg-green-100 text-green-700",
};

function CellValue({ value }: { value: string | number | boolean | null }) {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  const str = String(value);
  if (RISK_STYLE[str]) {
    return (
      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${RISK_STYLE[str]}`}>
        {str}
      </span>
    );
  }
  const isPositive = str.startsWith("+");
  const isNegative = str.startsWith("-") && str.includes("pp");
  return (
    <span className={isPositive ? "text-red-600 font-medium" : isNegative ? "text-green-600 font-medium" : ""}>
      {str}
    </span>
  );
}

export default function TableBlock({ block }: { block: TableBlockType }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-3">{block.title}</h3>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {block.columns.map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  {block.columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      <CellValue value={row[col.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
