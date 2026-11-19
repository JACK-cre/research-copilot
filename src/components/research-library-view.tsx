'use client';

import { BookOpen, ChevronDown, Download, Eye, FileText, LoaderCircle, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { isIngestionJobVisible, type IngestionJob } from '@/types/ingestion';
import type { KnowledgeChunkPreview, KnowledgeDocument } from '@/types/research';
import { locationLabel } from '@/lib/chunk-context';

function formatBytes(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

export function ResearchLibraryView({
  documents,
  uploading,
  fileInput,
  onUpload,
  onDelete,
  onError,
  cloudEnabled,
  jobs,
  onRetryJob,
  onCancelJob,
  onReindex,
}: {
  documents: KnowledgeDocument[];
  uploading: boolean;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onUpload: (files: FileList | null) => void;
  onDelete: (id: string) => Promise<void>;
  onError: (message: string) => void;
  cloudEnabled: boolean;
  jobs: IngestionJob[];
  onRetryJob: (id: string) => Promise<void>;
  onCancelJob: (id: string) => Promise<void>;
  onReindex: (id: string) => Promise<void>;
}) {
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const filtered = documents.filter(d => d.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  const [loadingEvidenceId, setLoadingEvidenceId] = useState<string | null>(null);
  const [evidenceByDocument, setEvidenceByDocument] = useState<Record<string, KnowledgeChunkPreview[]>>({});
  const visibleJobs = jobs.filter(isIngestionJobVisible);
  const activeJobCount = visibleJobs.filter((job) => job.status === 'queued' || job.status === 'processing').length;

  useEffect(() => {
    const ids = new Set(documents.map((document) => document.id));
    if (expandedDocumentId && !ids.has(expandedDocumentId)) setExpandedDocumentId(null);
    setEvidenceByDocument((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
  }, [documents, expandedDocumentId]);

  async function toggleEvidence(documentId: string) {
    if (expandedDocumentId === documentId) {
      setExpandedDocumentId(null);
      return;
    }
    setExpandedDocumentId(documentId);
    if (evidenceByDocument[documentId]) return;
    setLoadingEvidenceId(documentId);
    onError('');
    try {
      const response = await fetch('/api/library/' + documentId + '/evidence', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '证据片段读取失败');
      setEvidenceByDocument((current) => ({ ...current, [documentId]: payload.chunks ?? [] }));
    } catch (error) {
      onError(error instanceof Error ? error.message : '证据片段读取失败');
      setExpandedDocumentId(null);
    } finally {
      setLoadingEvidenceId(null);
    }
  }

  return <div className="library-layout">
    <input ref={fileInput} hidden type="file" accept=".pdf,.md,.txt,.docx,.pptx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple onChange={(event) => void onUpload(event.target.files)} />
    <section className="library-intro">
      <div><BookOpen aria-hidden="true" size={24} /><h2>研究资料库</h2></div>
      <button type="button" className="button primary" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{uploading ? '上传中' : '添加资料'}</button>
      <p>PDF · Markdown · TXT · DOCX · PPTX <span>单文件 500 MB 以内，单批 600 MB 以内</span></p>
    </section>
    {visibleJobs.length ? <section className="ingestion-panel">
      <div className="section-title"><h3>后台解析任务</h3><span>{activeJobCount} 个进行中</span></div>
      <div className="ingestion-list">{visibleJobs.slice(0, 8).map((job) => <article className={`ingestion-row ${job.status}`} key={job.id}>
        <div className="ingestion-heading"><FileText size={15} /><strong title={job.fileName}>{job.fileName}</strong><span>{job.status === 'ready' ? `${job.chunkCount} 块` : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '已取消' : `${job.progress}%`}</span></div>
        <div className="ingestion-progress"><span style={{ width: `${job.status === 'ready' ? 100 : job.progress}%` }} /></div>
        <div className="ingestion-meta"><small>{job.status === 'queued' ? '排队中' : job.stage === 'reading' ? '读取文件' : job.stage === 'extracting' ? '解析正文与图片' : job.stage === 'vectorizing' ? '生成向量' : job.stage === 'saving' ? '写入知识库' : job.status === 'ready' ? '已可用' : job.error || '解析失败'}</small>{job.status === 'failed' || job.status === 'cancelled' ? <button type="button" onClick={() => void onRetryJob(job.id).catch((error) => onError(error instanceof Error ? error.message : '重试失败'))}>重试</button> : job.status === 'queued' || job.status === 'processing' ? <button type="button" onClick={() => void onCancelJob(job.id).catch((error) => onError(error instanceof Error ? error.message : '取消失败'))}>取消</button> : null}</div>
      </article>)}</div>
    </section> : null}
    <section className="library-table-section">
      <header className="library-toolbar">
        <h3>全部资料 <small>{filter.trim() ? `${filtered.length} / ` : ''}{documents.length}</small></h3>
        <div className="library-filter"><Search size={16}/><input aria-label="按文件名筛选" placeholder="搜索文件名" value={filter} onChange={e => setFilter(e.target.value)} />{filter && <button type="button" title="清除搜索" onClick={() => setFilter('')}><X size={15}/></button>}</div>
      </header>
      {filtered.length ? <div className="library-table">
        <div className="library-head"><span>文件名称</span><span>大小</span><span>分块</span><span>写入时间</span></div>
        {filtered.map(doc => <div className="library-entry" key={doc.id}>
          <div className="library-row">
            <button type="button" className="library-file" aria-expanded={expandedDocumentId === doc.id} disabled={doc.status === 'processing'} onClick={() => void toggleEvidence(doc.id)}><FileText size={17}/><span>{doc.name}</span></button>
            <span>{formatBytes(doc.size)}</span><span>{doc.status === 'processing' ? '处理中' : doc.chunkCount}</span><span>{new Date(doc.createdAt).toLocaleString('zh-CN')}</span>
            <span className="row-actions">
              <button className="icon-button" type="button" disabled={doc.status === 'processing'} onClick={() => void toggleEvidence(doc.id)} aria-expanded={expandedDocumentId === doc.id} title="查看证据片段">{loadingEvidenceId === doc.id ? <LoaderCircle className="spin" size={15}/> : expandedDocumentId === doc.id ? <ChevronDown size={15}/> : <Eye size={15}/>}</button>
              {cloudEnabled && <><button className="icon-button" type="button" disabled={doc.status === 'processing'} onClick={() => void onReindex(doc.id).then(() => { setEvidenceByDocument(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== doc.id))); setExpandedDocumentId(null); }).catch(error => onError(error instanceof Error ? error.message : '重建索引失败'))} title="重建索引"><RefreshCw size={15}/></button><a className="icon-button" href={'/api/library/' + doc.id} title="下载原文件"><Download size={15}/></a></>}
              <button className="icon-button danger" type="button" onClick={() => void onDelete(doc.id)} title="删除资料"><Trash2 size={15}/></button>
            </span>
          </div>
          {expandedDocumentId === doc.id && <div className="document-evidence-panel library-reader"><header><strong>原文片段</strong><small>精选 {evidenceByDocument[doc.id]?.length ?? 0} / 共 {doc.chunkCount} 块</small></header>
            {loadingEvidenceId === doc.id ? <p role="status">正在读取索引…</p> : evidenceByDocument[doc.id]?.length ? evidenceByDocument[doc.id].map((chunk, i) => <article key={chunk.id}><small>{locationLabel(chunk) || `预览片段 ${i + 1}`}</small><p>{chunk.content}</p></article>) : <p>暂无可展示的片段</p>}
          </div>}
        </div>)}
      </div> : <div className="library-empty"><BookOpen size={24}/><span>{documents.length ? '没有匹配的文件' : '暂无研究资料'}</span></div>}
    </section>
  </div>;
}
