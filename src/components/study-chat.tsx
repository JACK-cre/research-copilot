'use client';

import {
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {
  inferStudyImageMime,
  MAX_STUDY_IMAGE_BYTES,
  MAX_STUDY_IMAGES,
} from '@/lib/study-images';
import type { StudyConversationSummary, StudyMessage } from '@/types/platform';

const STORAGE_KEY = 'research-copilot.study.conversation';

type PendingImage = {
  id: string;
  file: File;
  preview: string;
};

function attachmentSrc(conversationId: string, storagePath: string): string {
  return `/api/study/${conversationId}/files?path=${encodeURIComponent(storagePath)}`;
}

export function StudyChat({
  onError,
  onNotice,
}: {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [conversations, setConversations] = useState<StudyConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [memorySummary, setMemorySummary] = useState('');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [useLibrary, setUseLibrary] = useState(false);
  const [useWeb, setUseWeb] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const freeChat = !useLibrary && !useWeb;
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  const clearPending = useCallback((items?: PendingImage[]) => {
    (items ?? pending).forEach((item) => URL.revokeObjectURL(item.preview));
    setPending([]);
  }, [pending]);

  const loadConversations = useCallback(async () => {
    const response = await fetch('/api/study', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '对话列表读取失败');
    setConversations(payload.conversations ?? []);
    return payload.conversations as StudyConversationSummary[] ?? [];
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const response = await fetch('/api/study/' + id, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      onError(payload.error || '对话读取失败');
      return;
    }
    setConversationId(id);
    setMessages(payload.messages ?? []);
    setMemorySummary(payload.memorySummary ?? '');
    window.localStorage.setItem(STORAGE_KEY, id);
  }, [onError]);

  useEffect(() => {
    void (async () => {
      try {
        const items = await loadConversations();
        if (restored.current) return;
        restored.current = true;
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const target = saved && items.some((item) => item.id === saved) ? saved : undefined;
        if (target) await openConversation(target);
      } catch (error: unknown) {
        onError(error instanceof Error ? error.message : '对话列表读取失败');
      }
    })();
  }, [loadConversations, onError, openConversation]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => {
    pendingRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  function addImages(files: File[]) {
    if (!files.length) return;
    const accepted: PendingImage[] = [];
    for (const file of files) {
      const mime = inferStudyImageMime(file);
      if (!mime) {
        onError(`不支持的图片格式：${file.name}`);
        continue;
      }
      if (file.size > MAX_STUDY_IMAGE_BYTES) {
        onError(`图片 ${file.name} 超过 8MB，请压缩后再发送。`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }
    if (!accepted.length) return;
    setPending((current) => {
      const next = [...current, ...accepted];
      if (next.length > MAX_STUDY_IMAGES) {
        next.slice(MAX_STUDY_IMAGES).forEach((item) => URL.revokeObjectURL(item.preview));
        onError(`一次最多发送 ${MAX_STUDY_IMAGES} 张图片。`);
        return next.slice(0, MAX_STUDY_IMAGES);
      }
      return next;
    });
  }

  function removePending(id: string) {
    setPending((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (sending || (!message && !pending.length)) return;
    const files = pending.map((item) => item.file);
    setDraft('');
    setSending(true);
    onError('');
    try {
      const form = new FormData();
      if (conversationId) form.append('conversationId', conversationId);
      form.append('message', message);
      form.append('useLibrary', String(useLibrary));
      form.append('useWeb', String(useWeb));
      for (const file of files) form.append('images', file);
      const response = await fetch('/api/study', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '发送失败');
      setConversationId(payload.conversationId);
      setMessages(payload.messages ?? []);
      setMemorySummary(payload.memorySummary ?? '');
      window.localStorage.setItem(STORAGE_KEY, payload.conversationId);
      clearPending(pending);
      await loadConversations();
    } catch (error) {
      onError(error instanceof Error ? error.message : '发送失败');
      setDraft(message);
    } finally {
      setSending(false);
    }
  }

  async function removeConversation(id: string) {
    if (!window.confirm('确认删除这轮对话？')) return;
    const response = await fetch('/api/study/' + id, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      onError(payload.error || '删除失败');
      return;
    }
    if (conversationId === id) {
      setConversationId(undefined);
      setMessages([]);
      setMemorySummary('');
      window.localStorage.removeItem(STORAGE_KEY);
    }
    await loadConversations();
    onNotice('对话已删除');
  }

  function startNew() {
    setConversationId(undefined);
    setMessages([]);
    setMemorySummary('');
    setDraft('');
    clearPending();
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    addImages(Array.from(event.dataTransfer.files || []));
  }

  const canSend = Boolean(draft.trim() || pending.length);

  return (
    <div className="study-layout">
      <aside className="study-rail">
        <button className="button secondary" type="button" onClick={startNew}><Plus size={15} />新对话</button>
        {conversations.length ? conversations.map((item) => (
          <div className={'study-convo ' + (item.id === conversationId ? 'active' : '')} key={item.id}>
            <button type="button" onClick={() => void openConversation(item.id)}>
              <strong>{item.title}</strong>
              <small>{item.messageCount} 条 · {new Date(item.updatedAt).toLocaleString('zh-CN')}</small>
            </button>
            <button className="icon-button danger" type="button" onClick={() => void removeConversation(item.id)} aria-label={'删除 ' + item.title}><Trash2 size={14} /></button>
          </div>
        )) : <div className="rail-empty"><MessageCircle size={18} /><span>还没有对话</span></div>}
      </aside>

      <section className="study-main">
        <div className="study-toolbar">
          <div className="study-mode-pills" role="group" aria-label="对话模式">
            <button type="button" className={freeChat ? 'active' : ''} onClick={() => { setUseLibrary(false); setUseWeb(false); }}>自由对话</button>
            <button type="button" className={useLibrary ? 'active' : ''} onClick={() => setUseLibrary((value) => !value)}>知识库</button>
            <button type="button" className={useWeb ? 'active' : ''} onClick={() => setUseWeb((value) => !value)}>外部资料</button>
          </div>
          <span>{freeChat ? '只靠对话模型作答，不检索资料' : useLibrary && useWeb ? '结合知识库和公开来源作答' : useLibrary ? '只检索你的知识库' : '只检索公开来源'}</span>
        </div>
        <div className="study-thread" ref={listRef}>
          {memorySummary ? <div className="study-memory">更早的对话已压缩为记忆，本页仍显示完整记录。模型下次只会看到摘要和最近 4 轮原文。</div> : null}
          {messages.length ? messages.map((item) => (
            <article className={'study-bubble ' + item.role} key={item.id}>
              <strong>{item.role === 'user' ? '你' : item.toolTrace?.length ? '复习助手' : '助手'}</strong>
              {item.attachments?.length && conversationId ? (
                <div className="study-bubble-images">
                  {item.attachments.map((file) => (
                    <a key={file.id} href={attachmentSrc(conversationId, file.storagePath)} target="_blank" rel="noreferrer">
                      <img src={attachmentSrc(conversationId, file.storagePath)} alt={file.name} />
                    </a>
                  ))}
                </div>
              ) : null}
              <p>{item.content}</p>
              {item.toolTrace?.length ? <div className="tool-chip-row">{item.toolTrace.map((trace, index) => <span key={item.id + trace.name + index}>{trace.name} · {trace.summary}</span>)}</div> : null}
              {item.citations?.length ? <div className="study-cites">{item.citations.map((citation) => citation.url ? <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">{citation.id} {citation.title}</a> : <span key={citation.id}>{citation.id} {citation.title}</span>)}</div> : null}
            </article>
          )) : (
            <div className="empty-state study-empty">
              <h2>{freeChat ? '随时聊聊' : '把知识库变成可复习的对话'}</h2>
              <p>{freeChat
                ? '不检索知识库，也不上网。用你配置的对话模型直接回答，也可以插入、粘贴或拖入图片。同一会话会一直留在这个页面。'
                : '可以问讲义里的概念、让它抽背、解释一段材料或图片，或结合公开论文做对比。助手会先调 MCP 工具检索，再回答。'}</p>
            </div>
          )}
          {sending ? <div className="study-bubble assistant pending"><LoaderCircle className="spin" size={16} />{freeChat ? '正在思考' : '正在检索并作答'}</div> : null}
        </div>
        <form
          className={'study-composer' + (dragging ? ' dragging' : '')}
          onSubmit={send}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {pending.length ? (
            <div className="study-attach-previews">
              {pending.map((item) => (
                <div className="study-attach-chip" key={item.id}>
                  <img src={item.preview} alt={item.file.name} />
                  <button type="button" onClick={() => removePending(item.id)} aria-label={'移除 ' + item.file.name}><X size={12} /></button>
                </div>
              ))}
            </div>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(event) => {
              addImages(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <button className="icon-button study-attach-button" type="button" disabled={sending} onClick={() => fileRef.current?.click()} aria-label="插入图片">
            <ImagePlus size={18} />
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.items)
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file));
              if (files.length) {
                event.preventDefault();
                addImages(files);
              }
            }}
            placeholder={freeChat ? '随便问点什么，或插入一张图' : '例如：根据知识库讲讲长征的转折点，并出 3 道简答题'}
            maxLength={50000}
          />
          <button className="button primary" disabled={sending || !canSend}>{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}发送</button>
        </form>
      </section>
    </div>
  );
}
