'use client';

import { ChevronRight, History, LoaderCircle, Trash2 } from 'lucide-react';

import type { ResearchRunSummary } from '@/types/platform';

export function ResearchHistoryView({
  runs,
  deletingRunId,
  onOpen,
  onDelete,
}: {
  runs: ResearchRunSummary[];
  deletingRunId: string | null;
  onOpen: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return <div className="history-layout">
    <div className="history-summary"><History size={21} /><div><strong>研究记录</strong><span>报告、证据和版本都会保存在当前账户下，随时回看或继续改</span></div></div>
    {runs.length ? <div className="history-list">{runs.map((run) => <article className="history-row" key={run.id}>
      <div className={'run-status ' + run.status}>{run.status === 'completed' ? '已完成' : run.status === 'running' ? '执行中' : '失败'}</div>
      <div className="history-main"><h2><span className="version-label">V{run.version}</span>{run.title || run.topic}</h2><p>{new Date(run.createdAt).toLocaleString('zh-CN')} · {run.templateName ?? '自由格式'} · {run.aiSource === 'personal' ? '个人 Key' : run.aiSource === 'platform' ? '平台模型' : '本地模式'} · {run.paperCount} 条外部来源 · {run.evidenceCount} 条证据</p>{run.revisionInstruction ? <small>{run.revisionInstruction}</small> : null}{run.error ? <span>{run.error}</span> : null}</div>
      <div className="history-actions"><button className="button secondary" disabled={run.status !== 'completed' || deletingRunId === run.id} onClick={() => void onOpen(run.id)}>打开<ChevronRight size={15} /></button><button className="icon-button danger" type="button" disabled={deletingRunId === run.id} onClick={() => void onDelete(run.id)} title="删除研究记录" aria-label={'删除 ' + (run.title || run.topic)}>{deletingRunId === run.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button></div>
    </article>)}</div> : <div className="library-empty"><History size={24} /><span>还没有研究记录</span></div>}
  </div>;
}
