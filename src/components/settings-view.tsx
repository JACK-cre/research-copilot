'use client';

import { Check, ChevronDown, ChevronRight, FileText, KeyRound, LoaderCircle, Pencil, Presentation, Sparkles, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { TemplateBlueprintEditor } from '@/components/template-blueprint-editor';
import { blueprintToInstructions, defaultTemplateBlueprint } from '@/lib/template-blueprint';
import { isZhipuBaseUrl } from '@/lib/embedding-dimensions';
import { DEFAULT_CHAT_BASE_URL, DEFAULT_CHAT_MODEL, DEFAULT_EMBEDDING_BASE_URL, DEFAULT_EMBEDDING_MODEL, MODEL_PROVIDERS, embeddingRequirement, matchProvider } from '@/lib/providers';
import type { AiSettingsSummary, OutputTemplate, TemplateBlueprint, TemplateKind } from '@/types/platform';


function formatBytes(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

function isDeepSeekBaseUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === 'api.deepseek.com';
  } catch {
    return false;
  }
}

export function SettingsView({ templates, onTemplatesChanged, onError, onNotice }: {
  templates: OutputTemplate[];
  onTemplatesChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [ai, setAi] = useState<AiSettingsSummary | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState(DEFAULT_CHAT_BASE_URL);
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL);
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [embeddingBaseURL, setEmbeddingBaseURL] = useState(DEFAULT_EMBEDDING_BASE_URL);
  const [embeddingModel, setEmbeddingModel] = useState(DEFAULT_EMBEDDING_MODEL);
  const [savingAi, setSavingAi] = useState(false);
  const [analyzingTemplate, setAnalyzingTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [paperTemplateFile, setPaperTemplateFile] = useState<File | null>(null);
  const [slidesTemplateFile, setSlidesTemplateFile] = useState<File | null>(null);
  const [templateNote, setTemplateNote] = useState('');
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'extracted' | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const paperTemplateInput = useRef<HTMLInputElement>(null);
  const slidesTemplateInput = useRef<HTMLInputElement>(null);
  const templateEditor = useRef<HTMLDivElement>(null);
  const [templateDraft, setTemplateDraft] = useState<{
    name: string;
    kind: TemplateKind;
    description: string;
    instructions: string;
    blueprint: TemplateBlueprint;
  }>({
    name: '',
    kind: 'both',
    description: '',
    instructions: '',
    blueprint: defaultTemplateBlueprint('both'),
  });
  const [showAdvancedTemplate, setShowAdvancedTemplate] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);

  const loadAiSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/ai', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'AI 配置读取失败');
      setAi(payload.settings);
      setBaseURL(payload.settings.baseURL);
      setChatModel(payload.settings.chatModel);
      setEmbeddingBaseURL(payload.settings.embeddingBaseURL);
      setEmbeddingModel(payload.settings.embeddingModel);
    } catch (loadError) {
      onError(loadError instanceof Error ? loadError.message : 'AI 配置读取失败');
    }
  }, [onError]);

  useEffect(() => {
    void loadAiSettings();
  }, [loadAiSettings]);

  async function saveAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAi(true);
    onError('');
    try {
      const response = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          baseURL,
          chatModel,
          embeddingApiKey: embeddingApiKey.trim() || undefined,
          embeddingBaseURL,
          embeddingModel,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'AI 配置保存失败');
      setAi(payload.settings);
      setApiKey('');
      setEmbeddingApiKey('');
      const embeddingChanged = ai && (
        ai.embeddingModel !== payload.settings.embeddingModel
        || ai.embeddingBaseURL !== payload.settings.embeddingBaseURL
      );
      onNotice(embeddingChanged
        ? 'AI 配置已保存；向量模型已变化，请重新上传旧资料以生成新的语义向量'
        : '个人 AI 配置已加密保存');
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : 'AI 配置保存失败');
    } finally {
      setSavingAi(false);
    }
  }

  function updateBaseURL(value: string) {
    setBaseURL(value);
  }

  function selectEmbeddingMode(mode: 'local' | 'provider') {
    if (mode === 'local') {
      setEmbeddingModel('local-hash-v1');
      return;
    }
    if (embeddingModel === 'local-hash-v1' || /jina/i.test(embeddingModel) || /jina\.ai/i.test(embeddingBaseURL)) {
      setEmbeddingBaseURL(baseURL);
      setEmbeddingModel(isZhipuBaseUrl(baseURL) ? 'embedding-3' : 'text-embedding-3-small');
    }
  }

  async function removeAi() {
    if (!window.confirm('确认删除个人 API Key 并切换到平台或本地模式？')) return;
    const response = await fetch('/api/settings/ai', { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      onError(payload.error || 'AI 配置删除失败');
      return;
    }
    setAi(payload.settings);
    setApiKey('');
    setEmbeddingApiKey('');
    onNotice('个人 API Key 已删除');
  }

  async function analyzeTemplate() {
    if (!paperTemplateFile && !slidesTemplateFile && templateNote.trim().length < 8) {
      onError('请上传论文模板（Word/PDF）或 PPTX，或填写格式要求。');
      return;
    }
    setAnalyzingTemplate(true);
    setAnalysisMode(null);
    onError('');
    try {
      const formData = new FormData();
      if (paperTemplateFile) formData.append('paper', paperTemplateFile);
      if (slidesTemplateFile) formData.append('slides', slidesTemplateFile);
      formData.append('note', templateNote);
      const response = await fetch('/api/templates/analyze', { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '模板识别失败');
      setTemplateDraft({
        name: payload.analysis.name,
        kind: payload.analysis.kind,
        description: payload.analysis.description,
        instructions: payload.analysis.instructions,
        blueprint: payload.analysis.blueprint ?? defaultTemplateBlueprint(payload.analysis.kind),
      });
      setAnalysisMode(payload.analysis.mode);
      onNotice(payload.analysis.mode === 'ai'
        ? '已从参考资料中提炼模板规则，请确认后保存'
        : '已提取参考资料；配置个人 AI Key 后可获得更精炼的规则');
    } catch (analysisError) {
      onError(analysisError instanceof Error ? analysisError.message : '模板识别失败');
    } finally {
      setAnalyzingTemplate(false);
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTemplate(true);
    onError('');
    try {
      const formData = new FormData();
      formData.append('name', templateDraft.name);
      formData.append('kind', templateDraft.kind);
      formData.append('description', templateDraft.description);
      formData.append('instructions', templateDraft.instructions);
      formData.append('blueprint', JSON.stringify(templateDraft.blueprint));
      if (paperTemplateFile) formData.append('paper', paperTemplateFile);
      if (slidesTemplateFile) formData.append('slides', slidesTemplateFile);
      const response = await fetch(editingTemplateId ? '/api/templates/' + editingTemplateId : '/api/templates', {
        method: editingTemplateId ? 'PUT' : 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '模板保存失败');
      const wasEditing = Boolean(editingTemplateId);
      setTemplateDraft({ name: '', kind: 'both', description: '', instructions: '', blueprint: defaultTemplateBlueprint('both') });
      setPaperTemplateFile(null);
      setSlidesTemplateFile(null);
      setTemplateNote('');
      setAnalysisMode(null);
      setEditingTemplateId(null);
      if (paperTemplateInput.current) paperTemplateInput.current.value = '';
      if (slidesTemplateInput.current) slidesTemplateInput.current.value = '';
      await onTemplatesChanged();
      onNotice(wasEditing ? '模板修改已保存' : '自定义模板已保存并会在后续登录中保留');
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : '模板保存失败');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function removeTemplate(id: string) {
    if (!window.confirm('确认删除这个自定义模板？')) return;
    const response = await fetch('/api/templates/' + id, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      onError(payload.error || '模板删除失败');
      return;
    }
    await onTemplatesChanged();
    onNotice('自定义模板已删除');
  }

  async function editTemplate(template: OutputTemplate) {
    let fullTemplate = template;
    if (!template.isDefault && !template.blueprint) {
      try {
        const response = await fetch('/api/templates/' + template.id, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '模板读取失败');
        fullTemplate = payload.template;
      } catch (loadError) {
        onError(loadError instanceof Error ? loadError.message : '模板读取失败');
        return;
      }
    }
    setTemplateDraft({
      name: fullTemplate.isDefault ? fullTemplate.name + '（自定义）' : fullTemplate.name,
      kind: fullTemplate.kind,
      description: fullTemplate.description,
      instructions: fullTemplate.instructions,
      blueprint: fullTemplate.blueprint ?? defaultTemplateBlueprint(fullTemplate.kind),
    });
    setPaperTemplateFile(null);
    setSlidesTemplateFile(null);
    setTemplateNote('');
    setAnalysisMode(null);
    setEditingTemplateId(fullTemplate.isDefault ? null : fullTemplate.id);
    if (paperTemplateInput.current) paperTemplateInput.current.value = '';
    if (slidesTemplateInput.current) slidesTemplateInput.current.value = '';
    window.requestAnimationFrame(() => templateEditor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function cancelTemplateEdit() {
    setTemplateDraft({ name: '', kind: 'both', description: '', instructions: '', blueprint: defaultTemplateBlueprint('both') });
    setPaperTemplateFile(null);
    setSlidesTemplateFile(null);
    setTemplateNote('');
    setAnalysisMode(null);
    setEditingTemplateId(null);
    if (paperTemplateInput.current) paperTemplateInput.current.value = '';
    if (slidesTemplateInput.current) slidesTemplateInput.current.value = '';
  }

  const customTemplates = templates.filter((template) => !template.isDefault);
  return <div className="settings-layout">
    <section className="settings-section">
      <div className="settings-title collapsible-title">
        <button type="button" className="settings-collapse-toggle" onClick={() => setShowModelSettings((value) => !value)} aria-expanded={showModelSettings}>
          {showModelSettings ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <KeyRound size={19} />
          <div><h2>模型服务</h2><span className={'source-status ' + (ai?.activeSource ?? 'local')}>{ai?.activeSource === 'personal' ? '个人接口已启用' : ai?.activeSource === 'platform' ? '平台接口' : '尚未连接模型'} · 点击展开配置</span></div>
        </button>
      </div>
      {showModelSettings ? <div className="settings-collapsible-body">
      <p className="settings-description">对话模型负责检索重排、论文、PPT、复习对话和模板识别；Embedding 服务负责知识库中文语义检索。两者可以使用不同服务商，密钥分别加密保存。</p>
      <div className="provider-pills">{MODEL_PROVIDERS.filter((provider) => provider.kind !== 'embedding').map((provider) => <button type="button" className={'provider-pill' + (matchProvider(baseURL)?.id === provider.id ? ' active' : '')} key={provider.id} onClick={() => { setBaseURL(provider.baseURL); if (provider.chatModels[0]) setChatModel(provider.chatModels[0]); if (provider.kind === 'both' && embeddingModel !== 'local-hash-v1') { setEmbeddingBaseURL(provider.baseURL); if (provider.embeddingModels[0]) setEmbeddingModel(provider.embeddingModels[0]); } }}>{provider.name}</button>)}</div>
      <p className="provider-links">{matchProvider(baseURL) ? <><a href={matchProvider(baseURL)!.keyUrl} target="_blank" rel="noreferrer">获取 {matchProvider(baseURL)!.name} API Key</a>{matchProvider(baseURL)!.docsUrl ? <> · <a href={matchProvider(baseURL)!.docsUrl} target="_blank" rel="noreferrer">接口说明</a></> : null}</> : <span>填写任意 OpenAI 兼容地址。常用入口：{MODEL_PROVIDERS.map((provider) => <a href={provider.keyUrl} target="_blank" rel="noreferrer" key={provider.id}>{provider.name}</a>)}</span>}</p>
      <form className="settings-form" onSubmit={saveAi}>
        <label><span>API Key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={ai?.hasPersonalKey ? '已加密保存，留空不会修改' : '填写服务商提供的 API Key'} /><small>仅加密保存在你的账户下，不会显示给其他用户。</small></label>
        <label><span>接口地址</span><input type="url" value={baseURL} onChange={(event) => updateBaseURL(event.target.value)} placeholder="https://open.bigmodel.cn/api/paas/v4" required /><small>{isDeepSeekBaseUrl(baseURL) ? '已识别为 DeepSeek 对话接口；下方可独立配置中文 Embedding。' : 'OpenAI 或其他兼容服务的 API 根地址，必须使用 HTTPS。'}</small></label>
        <div className="settings-grid">
          <label><span>对话模型</span><input value={chatModel} onChange={(event) => setChatModel(event.target.value)} placeholder="glm-5.3-flash" required /><small>用于生成论文、PPT 和识别模板，请填写服务商实际支持的模型名。</small></label>
          <div className="embedding-setting"><span>知识库检索模式</span><div className="segmented-control settings-segmented" aria-label="知识库向量方式"><button type="button" className={embeddingModel !== 'local-hash-v1' ? 'active' : ''} onClick={() => selectEmbeddingMode('provider')}>中文语义（推荐）</button><button type="button" className={embeddingModel === 'local-hash-v1' ? 'active' : ''} onClick={() => selectEmbeddingMode('local')}>无向量服务</button></div>{embeddingModel === 'local-hash-v1' ? <small>仅使用严格关键词检索；哈希向量不会单独进入证据池，准确性优先但召回较少。</small> : <small>使用独立 Embedding 接口生成中文语义向量，维度按模型实际返回值存储，换模型后请重新上传资料。</small>}</div>
        </div>
        {embeddingModel !== 'local-hash-v1' ? <div className="embedding-provider-panel"><div className="provider-pills">{MODEL_PROVIDERS.filter((provider) => provider.kind !== 'chat').map((provider) => <button type="button" className={'provider-pill' + (matchProvider(embeddingBaseURL)?.id === provider.id ? ' active' : '')} key={'emb-' + provider.id} onClick={() => { setEmbeddingBaseURL(provider.baseURL); if (provider.embeddingModels[0]) setEmbeddingModel(provider.embeddingModels[0]); }}>{provider.name}</button>)}</div><p className="provider-links">{matchProvider(embeddingBaseURL) ? <a href={matchProvider(embeddingBaseURL)!.keyUrl} target="_blank" rel="noreferrer">获取 {matchProvider(embeddingBaseURL)!.name} Embedding Key</a> : null}</p><label><span>Embedding API Key</span><input type="password" autoComplete="off" value={embeddingApiKey} onChange={(event) => setEmbeddingApiKey(event.target.value)} placeholder={ai?.hasEmbeddingKey ? '已加密保存，留空不会修改' : '填写向量服务的 API Key'} /><small>{embeddingRequirement(embeddingBaseURL, embeddingModel)}</small></label><div className="settings-grid"><label><span>Embedding 接口地址</span><input type="url" value={embeddingBaseURL} onChange={(event) => setEmbeddingBaseURL(event.target.value)} required /></label><label><span>Embedding 模型</span><input value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)} required /></label></div></div> : null}
        <div className="settings-actions"><button className="button primary" disabled={savingAi}>{savingAi ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}保存配置</button>{ai?.hasPersonalKey ? <button type="button" className="button secondary danger-text" onClick={() => void removeAi()}>删除个人 Key</button> : null}</div>
      </form>
      </div> : null}
    </section>

    <section className="settings-section">
      <div className="settings-title"><FileText size={19} /><div><h2>输出模板</h2><span>{templates.filter((template) => template.isDefault).length} 个内置 · {customTemplates.length} 个自定义</span></div></div>
      <p className="settings-description">可以分别上传论文样式（Word/PDF）和 PPT 样式（PPTX）。系统只提取版式、结构和视觉规则，不会把参考文件的主题内容混进论文。</p>
      <form className="settings-form template-form" onSubmit={saveTemplate}>
        <div className="template-source-grid">
          <input ref={paperTemplateInput} type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => { setPaperTemplateFile(event.target.files?.[0] ?? null); setAnalysisMode(null); }} />
          <input ref={slidesTemplateInput} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden onChange={(event) => { setSlidesTemplateFile(event.target.files?.[0] ?? null); setAnalysisMode(null); }} />
          <button className={'template-upload ' + (paperTemplateFile ? 'has-file' : '')} type="button" onClick={() => paperTemplateInput.current?.click()}>
            {paperTemplateFile ? <Check size={20} /> : <FileText size={20} />}
            <span><strong>{paperTemplateFile ? paperTemplateFile.name : '上传论文模板'}</strong><small>{paperTemplateFile ? formatBytes(paperTemplateFile.size) : 'DOCX 或可搜索 PDF，不限制大小'}</small></span>
          </button>
          <button className={'template-upload ' + (slidesTemplateFile ? 'has-file' : '')} type="button" onClick={() => slidesTemplateInput.current?.click()}>
            {slidesTemplateFile ? <Check size={20} /> : <Presentation size={20} />}
            <span><strong>{slidesTemplateFile ? slidesTemplateFile.name : '上传 PPT 模板'}</strong><small>{slidesTemplateFile ? formatBytes(slidesTemplateFile.size) : 'PPTX 版式、配色和页结构'}</small></span>
          </button>
          <label className="template-note"><span>补充要求</span><textarea value={templateNote} onChange={(event) => { setTemplateNote(event.target.value); setAnalysisMode(null); }} placeholder="例如：正文约 8000 字，三级标题；PPT 按学校模板 18 页，并保留答辩备注。也可以不上传文件，只在这里描述。" maxLength={50000} /></label>
        </div>
        <div className="settings-actions analyze-actions"><button type="button" className="button secondary" disabled={analyzingTemplate} onClick={() => void analyzeTemplate()}>{analyzingTemplate ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{analyzingTemplate ? '正在识别' : '智能提取规则'}</button>{analysisMode ? <span className="analysis-status"><Check size={14} />{analysisMode === 'ai' ? 'AI 已完成提炼' : '已提取原始要求'}</span> : null}</div>

        <div className="template-editor" ref={templateEditor}>
          <div className="template-identity">
            <div className="template-identity-copy"><span>模板工作台</span><strong>先定结构，再写要求</strong><small>下面的章节、页面和样式都可以直接编辑，保存后会成为后续任务的生成规则。</small></div>
            <div className="settings-grid"><label><span>模板名称</span><input value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} placeholder="例如：本科毕业论文" required /></label><label><span>适用内容</span><select value={templateDraft.kind} onChange={(event) => { const kind = event.target.value as TemplateKind; setTemplateDraft({ ...templateDraft, kind, blueprint: templateDraft.blueprint.sections.length || templateDraft.blueprint.slides.length ? templateDraft.blueprint : defaultTemplateBlueprint(kind) }); }}><option value="both">论文与 PPT</option><option value="report">仅论文/报告</option><option value="presentation">仅 PPT</option></select></label><label className="template-description-field"><span>用途说明</span><input value={templateDraft.description} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} placeholder="这套模板适合什么任务" /></label></div>
          </div>
          <TemplateBlueprintEditor value={templateDraft.blueprint} templateId={editingTemplateId ?? undefined} onChange={(blueprint) => setTemplateDraft((current) => ({ ...current, blueprint, instructions: blueprintToInstructions(blueprint) }))} />
          <div className="advanced-template">
            <button type="button" className="advanced-toggle" onClick={() => setShowAdvancedTemplate((current) => !current)}>{showAdvancedTemplate ? <ChevronDown size={15} /> : <ChevronRight size={15} />}高级：查看或编辑完整生成规则</button>
            {showAdvancedTemplate ? <label><span>完整生成规则</span><textarea value={templateDraft.instructions} onChange={(event) => setTemplateDraft({ ...templateDraft, instructions: event.target.value })} placeholder="结构化编辑器会自动生成规则；也可以在这里补充额外约束。" minLength={8} maxLength={100000} required /></label> : <p>结构化编辑会自动生成规则，通常不需要手动修改文本。</p>}
          </div>
        </div>
        <div className="settings-actions template-save-actions"><button className="button primary" disabled={savingTemplate || !templateDraft.name.trim() || templateDraft.instructions.trim().length < 8}>{savingTemplate ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}{editingTemplateId ? '保存修改' : '保存为模板'}</button>{editingTemplateId ? <button className="button secondary" type="button" onClick={cancelTemplateEdit}>取消编辑</button> : null}<span className="template-rule-count">{templateDraft.blueprint.sections.length} 个章节 · {templateDraft.blueprint.slides.length} 个 PPT 页面</span></div>
      </form>
      <div className="template-list">{templates.map((template) => <div className={'template-row ' + (editingTemplateId === template.id ? 'editing' : '')} key={template.id}><div><strong>{template.name}</strong><span>{template.kind === 'both' ? '论文与 PPT' : template.kind === 'report' ? '论文/报告' : 'PPT'}{template.blueprint ? ` · ${template.blueprint.sections.length} 章 / ${template.blueprint.slides.length} 页 PPT` : ''}{template.paperSourceName ? ` · 论文 ${template.paperSourceName}` : ''}{template.slidesSourceName ? ` · PPT ${template.slidesSourceName}` : ''}{template.description ? ` · ${template.description}` : ''}</span></div><div className="template-row-actions">{template.isDefault ? <span className="default-label">内置</span> : null}<button className="icon-button" type="button" onClick={() => void editTemplate(template)} title={template.isDefault ? '复制为自定义模板' : '编辑模板'} aria-label={(template.isDefault ? '复制并编辑 ' : '编辑 ') + template.name}><Pencil size={15} /></button>{!template.isDefault ? <button className="icon-button danger" type="button" onClick={() => void removeTemplate(template.id)} title="删除模板" aria-label={'删除 ' + template.name}><Trash2 size={15} /></button> : null}</div></div>)}</div>
    </section>
  </div>;
}
