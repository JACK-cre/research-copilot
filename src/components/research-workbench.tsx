'use client';

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Eye,
  FileText,
  FlaskConical,
  History,
  GitBranch,
  KeyRound,
  Library,
  MessageCircle,
  LoaderCircle,
  LogOut,
  PanelLeft,
  Pencil,
  Presentation,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { DEFAULT_RESEARCH_LAYOUT, LAYOUT_LIMITS, ResizeHandle, useResearchLayout } from '@/components/resize-handle';
import { StudyChat } from '@/components/study-chat';
import { ResearchHistoryView } from '@/components/research-history-view';
import { SettingsView } from '@/components/settings-view';
import { ResearchLibraryView } from '@/components/research-library-view';
import type {
  KnowledgeChunkPreview,
  KnowledgeDocument,
  Paper,
  ResearchRequest,
  ResearchResult,
} from '@/types/research';
import type {
  AiSettingsSummary,
  OutputTemplate,
  ResearchArtifact,
  ResearchRunSummary,
  RevisionTarget,
  TemplateBlueprint,
  TemplateKind,
} from '@/types/platform';
import type { IngestionJob } from '@/types/ingestion';
import type { ResearchJob } from '@/types/research-job';

type WorkspaceView = 'research' | 'study' | 'library' | 'history' | 'settings';
type ResultTab = 'overview' | 'papers' | 'report' | 'slides';

const initialRequest: ResearchRequest = {
  topic: 'RAG 与 MCP 驱动的研究智能体',
  requirements: '关注检索质量、工具调用、引用可信度与实际应用',
  deliverable: 'auto',
  audience: 'auto',
  yearFrom: 2020,
  paperCount: 8,
  includeExternal: true,
  includeLibrary: true,
  templateId: '',
};

const stages = ['理解任务', '按需补充资料', '组织内容', '生成交付物', '质量审校'];

function formatBytes(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

function authorLine(authors: Array<{ name: string }>): string {
  if (!authors.length) return '作者信息暂缺';
  const names = authors.slice(0, 3).map((author) => author.name).join('、');
  return names + (authors.length > 3 ? ' 等' : '');
}

function citationText(ids: string[]): string {
  return ids.map((id) => '[' + id + ']').join(' ');
}

function sourceTypeLabel(source: Paper['sourceType']): string {
  return source === 'book' ? '图书' : source === 'web' ? '网页' : '论文';
}

function providerLabel(source: Paper['source']): string {
  const labels: Record<Paper['source'], string> = {
    openalex: 'OpenAlex',
    crossref: 'Crossref',
    'google-books': 'Google Books',
    'internet-archive': 'Internet Archive',
    wikipedia: 'Wikipedia',
    'baidu-baike': '百度百科',
    wikidata: 'Wikidata',
    'web-search': '网页搜索',
    'semantic-scholar': 'Semantic Scholar',
    'europe-pmc': 'Europe PMC',
    arxiv: 'arXiv',
    demo: '示例',
  };
  return labels[source];
}

function isDeepSeekBaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'api.deepseek.com';
  } catch {
    return false;
  }
}

interface ResearchWorkbenchProps {
  cloudEnabled?: boolean;
  userEmail?: string;
  onSignOut?: () => Promise<void>;
}

