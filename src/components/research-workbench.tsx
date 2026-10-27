'use client';

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Database,
  Download,
  FileText,
  FlaskConical,
  History,
  Library,
  LoaderCircle,
  LogOut,
  PanelLeft,
  Presentation,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  KnowledgeDocument,
  ResearchRequest,
  ResearchResult,
} from '@/types/research';
import type { ResearchArtifact, ResearchRunSummary } from '@/types/platform';

type WorkspaceView = 'research' | 'library' | 'history';
type ResultTab = 'overview' | 'papers' | 'report' | 'slides';

const initialRequest: ResearchRequest = {
  topic: 'RAG 与 MCP 驱动的研究智能体',
  requirements: '关注检索质量、工具调用、引用可信度与实际应用',
  deliverable: 'survey',
  audience: 'technical',
  yearFrom: 2020,
  paperCount: 8,
  includeExternal: true,
  includeLibrary: true,
};

const stages = ['拆解主题', '检索论文', '召回知识', '组织证据', '生成交付物'];

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
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/library', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '知识库读取失败');
      setDocuments(payload.documents);
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
  }, [loadHistory, loadLibrary]);

  const yearCounts = useMemo(() => {
    if (!result) return [];
    const counts = new Map<number, number>();
    result.papers.forEach((paper) => counts.set(paper.year, (counts.get(paper.year) ?? 0) + 1));
    return Array.from(counts.entries()).sort(([left], [right]) => left - right);
  }, [result]);

  async function runResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError('');
    setNotice('');
    setStage(0);
    setTab('overview');
    const timer = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, stages.length - 2));
    }, 950);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究任务执行失败');
      setResult(payload);
      setArtifacts([]);
      setStage(stages.length - 1);
      setNotice(payload.mode === 'model' ? '已使用模型完成生成' : '已使用本地生成器完成，可配置模型提升内容质量');
      void loadHistory();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : '研究任务执行失败');
    } finally {
      window.clearInterval(timer);
      setRunning(false);
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
      if (!response.ok) throw new Error(payload.error || '文件处理失败');
      await loadLibrary();
      setNotice('已写入 ' + payload.documents.length + ' 份资料');
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
      downloadBlob(await response.blob(), 'research-report.md');
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
      downloadBlob(await response.blob(), 'research-briefing.pptx');
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
    try {
      const response = await fetch('/api/research/' + id, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '研究任务读取失败');
      setResult(payload.result);
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
    try {
      const response = await fetch('/api/library/' + id, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '资料删除失败');
      await loadLibrary();
      setNotice('资料已删除');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '资料删除失败');
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><FlaskConical size={19} /></div>
          <div>
            <strong>Research Copilot</strong>
            <span>研究工作台</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <button className={view === 'research' ? 'nav-item active' : 'nav-item'} onClick={() => setView('research')}>
            <Search size={17} />研究任务
          </button>
          <button className={view === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => setView('library')}>
            <Library size={17} />知识库<span className="nav-count">{documents.length}</span>
          </button>
          {cloudEnabled ? <button className={view === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setView('history')}>
            <History size={17} />研究历史<span className="nav-count">{runs.length}</span>
          </button> : null}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div><strong>{cloudEnabled ? 'Private cloud' : 'Local ready'}</strong><span>{cloudEnabled ? '数据按工作空间隔离' : '兼容模式 · MCP 可用'}</span></div>
        </div>
        {userEmail ? <div className="account-block"><div><Cloud size={15} /><span title={userEmail}>{userEmail}</span></div><button className="icon-button" onClick={() => void onSignOut?.()} title="退出登录" aria-label="退出登录"><LogOut size={16} /></button></div> : null}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{view === 'research' ? 'RESEARCH / NEW RUN' : view === 'library' ? 'KNOWLEDGE / LIBRARY' : 'RESEARCH / HISTORY'}</span>
            <h1>{view === 'research' ? '研究任务' : view === 'library' ? '知识库' : '研究历史'}</h1>
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

        {error ? <div className="message error"><X size={16} />{error}</div> : null}
        {notice ? <div className="message notice"><Check size={16} />{notice}</div> : null}

        {view === 'research' ? (
          <div className="research-layout">
            <aside className="brief-panel">
              <form onSubmit={runResearch}>
                <div className="section-heading"><PanelLeft size={16} /><span>研究简报</span></div>
                <label className="field-label" htmlFor="topic">研究主题</label>
                <textarea id="topic" className="textarea topic-input" value={request.topic} onChange={(event) => setRequest({ ...request, topic: event.target.value })} required />

                <label className="field-label" htmlFor="requirements">侧重点与要求</label>
                <textarea id="requirements" className="textarea" value={request.requirements} onChange={(event) => setRequest({ ...request, requirements: event.target.value })} />

                <div className="two-columns">
                  <label className="control"><span>交付类型</span><select value={request.deliverable} onChange={(event) => setRequest({ ...request, deliverable: event.target.value as ResearchRequest['deliverable'] })}><option value="survey">研究综述</option><option value="proposal">技术方案</option><option value="briefing">汇报简报</option></select></label>
                  <label className="control"><span>目标受众</span><select value={request.audience} onChange={(event) => setRequest({ ...request, audience: event.target.value as ResearchRequest['audience'] })}><option value="technical">技术团队</option><option value="academic">学术研究</option><option value="general">通用受众</option></select></label>
                </div>

                <div className="two-columns">
                  <label className="control"><span>起始年份</span><input type="number" min="1950" max={new Date().getFullYear()} value={request.yearFrom} onChange={(event) => setRequest({ ...request, yearFrom: Number(event.target.value) })} /></label>
                  <label className="control"><span>论文数量</span><input type="number" min="3" max="20" value={request.paperCount} onChange={(event) => setRequest({ ...request, paperCount: Number(event.target.value) })} /></label>
                </div>

                <fieldset className="source-options">
                  <legend>检索来源</legend>
                  <label><input type="checkbox" checked={request.includeExternal} onChange={(event) => setRequest({ ...request, includeExternal: event.target.checked })} /><span><BookOpen size={15} />OpenAlex 论文</span></label>
                  <label><input type="checkbox" checked={request.includeLibrary} onChange={(event) => setRequest({ ...request, includeLibrary: event.target.checked })} /><span><Database size={15} />本地知识库</span></label>
                </fieldset>

                <button className="button run-button" type="submit" disabled={running || !request.topic.trim()}>
                  {running ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
                  {running ? '正在研究' : '开始研究'}
                </button>
              </form>

              <div className="process-list" aria-label="任务进度">
                {stages.map((label, index) => (
                  <div className={running && index === stage ? 'process-step current' : result || index < stage ? 'process-step done' : 'process-step'} key={label}>
                    <span>{result || index < stage ? <Check size={12} /> : index + 1}</span>{label}
                  </div>
                ))}
              </div>
            </aside>

            <section className="result-panel">
              {!result ? (
                <div className="empty-state">
                  <div className="empty-visual" aria-hidden="true">
                    <span className="node node-one"><Search size={18} /></span>
                    <span className="connector first" />
                    <span className="node node-two"><Database size={18} /></span>
                    <span className="connector second" />
                    <span className="node node-three"><Presentation size={18} /></span>
                  </div>
                  <h2>{running ? stages[stage] : '准备新的研究任务'}</h2>
                  <p>{running ? '正在组织论文与知识库证据' : '填写左侧研究简报并开始'}</p>
                </div>
              ) : (
                <>
                  <div className="result-header">
                    <div><span className="result-kicker">{result.mode === 'model' ? 'MODEL SYNTHESIS' : 'LOCAL SYNTHESIS'}</span><h2>{result.title}</h2><p>{result.thesis}</p></div>
                    <span className="result-id">RUN {result.id.slice(0, 6).toUpperCase()}</span>
                  </div>

                  <div className="tabs" role="tablist">
                    {([['overview', '总览'], ['papers', '论文'], ['report', '文稿'], ['slides', 'PPT']] as const).map(([value, label]) => (
                      <button key={value} className={tab === value ? 'tab active' : 'tab'} onClick={() => setTab(value)}>{label}{value === 'papers' ? <span>{result.papers.length}</span> : null}</button>
                    ))}
                  </div>

                  <div className="tab-content">
                    {tab === 'overview' ? <Overview result={result} yearCounts={yearCounts} artifacts={artifacts} /> : null}
                    {tab === 'papers' ? <Papers result={result} /> : null}
                    {tab === 'report' ? <Report result={result} /> : null}
                    {tab === 'slides' ? <Slides result={result} /> : null}
                  </div>
                </>
              )}
            </section>

            <aside className="evidence-panel">
              <div className="section-heading"><Database size={16} /><span>证据池</span>{result ? <em>{result.evidence.length}</em> : null}</div>
              {result?.evidence.length ? result.evidence.slice(0, 10).map((item) => (
                <article className="evidence-item" key={item.id}>
                  <div><span className={item.kind === 'paper' ? 'source-badge paper' : 'source-badge knowledge'}>{item.id}</span><span className="score">{Math.round(item.score * 100)}%</span></div>
                  <h3>{item.title}</h3>
                  <p>{item.excerpt}</p>
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看来源<ArrowUpRight size={13} /></a> : null}
                </article>
              )) : <div className="rail-empty"><Database size={20} /><span>暂无证据</span></div>}
            </aside>
          </div>
        ) : view === 'library' ? (
          <LibraryView documents={documents} uploading={uploading} fileInput={fileInput} onUpload={uploadFiles} onDelete={deleteDocument} cloudEnabled={cloudEnabled} />
        ) : <HistoryView runs={runs} onOpen={openRun} />}
      </section>
    </main>
  );
}

