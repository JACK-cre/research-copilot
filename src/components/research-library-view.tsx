'use client';

import { BookOpen, ChevronDown, Download, Eye, FileText, LoaderCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { IngestionJob } from '@/types/ingestion';
import type { KnowledgeChunkPreview, KnowledgeDocument } from '@/types/research';

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
  const [loadingEvidenceId, setLoadingEvidenceId] = useState<string | null>(null);
  const [evidenceByDocument, setEvidenceByDocument] = useState<Record<string, KnowledgeChunkPreview[]>>({});

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
    <input ref={fileInput} hidden type="file" accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown" multiple onChange={(event) => void onUpload(event.target.files)} />
    <section className="upload-zone" onClick={() => fileInput.current?.click()}>
      {uploading ? <LoaderCircle className="spin" size={28} /> : <Upload size={28} />}
      <h2>{uploading ? '正在上传文件' : '添加研究资料'}</h2>
      <p>PDF、Markdown、TXT。上传后会在后台解析、识图和向量化，切换页面或刷新不会中断任务。单文件上限 500MB，单批上限 600MB</p>
    </section>
    {jobs.length ? <section className="ingestion-panel">
      <div className="section-title"><h3>后台解析任务</h3><span>{jobs.filter((job) => job.status === 'queued' || job.status === 'processing').length} 个进行中</span></div>
      <div className="ingestion-list">{jobs.slice(0, 8).map((job) => <article className={`ingestion-row ${job.status}`} key={job.id}>
        <div className="ingestion-heading"><FileText size={15} /><strong title={job.fileName}>{job.fileName}</strong><span>{job.status === 'ready' ? `${job.chunkCount} 块` : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '已取消' : `${job.progress}%`}</span></div>
        <div className="ingestion-progress"><span style={{ width: `${job.status === 'ready' ? 100 : job.progress}%` }} /></div>
        <div className="ingestion-meta"><small>{job.status === 'queued' ? '排队中' : job.stage === 'reading' ? '读取文件' : job.stage === 'extracting' ? '解析正文与图片' : job.stage === 'vectorizing' ? '生成向量' : job.stage === 'saving' ? '写入知识库' : job.status === 'ready' ? '已可用' : job.error || '解析失败'}</small>{job.status === 'failed' || job.status === 'cancelled' ? <button type="button" onClick={() => void onRetryJob(job.id).catch((error) => onError(error instanceof Error ? error.message : '重试失败'))}>重试</button> : job.status === 'queued' || job.status === 'processing' ? <button type="button" onClick={() => void onCancelJob(job.id).catch((error) => onError(error instanceof Error ? error.message : '取消失败'))}>取消</button> : null}</div>
      </article>)}</div>
    </section> : null}
    <section className="library-table-section">
      <div className="section-title"><h3>已索引资料</h3><span>{documents.length} 份文档</span></div>
      {documents.length ? <div className="library-table"><div className="library-head"><span>名称</span><span>大小</span><span>分块</span><span>写入时间</span></div>{documents.map((document) => <div className="library-entry" key={document.id}><div className="library-row"><span className="document-name"><FileText size={16} />{document.name}</span><span>{formatBytes(document.size)}</span><span>{document.status === 'processing' ? '处理中' : document.chunkCount}</span><span>{new Date(document.createdAt).toLocaleString('zh-CN')}</span><span className="row-actions"><button className="icon-button" type="button" disabled={document.status === 'processing'} onClick={() => void toggleEvidence(document.id)} title={document.status === 'processing' ? '资料仍在处理中' : '查看关键证据段落'}>{loadingEvidenceId === document.id ? <LoaderCircle className="spin" size={15} /> : expandedDocumentId === document.id ? <ChevronDown size={15} /> : <Eye size={15} />}</button><button className="icon-button" type="button" disabled={document.status === 'processing'} onClick={() => void onReindex(document.id).catch((error) => onError(error instanceof Error ? error.message : '重建索引失败'))} title="用当前 Embedding 模型重建索引"><RefreshCw size={15} /></button>{cloudEnabled ? <a className="icon-button" href={'/api/library/' + document.id} title="下载原文件"><Download size={15} /></a> : null}<button className="icon-button danger" type="button" onClick={() => void onDelete(document.id)} title="删除资料"><Trash2 size={15} /></button></span></div>{expandedDocumentId === document.id ? <div className="document-evidence-panel"><header><div><strong>关键证据段落</strong><span>从 {document.chunkCount} 个索引分块中按信息量展示</span></div><small>{evidenceByDocument[document.id]?.length ?? 0} 个片段</small></header>{loadingEvidenceId === document.id ? <div className="evidence-loading"><LoaderCircle className="spin" size={18} />正在读取索引</div> : evidenceByDocument[document.id]?.length ? <div className="document-chunks">{evidenceByDocument[document.id].map((chunk, index) => <article key={chunk.id}><div><span>片段 {String(index + 1).padStart(2, '0')}</span>{chunk.page ? <small>第 {chunk.page} 页</small> : null}</div><p>{chunk.content}</p></article>)}</div> : <div className="evidence-loading">当前文档没有可展示的文本片段</div>}</div> : null}</div>)}</div> : <div className="library-empty"><BookOpen size={24} /><span>知识库为空</span></div>}
    </section>
  </div>;
}