export function ResearchWorkbench({ cloudEnabled = false, userEmail, onSignOut }: ResearchWorkbenchProps) {
  const [view, setView] = useState<WorkspaceView>('research');
  const [tab, setTab] = useState<ResultTab>('overview');
  const [request, setRequest] = useState<ResearchRequest>(initialRequest);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [templates, setTemplates] = useState<OutputTemplate[]>([]);
  const [running, setRunning] = useState(false);
  const [activeResearchJob, setActiveResearchJob] = useState<ResearchJob | null>(null);
  const [refining, setRefining] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [revisionTarget, setRevisionTarget] = useState<RevisionTarget>('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const researchLayoutRef = useRef<HTMLDivElement>(null);
  const resultMetaRef = useRef<HTMLDivElement>(null);
  const resultPanelRef = useRef<HTMLElement>(null);
  const { layout, layoutRef, update: updateLayout } = useResearchLayout();

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/library', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '知识库读取失败');
      setDocuments(payload.documents);
      setIngestionJobs(payload.jobs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '知识库读取失败');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!cloudEnabled) return;
    try {
      const response = await fetch('/api/research', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究历史读取失败');
      setRuns(payload.runs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '研究历史读取失败');
    }
  }, [cloudEnabled]);

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/templates', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '模板读取失败');
      setTemplates(payload.templates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '模板读取失败');
    }
  }, []);

  const refreshArtifacts = useCallback(async (runId: string) => {
    if (!cloudEnabled) return;
    const response = await fetch('/api/research/' + runId, { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    setArtifacts(payload.artifacts ?? []);
  }, [cloudEnabled]);

  useEffect(() => {
    void loadLibrary();
    void loadHistory();
    void loadTemplates();
    void fetch('/api/research/jobs', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (payload?.jobs?.[0]) setActiveResearchJob(payload.jobs[0]);
      })
      .catch(() => undefined);
  }, [loadHistory, loadLibrary, loadTemplates]);

  useEffect(() => {
    if (!activeResearchJob) return;
    if (!running && (activeResearchJob.status === 'queued' || activeResearchJob.status === 'running')) {
      setRunning(true);
      setNotice('检测到后台研究任务，正在继续等待结果');
      void waitForResearchJob(activeResearchJob.id)
        .then(async (job) => {
          if (job.status === 'failed') throw new Error(job.error || '研究任务执行失败');
          if (job.status === 'cancelled') throw new Error('研究任务已取消');
          const response = await fetch('/api/research/' + job.runId, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || '研究结果读取失败');
          setResult(payload.result);
          setRequest(payload.result.request);
          setArtifacts(payload.artifacts ?? []);
        })
        .catch((error) => setError(error instanceof Error ? error.message : '研究任务读取失败'))
        .finally(() => { setRunning(false); setActiveResearchJob(null); });
    }
    const mapped = activeResearchJob.stage === 'planning' ? 0
      : activeResearchJob.stage === 'researching' ? 1
        : activeResearchJob.stage === 'assembling' ? 3
          : activeResearchJob.stage === 'writing' ? 4
            : activeResearchJob.stage === 'reviewing' ? 4
              : activeResearchJob.stage === 'revising' ? 4
                : Math.min(stages.length - 1, Math.floor(activeResearchJob.progress / 25));
    setStage((current) => Math.max(current, mapped));
  }, [activeResearchJob, running]);

  useEffect(() => {
    const hasActiveJobs = ingestionJobs.some((job) => job.status === 'queued' || job.status === 'processing');
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void loadLibrary();
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [ingestionJobs, loadLibrary]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 9_000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const yearCounts = useMemo(() => {
    if (!result) return [];
    const counts = new Map<number, number>();
    result.papers.filter((paper) => paper.year > 0).forEach((paper) => counts.set(paper.year, (counts.get(paper.year) ?? 0) + 1));
    return Array.from(counts.entries()).sort(([left], [right]) => left - right);
  }, [result]);

  async function waitForResearchJob(id: string): Promise<ResearchJob> {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const response = await fetch('/api/research/jobs/' + id, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究任务状态读取失败');
      setActiveResearchJob(payload.job);
      if (payload.job.status === 'completed' || payload.job.status === 'failed' || payload.job.status === 'cancelled') return payload.job;
    }
  }

  async function cancelActiveResearchJob() {
    if (!activeResearchJob) return;
    const response = await fetch('/api/research/jobs/' + activeResearchJob.id, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '取消失败');
    setActiveResearchJob(payload.job);
    setNotice('研究任务已取消');
  }

  async function runResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError('');
    setNotice('');
    setStage(0);
    setTab('overview');
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究任务创建失败');
      if (!payload.queued) {
        setResult(payload);
        setArtifacts([]);
        setStage(stages.length - 1);
        setNotice(payload.mode === 'model' ? '已使用模型完成生成' : '已使用本地生成器完成，可配置模型提升内容质量');
        void loadHistory();
        return;
      }
      setActiveResearchJob(payload.job);
      setNotice('研究任务已进入后台执行，可以切换页面，完成后会自动加载');
      const job = await waitForResearchJob(payload.job.id);
      if (job.status === 'cancelled') throw new Error('研究任务已取消。');
      if (job.status === 'failed') throw new Error(job.error || '研究任务执行失败。');
      const resultResponse = await fetch('/api/research/' + job.runId, { cache: 'no-store' });
      const resultPayload = await resultResponse.json();
      if (!resultResponse.ok) throw new Error(resultPayload.error || '研究结果读取失败');
      setResult(resultPayload.result);
      setRequest(resultPayload.result.request);
      setArtifacts(resultPayload.artifacts ?? []);
      setStage(stages.length - 1);
      setNotice(resultPayload.result.mode === 'model' ? '已使用模型完成生成' : '已使用本地生成器完成，可配置模型提升内容质量');
      void loadHistory();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '研究任务执行失败');
    } finally {
      setRunning(false);
      setActiveResearchJob(null);
    }
  }

  async function refineResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || !revisionInstruction.trim()) return;
    setRefining(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/research/' + result.id + '/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: revisionInstruction,
          target: revisionTarget,
          templateId: request.templateId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '版本修改失败');
      if (payload.queued) {
        setActiveResearchJob(payload.job);
        setNotice('修订任务已进入后台执行，完成后会自动加载新版本');
        const job = await waitForResearchJob(payload.job.id);
        if (job.status === 'cancelled') throw new Error('修订任务已取消。');
        if (job.status === 'failed') throw new Error(job.error || '版本修改失败。');
        const resultResponse = await fetch('/api/research/' + job.runId, { cache: 'no-store' });
        const resultPayload = await resultResponse.json();
        if (!resultResponse.ok) throw new Error(resultPayload.error || '研究结果读取失败');
        setResult(resultPayload.result);
        setRequest(resultPayload.result.request);
        setArtifacts(resultPayload.artifacts ?? []);
      } else {
        setResult(payload);
        setRequest(payload.request);
        setArtifacts([]);
      }
      setRevisionInstruction('');
      setNotice('新版本已完成，上一版仍保留在研究历史中');
      void loadHistory();
    } catch (refineError) {
      setError(refineError instanceof Error ? refineError.message : '版本修改失败');
    } finally {
      setRefining(false);
      setActiveResearchJob(null);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      const response = await fetch('/api/library', { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '文件上传失败');
      await loadLibrary();
      setNotice(payload.queued
        ? '已提交 ' + payload.jobs.length + ' 个后台解析任务，可切到其他页面继续使用'
        : '已写入 ' + payload.documents.length + ' 份资料');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '文件处理失败');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function downloadMarkdown() {
    if (!result) return;
    setExporting(true);
    setError('');
    try {
      const response = await fetch('/api/export/markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudEnabled ? { id: result.id } : result),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || '文稿生成失败');
      }
      downloadBlob(await response.blob(), 'research-report-v' + (result.version ?? 1) + '.md');
      await refreshArtifacts(result.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '文稿生成失败');
    } finally {
      setExporting(false);
    }
  }

  async function downloadPptx() {
    if (!result) return;
    setExporting(true);
    setError('');
    try {
      const response = await fetch('/api/export/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudEnabled ? { id: result.id } : result),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'PPT 生成失败');
      }
      downloadBlob(await response.blob(), 'research-briefing-v' + (result.version ?? 1) + '.pptx');
      await refreshArtifacts(result.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'PPT 生成失败');
    } finally {
      setExporting(false);
    }
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function openRun(id: string) {
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/research/' + id, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究任务读取失败');
      setResult(payload.result);
      setRequest(payload.result.request);
      setArtifacts(payload.artifacts ?? []);
      setView('research');
      setTab('overview');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '研究任务读取失败');
    }
  }

  async function deleteDocument(id: string) {
    if (!window.confirm('确认删除这份资料及其全部向量片段？')) return;
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/library/' + id, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '资料删除失败');
      setDocuments((current) => current.filter((document) => document.id !== id));
      void loadLibrary();
      setNotice(payload.warning || '资料已删除');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '资料删除失败');
    }
  }

  async function deleteRun(id: string) {
    if (!window.confirm('确认删除这个研究版本？该版本的文稿、证据记录和已导出文件也会删除。')) return;
    setDeletingRunId(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/research/' + id, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究记录删除失败');
      setRuns((current) => current.filter((run) => run.id !== id));
      if (result?.id === id) {
        setResult(null);
        setArtifacts([]);
      }
      setNotice(payload.warning || '研究记录已删除');
      void loadHistory();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '研究记录删除失败');
    } finally {
      setDeletingRunId(null);
    }
  }

  function clampBrief(width: number) {
    const container = researchLayoutRef.current?.clientWidth ?? 1280;
    const max = Math.min(
      LAYOUT_LIMITS.briefMax,
      container - 16 - LAYOUT_LIMITS.middleMin - layoutRef.current.evidenceWidth,
    );
    return Math.min(Math.max(width, LAYOUT_LIMITS.briefMin), Math.max(LAYOUT_LIMITS.briefMin, max));
  }

  function clampEvidence(width: number) {
    const container = researchLayoutRef.current?.clientWidth ?? 1280;
    const max = Math.min(
      LAYOUT_LIMITS.evidenceMax,
      container - 16 - LAYOUT_LIMITS.middleMin - layoutRef.current.briefWidth,
    );
    return Math.min(Math.max(width, LAYOUT_LIMITS.evidenceMin), Math.max(LAYOUT_LIMITS.evidenceMin, max));
  }

  function clampMeta(height: number) {
    const panel = resultPanelRef.current?.clientHeight ?? 720;
    const max = Math.max(LAYOUT_LIMITS.metaMin, panel - LAYOUT_LIMITS.outputMin - 10);
    return Math.min(Math.max(height, LAYOUT_LIMITS.metaMin), max);
  }

  function navigate(nextView: WorkspaceView) {
    setView(nextView);
    setError('');
    setNotice('');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><FlaskConical size={19} /></div>
          <div>
            <strong>Research Copilot</strong>
            <span>论文 · 复习 · PPT</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <button className={view === 'research' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('research')}>
            <Search size={17} />研究任务
          </button>
          <button className={view === 'study' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('study')}>
            <MessageCircle size={17} />复习对话
          </button>
          <button className={view === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('library')}>
            <Library size={17} />知识库<span className="nav-count">{documents.length}</span>
          </button>
          {cloudEnabled ? <button className={view === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('history')}>
            <History size={17} />研究历史<span className="nav-count">{runs.length}</span>
          </button> : null}
          {cloudEnabled ? <button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('settings')}>
            <Settings size={17} />配置中心
          </button> : null}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div><strong>{cloudEnabled ? '私有云已连接' : '本地模式'}</strong><span>{cloudEnabled ? '资料按账户隔离保存' : '兼容模式 · MCP 可用'}</span></div>
        </div>
        {userEmail ? <div className="account-block"><div><Cloud size={15} /><span title={userEmail}>{userEmail}</span></div><button className="icon-button" onClick={() => void onSignOut?.()} title="退出登录" aria-label="退出登录"><LogOut size={16} /></button></div> : null}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{view === 'research' ? '从主题到论文和 PPT' : view === 'study' ? '日常对话、知识库问答与复习' : view === 'library' ? '本地资料与证据' : view === 'history' ? '可回看的研究版本' : '模型、检索与模板'}</span>
            <h1>{view === 'research' ? '研究任务' : view === 'study' ? '复习对话' : view === 'library' ? '知识库' : view === 'history' ? '研究历史' : '配置中心'}</h1>
          </div>
          {view === 'research' && result ? (
            <div className="top-actions">
              <button className="button secondary" onClick={() => void downloadMarkdown()} disabled={exporting}><FileText size={16} />导出文稿</button>
              <button className="button primary" onClick={downloadPptx} disabled={exporting}>
                {exporting ? <LoaderCircle className="spin" size={16} /> : <Presentation size={16} />}导出 PPT
              </button>
            </div>
          ) : null}
          {view === 'library' ? (
            <button className="button primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}上传资料
            </button>
          ) : null}
        </header>

        {error ? <div className="message error" role="alert"><X size={16} /><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={14} /></button></div> : null}
        {notice ? <div className="message notice" role="status"><Check size={16} /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="关闭成功提示"><X size={14} /></button></div> : null}

        {view === 'research' ? (
          <div
            className={'research-layout' + (layout.metaHeight ? ' has-meta-size' : '')}
            ref={researchLayoutRef}
            style={{
              '--brief-width': layout.briefWidth + 'px',
              '--evidence-width': layout.evidenceWidth + 'px',
              '--result-meta-height': layout.metaHeight ? layout.metaHeight + 'px' : 'auto',
            } as CSSProperties}
          >
            <aside className="brief-panel">
              <form onSubmit={runResearch}>
                <div className="section-heading"><PanelLeft size={16} /><span>任务简报</span></div>
                <label className="field-label" htmlFor="topic">主题或任务</label>
                <textarea id="topic" className="textarea topic-input" value={request.topic} onChange={(event) => setRequest({ ...request, topic: event.target.value })} placeholder="例如：实习转正答辩、课程论文、产品方案或读书报告" required />

                <label className="field-label" htmlFor="requirements">侧重点与要求</label>
                <textarea id="requirements" className="textarea" value={request.requirements} onChange={(event) => setRequest({ ...request, requirements: event.target.value })} placeholder="粘贴事实材料并说明侧重点、页数、篇幅、语气或希望强调的内容；系统会自动判断形式和受众。" />

                <label className="control template-control"><span>输出模板</span><select value={request.templateId ?? ''} onChange={(event) => setRequest({ ...request, templateId: event.target.value })}><option value="">自由格式（按要求自动规划）</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select><small>系统会结合模板版式、主题和要求自动推断内容结构，不会复用模板里的示例正文。</small></label>

                <div className="two-columns">
                  <label className="control"><span>起始年份</span><input type="number" min="1900" max={new Date().getFullYear()} value={request.yearFrom} onChange={(event) => setRequest({ ...request, yearFrom: Number(event.target.value) })} /><small>读后感等历史主题会自动放宽到 1900 年，避免漏掉史料。</small></label>
                  <label className="control"><span>目标来源数</span><input type="number" min="3" max="40" value={request.paperCount} onChange={(event) => setRequest({ ...request, paperCount: Number(event.target.value) })} /></label>
                </div>

                <fieldset className="source-options">
                  <legend>补充资料来源（可选）</legend>
                  <label><input type="checkbox" checked={request.includeExternal} onChange={(event) => setRequest({ ...request, includeExternal: event.target.checked })} /><span><BookOpen size={15} />论文、图书与网页</span></label>
                  <label><input type="checkbox" checked={request.includeLibrary} onChange={(event) => setRequest({ ...request, includeLibrary: event.target.checked })} /><span><Database size={15} />本地知识库</span></label>
                </fieldset>

                <button className="button run-button" type="submit" disabled={running || !request.topic.trim()}>
                  {running ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
                  {running ? '正在生成' : '开始生成'}
                </button>
                {activeResearchJob && running ? <button className="button secondary" type="button" onClick={() => void cancelActiveResearchJob().catch((error) => setError(error instanceof Error ? error.message : '取消失败'))}>取消后台任务</button> : null}
                {activeResearchJob && running ? <div className="research-job-status"><span>{activeResearchJob.stage === 'planning' ? '理解任务并规划工作流' : activeResearchJob.stage === 'researching' ? '按需检索与召回资料' : activeResearchJob.stage === 'revising' ? '按要求修订版本' : activeResearchJob.stage === 'assembling' ? '组织内容并生成交付物' : activeResearchJob.stage === 'completed' ? '已完成' : '执行中'}</span><strong>{activeResearchJob.progress}%</strong></div> : null}
              </form>

              <div className="process-list" aria-label="任务进度">
                {stages.map((label, index) => (
                  <div className={running && index === stage ? 'process-step current' : index < stage || (!running && result) ? 'process-step done' : 'process-step'} key={label}>
                    <span>{index < stage || (!running && result) ? <Check size={12} /> : index + 1}</span>{label}
                  </div>
                ))}
              </div>
            </aside>

            <ResizeHandle
              orientation="horizontal"
              className="brief-split"
              label="调整研究简报宽度"
              value={layout.briefWidth}
              min={LAYOUT_LIMITS.briefMin}
              max={LAYOUT_LIMITS.briefMax}
              onDrag={(delta) => updateLayout({ briefWidth: clampBrief(layoutRef.current.briefWidth + delta) })}
              onReset={() => updateLayout({ briefWidth: DEFAULT_RESEARCH_LAYOUT.briefWidth })}
            />
            <section className="result-panel" ref={resultPanelRef}>
              {!result ? (
                <div className="empty-state">
                  <div className="empty-visual" aria-hidden="true">
                    <span className="node node-one"><Search size={18} /></span>
                    <span className="connector first" />
                    <span className="node node-two"><Database size={18} /></span>
                    <span className="connector second" />
                    <span className="node node-three"><Presentation size={18} /></span>
                  </div>
                  <h2>{running ? stages[stage] : '把主题变成可交付成果'}</h2>
                  <p>{running ? '正在组织论文、图书、网页和知识库证据' : '在左侧写清主题、侧重点和格式要求。开始后会检索资料，并生成论文与 PPT。'}</p>
                </div>
              ) : (
                <>
                  <div className="result-meta" ref={resultMetaRef}>
                    <div className="result-header">
                      <div><span className="result-kicker">{result.mode === 'model' ? '模型综合' : '本地综合'}</span><h2>{result.title}</h2><p>{result.thesis}</p></div>
                      <span className="result-id">V{result.version ?? 1} · RUN {result.id.slice(0, 6).toUpperCase()}</span>
                    </div>

                    {cloudEnabled ? <form className="revision-bar" onSubmit={refineResearch}>
                      <div className="revision-heading"><GitBranch size={16} /><strong>继续完善 V{result.version ?? 1}</strong></div>
                      <div className="revision-controls">
                        <div className="segmented-control" aria-label="修改范围">{([['all', '全文与 PPT'], ['report', '仅论文'], ['slides', '仅 PPT']] as const).map(([value, label]) => <button type="button" className={revisionTarget === value ? 'active' : ''} onClick={() => setRevisionTarget(value)} key={value}>{label}</button>)}</div>
                        <textarea value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} maxLength={50000} placeholder="补充本版修改要求" required />
                        <button className="button primary" disabled={refining || !revisionInstruction.trim()}>{refining ? <LoaderCircle className="spin" size={16} /> : <GitBranch size={16} />}{refining ? '正在生成新版本' : '生成新版本'}</button>
                      </div>
                    </form> : null}
                  </div>

                  <ResizeHandle
                    orientation="vertical"
                    className="meta-split"
                    label="调整文稿阅读区域高度"
                    value={layout.metaHeight ?? undefined}
                    min={LAYOUT_LIMITS.metaMin}
                    onDrag={(delta) => {
                      const current = layoutRef.current.metaHeight ?? resultMetaRef.current?.offsetHeight ?? 220;
                      updateLayout({ metaHeight: clampMeta(current + delta) });
                    }}
                    onReset={() => updateLayout({ metaHeight: null })}
                  />

                  <div className="result-output">
                    <div className="tabs" role="tablist">
                      {([['overview', '总览'], ['papers', '外部来源'], ['report', '文稿'], ['slides', 'PPT']] as const).map(([value, label]) => (
                        <button key={value} className={tab === value ? 'tab active' : 'tab'} onClick={() => setTab(value)}>{label}{value === 'papers' ? <span>{result.papers.length}</span> : null}</button>
                      ))}
                    </div>

                    <div className="tab-content">
                      {tab === 'overview' ? <Overview result={result} yearCounts={yearCounts} artifacts={artifacts} /> : null}
                      {tab === 'papers' ? <Papers result={result} /> : null}
                      {tab === 'report' ? <Report result={result} /> : null}
                      {tab === 'slides' ? <Slides result={result} /> : null}
                    </div>
                  </div>
                </>
              )}
            </section>

            <ResizeHandle
              orientation="horizontal"
              className="evidence-split"
              label="调整证据池宽度"
              value={layout.evidenceWidth}
              min={LAYOUT_LIMITS.evidenceMin}
              max={LAYOUT_LIMITS.evidenceMax}
              onDrag={(delta) => updateLayout({ evidenceWidth: clampEvidence(layoutRef.current.evidenceWidth - delta) })}
              onReset={() => updateLayout({ evidenceWidth: DEFAULT_RESEARCH_LAYOUT.evidenceWidth })}
            />
            <aside className="evidence-panel">
              <div className="section-heading"><Database size={16} /><span>证据池</span>{result ? <em>{result.evidence.length}</em> : null}</div>
              {result?.evidence.length ? result.evidence.slice(0, 10).map((item) => (
                <article className="evidence-item" key={item.id}>
                  <div><span className={'source-badge ' + item.kind}>{item.id}</span><span className="score">{item.retrievalRoutes?.map((route) => route === 'semantic' ? '语义' : route === 'keyword' ? '关键词' : '模型重排').join(' + ') || ''} {Math.round(item.score * 100)}%</span></div>
                  <h3>{item.title}{item.page ? <small className="evidence-page">第 {item.page} 页</small> : null}</h3>
                  <p>{item.excerpt}</p>
                  {item.scoreDetails && item.kind === 'knowledge' ? <div className="score-breakdown">{typeof item.scoreDetails.semantic === 'number' ? <span>语义 {Math.round(item.scoreDetails.semantic * 100)}</span> : null}{typeof item.scoreDetails.keyword === 'number' ? <span>关键词 {Math.round(item.scoreDetails.keyword * 100)}</span> : null}{typeof item.scoreDetails.fused === 'number' ? <span>融合 {Math.round(item.scoreDetails.fused * 100)}</span> : null}{typeof item.scoreDetails.rerank === 'number' ? <span>模型 {Math.round(item.scoreDetails.rerank * 100)}</span> : null}</div> : null}
                  {item.relevanceReason ? <p className="relevance-reason">{item.relevanceReason}</p> : null}
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源<ArrowUpRight size={13} /></a> : null}
                </article>
              )) : <div className="rail-empty"><Database size={20} /><span>暂无证据</span></div>}
            </aside>
          </div>
        ) : view === 'study' ? (
          <StudyChat onError={setError} onNotice={setNotice} />
        ) : view === 'library' ? (
          <ResearchLibraryView documents={documents} uploading={uploading} fileInput={fileInput} onUpload={uploadFiles} onDelete={deleteDocument} onError={setError} cloudEnabled={cloudEnabled} jobs={ingestionJobs} onRetryJob={async (id: string) => { const response = await fetch('/api/library/jobs/' + id + '/retry', { method: 'POST' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '重试失败'); await loadLibrary(); }} onCancelJob={async (id: string) => { const response = await fetch('/api/library/jobs/' + id, { method: 'DELETE' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '取消失败'); await loadLibrary(); }} onReindex={async (id: string) => { const response = await fetch('/api/library/' + id + '/reindex', { method: 'POST' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || '重建索引失败'); await loadLibrary(); }} />
        ) : view === 'history' ? <ResearchHistoryView runs={runs} deletingRunId={deletingRunId} onOpen={openRun} onDelete={deleteRun} /> : <SettingsView templates={templates} onTemplatesChanged={loadTemplates} onError={setError} onNotice={setNotice} />}
      </section>
    </main>
  );
}