function Overview({ result, yearCounts, artifacts }: { result: ResearchResult; yearCounts: Array<[number, number]>; artifacts: ResearchArtifact[] }) {
  const maxCount = Math.max(1, ...yearCounts.map(([, count]) => count));
  return (
    <div className="overview-grid">
      <div className="metrics-band">
        <div><strong>{result.papers.length}</strong><span>外部论文</span></div>
        <div><strong>{result.evidence.filter((item) => item.kind === 'knowledge').length}</strong><span>本地证据</span></div>
        <div><strong>{result.sections.length}</strong><span>文稿章节</span></div>
        <div><strong>{result.slides.length}</strong><span>幻灯片</span></div>
      </div>
      {artifacts.length ? <section className="content-section">
        <div className="section-title"><h3>已归档成果</h3><span>{artifacts.length} 个文件</span></div>
        <div className="artifact-list">{artifacts.map((artifact) => <a href={'/api/artifacts/' + artifact.id} target="_blank" rel="noreferrer" key={artifact.id}><span className="artifact-icon">{artifact.type === 'pptx' ? <Presentation size={16} /> : <FileText size={16} />}</span><span><strong>{artifact.fileName}</strong><small>{formatBytes(artifact.size)} · {new Date(artifact.createdAt).toLocaleString('zh-CN')}</small></span><Download size={15} /></a>)}</div>
      </section> : null}
      <section className="content-section">
        <div className="section-title"><h3>发表年份分布</h3><span>{result.request.yearFrom} 至今</span></div>
        {yearCounts.length ? <div className="year-chart" role="img" aria-label="论文发表年份分布">
          {yearCounts.map(([year, count]) => <div className="year-bar" key={year}><span className="bar-value">{count}</span><span className="bar-fill" style={{ height: 24 + (count / maxCount) * 88 }} /><span className="bar-year">{year}</span></div>)}
        </div> : <div className="inline-empty">暂无论文年份数据</div>}
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
  return <div className="paper-list">{result.papers.map((paper, index) => (
    <article className="paper-row" key={paper.id}>
      <span className="paper-index">P{index + 1}</span>
      <div className="paper-main"><h3>{paper.title}</h3><p className="paper-meta">{authorLine(paper.authors)} · {paper.year} · 被引 {paper.citedByCount.toLocaleString()}</p><p>{paper.abstract}</p><div className="topic-row">{paper.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
      <a className="icon-link" href={paper.url} target="_blank" rel="noreferrer" aria-label={'打开 ' + paper.title}><ArrowUpRight size={17} /></a>
    </article>
  ))}</div>;
}

function Report({ result }: { result: ResearchResult }) {
  return <article className="report-document"><header><h2>{result.title}</h2><p>{result.thesis}</p></header>{result.sections.map((section, index) => <section key={section.id}><span className="section-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{section.title}</h3><p>{section.content}</p>{section.citations.length ? <div className="citation-row">{section.citations.map((citation) => <span key={citation}>[{citation}]</span>)}</div> : null}</div></section>)}</article>;
}

function Slides({ result }: { result: ResearchResult }) {
  return <div className="slide-grid">{result.slides.map((slide, index) => <article className={'slide-preview slide-' + slide.type} key={index}><div className="slide-top"><span>{String(index + 1).padStart(2, '0')}</span><Presentation size={14} /></div><h3>{slide.title}</h3><ul>{slide.keyPoints.slice(0, 5).map((point) => <li key={point}>{point}</li>)}</ul><footer>{citationText(slide.citations)}</footer></article>)}</div>;
}

function LibraryView({ documents, uploading, fileInput, onUpload, onDelete, cloudEnabled }: { documents: KnowledgeDocument[]; uploading: boolean; fileInput: React.RefObject<HTMLInputElement | null>; onUpload: (files: FileList | null) => void; onDelete: (id: string) => Promise<void>; cloudEnabled: boolean }) {
  return (
    <div className="library-layout">
      <input ref={fileInput} hidden type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" multiple onChange={(event) => void onUpload(event.target.files)} />
      <section className="upload-zone" onClick={() => fileInput.current?.click()}>
        {uploading ? <LoaderCircle className="spin" size={28} /> : <Upload size={28} />}
        <h2>{uploading ? '正在解析与向量化' : '添加研究资料'}</h2>
        <p>PDF、Markdown、TXT · 单文件不超过 15 MB</p>
      </section>
      <section className="library-table-section">
        <div className="section-title"><h3>已索引资料</h3><span>{documents.length} 份文档</span></div>
        {documents.length ? <div className="library-table"><div className="library-head"><span>名称</span><span>大小</span><span>分块</span><span>写入时间</span></div>{documents.map((document) => <div className="library-row" key={document.id}><span className="document-name"><FileText size={16} />{document.name}</span><span>{formatBytes(document.size)}</span><span>{document.chunkCount}</span><span>{new Date(document.createdAt).toLocaleString('zh-CN')}</span><span className="row-actions">{cloudEnabled ? <a className="icon-button" href={'/api/library/' + document.id} title="下载原文件" aria-label={'下载 ' + document.name}><Download size={15} /></a> : <ChevronRight size={15} />}<button className="icon-button danger" onClick={() => void onDelete(document.id)} title="删除资料" aria-label={'删除 ' + document.name}><Trash2 size={15} /></button></span></div>)}</div> : <div className="library-empty"><BookOpen size={24} /><span>知识库为空</span></div>}
      </section>
    </div>
  );
}

function HistoryView({ runs, onOpen }: { runs: ResearchRunSummary[]; onOpen: (id: string) => Promise<void> }) {
  return (
    <div className="history-layout">
      <div className="history-summary"><History size={21} /><div><strong>研究记录</strong><span>完整报告和证据会持久保存在你的私有工作空间</span></div></div>
      {runs.length ? <div className="history-list">{runs.map((run) => (
        <article className="history-row" key={run.id}>
          <div className={'run-status ' + run.status}>{run.status === 'completed' ? '已完成' : run.status === 'running' ? '执行中' : '失败'}</div>
          <div className="history-main"><h2>{run.title || run.topic}</h2><p>{new Date(run.createdAt).toLocaleString('zh-CN')} · {run.paperCount} 篇论文 · {run.evidenceCount} 条证据</p>{run.error ? <span>{run.error}</span> : null}</div>
          <button className="button secondary" disabled={run.status !== 'completed'} onClick={() => void onOpen(run.id)}>打开<ChevronRight size={15} /></button>
        </article>
      ))}</div> : <div className="library-empty"><History size={24} /><span>还没有研究记录</span></div>}
    </div>
  );
}
