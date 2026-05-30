import type { MarkdownBlock as MarkdownBlockType } from "@ce-demo/report-schema";
import ReactMarkdown from "react-markdown";

export default function MarkdownBlock({ block }: { block: MarkdownBlockType }) {
  return (
    <div>
      {block.title && (
        <h3 className="text-sm font-semibold text-slate-600 mb-3">{block.title}</h3>
      )}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm prose prose-sm prose-slate max-w-none">
        <ReactMarkdown>{block.markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
