'use client';

import { Activity, AlertTriangle, CheckCircle2, ChevronDown, RefreshCw, Server, Timer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Monitoring = { mode:string; queues:Record<string,number>; jobs:Array<{id:string;kind:string;status:string;stage:string;progress:number;error?:string;updatedAt:string}>; traces:Array<{id:string;topic:string;status:string;createdAt:string;totalDurationMs:number;failedSteps:number;trace:Array<{title:string;status:string;summary:string;durationMs:number}>}> };

export function MonitoringView() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const response = await fetch('/api/monitoring',{cache:'no-store'}); const payload = await response.json(); if(!response.ok) throw Error(payload.error || '监控数据读取失败'); setData(payload); } catch(e) { setError(e instanceof Error ? e.message : '监控数据读取失败'); } finally { setLoading(false); } },[]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer); }, [load]);
  if (error) return <div className="monitoring-page"><div className="message error">{error}</div></div>;
  const queues = data?.queues ?? {};
  const jobs = (data?.jobs ?? []).filter((job) => statusFilter === 'all' || job.status === statusFilter);
  const traces = (data?.traces ?? []).filter((run) => statusFilter === 'all' || run.status === statusFilter);
  return <div className="monitoring-page">
    <header className="monitoring-heading"><div><Activity size={22}/><div><h2>运行监控</h2><p>研究任务、文档解析和 Agent 节点的实时状态</p></div></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/>刷新</button></header>
    <div className="monitoring-metrics"><article><Server size={18}/><strong>{queues.research_queued ?? 0}</strong><span>研究排队</span></article><article><Activity size={18}/><strong>{queues.research_running ?? 0}</strong><span>研究执行中</span></article><article><Server size={18}/><strong>{queues.ingestion_queued ?? 0}</strong><span>解析排队</span></article><article><Timer size={18}/><strong>{queues.ingestion_processing ?? 0}</strong><span>解析执行中</span></article></div>
    <div className="monitoring-filter"><label>筛选状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">全部</option><option value="queued">排队中</option><option value="running">执行中</option><option value="completed">已完成</option><option value="failed">失败</option><option value="cancelled">已取消</option></select></label><span>每 10 秒自动刷新</span></div>
    <section className="monitoring-section"><div className="section-title"><h3>最近研究任务</h3><span>{jobs.length} 条</span></div><div className="monitoring-job-list">{jobs.length ? jobs.map(job => <article key={job.id}><div><strong>{job.kind === 'refine' ? '版本修订' : '研究生成'}</strong><span className={'run-status ' + job.status}>{job.status}</span></div><p>{job.stage} · {job.progress}%</p><small>{new Date(job.updatedAt).toLocaleString('zh-CN')}{job.error ? ` · ${job.error}` : ''}</small></article>) : <div className="inline-empty">没有符合条件的任务</div>}</div></section>
    <section className="monitoring-section"><div className="section-title"><h3>Agent 节点轨迹</h3><span>{traces.length} 个任务</span></div><div className="monitoring-traces">{traces.length ? traces.map(run => <article key={run.id}><button type="button" className="monitoring-trace-summary" onClick={() => setExpandedTrace(expandedTrace === run.id ? null : run.id)}><span>{run.failedSteps ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<strong>{run.topic}</strong></span><small>{run.trace.length} 节点 · {run.totalDurationMs}ms · {expandedTrace === run.id ? '收起' : '展开'}<ChevronDown size={15} /></small></button>{expandedTrace === run.id ? <div className="monitoring-trace-steps">{run.trace.map((step,index) => <span key={step.title + index} className={step.status}><b>{step.title}</b><small>{step.durationMs}ms · {step.summary}</small></span>)}</div> : null}</article>) : <div className="inline-empty">没有符合条件的 Agent 轨迹</div>}</div></section>
  </div>;
}
