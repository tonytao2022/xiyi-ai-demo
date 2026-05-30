import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import WizardPage from "./pages/WizardPage";
import TaskPage from "./pages/TaskPage";
import ReportPage from "./pages/ReportPage";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏭</span>
          <span className="font-semibold text-slate-800 text-lg">
            制造咨询智能体
          </span>
        </div>
        <span className="text-slate-300">|</span>
        <span className="text-sm text-slate-500">
          在线一次校验合格率管控 · Demo v1
        </span>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/wizard" replace />} />
          <Route path="/wizard" element={<WizardPage />} />
          <Route path="/tasks/:taskId" element={<TaskPage />} />
          <Route path="/reports/:taskId" element={<ReportPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