function Overview({ result, yearCounts, artifacts }: { result: ResearchResult; yearCounts: Array<[number, number]>; artifacts: ResearchArtifact[] }) {
  const maxCount = Math.max(1, ...yearCounts.map(([, count]) => count));
  return (
    <div className="overview-grid">
      {result.agentTrace?.length ? <section className="content-section"><div className="section-title"><h3>多智能体流程</h3><span>{result.agentTrace.length} 个节点</span></div><div className="agent-timeline">{result.agentTrace.map((step) => <div className={'agent-step ' + step.status} key={step.agent + step.title}><strong>{step.title}</strong><span>{step.summary}</span><small>{step.status === 'failed' ? '失败' : step.status === 'skipped' ? '跳过' : '完成'} · {step.durationMs}ms</small></div>)}</div></section> : null}
      <div className="metrics-band">
        <div><strong>{result.papers.length}</strong><span>有效外部来源</span></div>
        <div><strong>{result.evidence.filter((item) => item.kind === 'knowledge').length}</strong><span>本地证据</span></div>
        <div><strong>{result.sections.length}</strong><span>文稿章节</span></div>
        <div><strong>{result.slides.length}</strong><span>幻灯片</span></div>
      </div>
      {result.citationAudit ? <section className={'citation-audit ' + (result.citationAudit.valid ? 'valid' : 'warning')}>
        <div><Check size={16} /><strong>{result.citationAudit.valid ? '引用检查通过' : '发现引用问题'}</strong><span>已引用 {result.citationAudit.citedEvidence}/{result.citationAudit.totalEvidence} 条证据</span></div>
        {result.citationAudit.issues.length ? <ul>{result.citationAudit.issues.slice(0, 6).map((issue, index) => <li key={issue.location + issue.citation + index}><strong>{issue.location}</strong><span>{issue.citation} · {issue.message}</span></li>)}</ul> : null}
      </section> : null}
      {artifacts.length ? <section className="content-section">
        <div className="section-title"><h3>已归档成果</h3><span>{artifacts.length} 个文件</span></div>
        <div className="artifact-list">{artifacts.map((artifact) => <a href={'/api/artifacts/' + artifact.id} target="_blank" rel="noreferrer" key={artifact.id}><span className="artifact-icon">{artifact.type === 'pptx' ? <Presentation size={16} /> : <FileText size={16} />}</span><span><strong>{artifact.fileName}</strong><small>{formatBytes(artifact.size)} · {new Date(artifact.createdAt).toLocaleString('zh-CN')}</small></span><Download size={15} /></a>)}</div>
      </section> : null}
      <section className="content-section">
        <div className="section-title"><h3>来源年份分布</h3><span>{result.request.yearFrom} 至今</span></div>
        {yearCounts.length ? <div className="year-chart" role="img" aria-label="外部来源年份分布">
          {yearCounts.map(([year, count]) => <div className="year-bar" key={year}><span className="bar-value">{count}</span><span className="bar-fill" style={{ height: 24 + (count / maxCount) * 88 }} /><span className="bar-year">{year}</span></div>)}
        </div> : <div className="inline-empty">暂无来源年份数据</div>}
      </section>
      <section className="content-section">
        <div className="section-title"><h3>检索式</h3><span>{result.searchQueries.length} 组</span></div>
        <div className="query-list">{result.searchQueries.map((query, index) => <div key={query}><span>{index + 1}</span><code>{query}</code></div>)}</div>
      </section>
      {result.warnings.length ? <section className="warning-band">{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}
    </div>
  );
}

function Papers({ result }: { result: ResearchResult }) {
  const counts = { paper: 0, book: 0, web: 0 };
  return <div className="paper-list">{result.papers.map((paper) => {
    const sourceType = paper.sourceType ?? 'paper';
    counts[sourceType] += 1;
    const sourceId = (sourceType === 'book' ? 'B' : sourceType === 'web' ? 'W' : 'P') + counts[sourceType];
    return <article className="paper-row" key={paper.id}>
      <span className={'paper-index ' + sourceType}>{sourceId}</span>
      <div className="paper-main"><h3>{paper.title}</h3><p className="paper-meta">{sourceTypeLabel(sourceType)} · {providerLabel(paper.source)} · {authorLine(paper.authors)}{paper.year ? ` · ${paper.year}` : ''}{sourceType === 'paper' ? ` · 被引 ${paper.citedByCount.toLocaleString()}` : ''} · 相关性 {Math.round((paper.relevanceScore ?? 0) * 100)}%</p><p>{paper.abstract}</p>{paper.relevanceReason ? <small className="relevance-reason">{paper.relevanceReason}</small> : null}<div className="topic-row">{paper.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
      <a className="icon-link" href={paper.url} target="_blank" rel="noreferrer" aria-label={'打开 ' + paper.title}><ArrowUpRight size={17} /></a>
    </article>;
  })}</div>;
}

function Report({ result }: { result: ResearchResult }) {
  return <article className="report-document"><header><h2>{result.title}</h2><p>{result.thesis}</p></header>{result.sections.map((section, index) => <section key={section.id}><span className="section-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3><p>{section.content}</p>{section.citations.length ? <div className="citation-row">{section.citations.map((citation) => <span key={citation}>[{citation}]</span>)}</div> : null}</div></section>)}</article>;
}

function Slides({ result }: { result: ResearchResult }) {
  return <div className="slide-grid">{result.slides.map((slide, index) => <article className={'slide-preview slide-' + slide.type} key={index}><div className="slide-top"><span>{String(index + 1).padStart(2, '0')}</span><Presentation size={14} /></div><h3>{slide.title}</h3><ul>{slide.keyPoints.slice(0, 5).map((point) => <li key={point}>{point}</li>)}</ul><footer>{citationText(slide.citations)}</footer></article>)}</div>;
}
