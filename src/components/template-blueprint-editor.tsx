'use client';

import { ArrowDown, ArrowUp, FileText, GripVertical, Plus, Presentation, Trash2 } from 'lucide-react';

import type {
  TemplateBlueprint,
  TemplateSectionBlueprint,
  TemplateSlideBlueprint,
} from '@/types/platform';

const slideLayouts: Array<{ value: TemplateSlideBlueprint['layout']; label: string }> = [
  { value: 'title', label: '封面' },
  { value: 'thesis', label: '核心观点' },
  { value: 'landscape', label: '背景/全景' },
  { value: 'comparison', label: '对比' },
  { value: 'evidence', label: '证据' },
  { value: 'roadmap', label: '路线图' },
  { value: 'conclusion', label: '结论' },
];

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function TemplateBlueprintEditor({
  value,
  onChange,
}: {
  value: TemplateBlueprint;
  onChange: (value: TemplateBlueprint) => void;
}) {
  function updateSection(index: number, patch: Partial<TemplateSectionBlueprint>) {
    onChange({
      ...value,
      sections: value.sections.map((section, current) => current === index ? { ...section, ...patch } : section),
    });
  }

  function updateSlide(index: number, patch: Partial<TemplateSlideBlueprint>) {
    onChange({
      ...value,
      slides: value.slides.map((slide, current) => current === index ? { ...slide, ...patch } : slide),
    });
  }

  return (
    <div className="blueprint-editor">
      <section className="blueprint-panel">
        <header className="blueprint-heading">
          <div><span className="blueprint-icon"><FileText size={17} /></span><div><strong>论文 / 报告结构</strong><small>使用上下箭头调整顺序，生成时会按这里的章节组织内容</small></div></div>
          <button type="button" className="blueprint-add" onClick={() => onChange({ ...value, sections: [...value.sections, { id: nextId('section'), title: '新章节', purpose: '说明这一章要回答的问题' }] })}><Plus size={14} />添加章节</button>
        </header>
        {value.sections.length ? <div className="blueprint-list">
          {value.sections.map((section, index) => <article className="blueprint-row" key={section.id}>
            <div className="blueprint-order"><GripVertical size={14} /><span>{String(index + 1).padStart(2, '0')}</span></div>
            <div className="blueprint-fields">
              <input value={section.title} onChange={(event) => updateSection(index, { title: event.target.value })} aria-label={`第 ${index + 1} 章标题`} />
              <input className="blueprint-purpose" value={section.purpose} onChange={(event) => updateSection(index, { purpose: event.target.value })} placeholder="这一章要说明什么" aria-label={`第 ${index + 1} 章说明`} />
            </div>
            <div className="blueprint-actions">
              <button type="button" onClick={() => onChange({ ...value, sections: moveItem(value.sections, index, -1) })} disabled={index === 0} aria-label="上移章节"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => onChange({ ...value, sections: moveItem(value.sections, index, 1) })} disabled={index === value.sections.length - 1} aria-label="下移章节"><ArrowDown size={14} /></button>
              <button type="button" className="danger" onClick={() => onChange({ ...value, sections: value.sections.filter((_, current) => current !== index) })} aria-label="删除章节"><Trash2 size={14} /></button>
            </div>
          </article>)}
        </div> : <div className="blueprint-empty">当前模板只生成 PPT。需要论文结构时添加章节即可。</div>}
      </section>

      <section className="blueprint-panel">
        <header className="blueprint-heading">
          <div><span className="blueprint-icon coral"><Presentation size={17} /></span><div><strong>PPT 页面结构</strong><small>页面类型决定版式，标题和目的决定这一页讲什么</small></div></div>
          <button type="button" className="blueprint-add" onClick={() => onChange({ ...value, slides: [...value.slides, { id: nextId('slide'), title: '新页面', purpose: '一页只表达一个中心观点', layout: 'landscape' }] })}><Plus size={14} />添加页面</button>
        </header>
        {value.slides.length ? <div className="blueprint-list">
          {value.slides.map((slide, index) => <article className="blueprint-row slide" key={slide.id}>
            <div className="blueprint-order"><GripVertical size={14} /><span>{String(index + 1).padStart(2, '0')}</span></div>
            <div className="blueprint-fields">
              <div className="blueprint-slide-line"><input value={slide.title} onChange={(event) => updateSlide(index, { title: event.target.value })} aria-label={`第 ${index + 1} 页标题`} /><select value={slide.layout} onChange={(event) => updateSlide(index, { layout: event.target.value as TemplateSlideBlueprint['layout'] })} aria-label={`第 ${index + 1} 页版式`}>{slideLayouts.map((layout) => <option value={layout.value} key={layout.value}>{layout.label}</option>)}</select></div>
              <input className="blueprint-purpose" value={slide.purpose} onChange={(event) => updateSlide(index, { purpose: event.target.value })} placeholder="这一页要表达什么" aria-label={`第 ${index + 1} 页说明`} />
            </div>
            <div className="blueprint-actions">
              <button type="button" onClick={() => onChange({ ...value, slides: moveItem(value.slides, index, -1) })} disabled={index === 0} aria-label="上移页面"><ArrowUp size={14} /></button>
              <button type="button" onClick={() => onChange({ ...value, slides: moveItem(value.slides, index, 1) })} disabled={index === value.slides.length - 1} aria-label="下移页面"><ArrowDown size={14} /></button>
              <button type="button" className="danger" onClick={() => onChange({ ...value, slides: value.slides.filter((_, current) => current !== index) })} aria-label="删除页面"><Trash2 size={14} /></button>
            </div>
          </article>)}
        </div> : <div className="blueprint-empty">当前模板只生成论文。需要汇报材料时添加幻灯片页面。</div>}
      </section>

      <section className="blueprint-panel style-panel">
        <header className="blueprint-heading"><div><span className="blueprint-icon gold"><SparkleIcon /></span><div><strong>版式与输出规则</strong><small>这些规则会直接进入生成提示词</small></div></div></header>
        <div className="blueprint-style-grid">
          <label><span>引用格式</span><input value={value.style.citationStyle} onChange={(event) => onChange({ ...value, style: { ...value.style, citationStyle: event.target.value } })} placeholder="例如：作者-年份，正文标证据编号" /></label>
          <label><span>标题层级</span><select value={value.style.headingScheme} onChange={(event) => onChange({ ...value, style: { ...value.style, headingScheme: event.target.value as TemplateBlueprint['style']['headingScheme'] } })}><option value="numeric">1 / 1.1 / 1.1.1</option><option value="chinese">一 / （一） / 1.</option><option value="plain">不强制编号</option></select></label>
          <label><span>报告目标字数</span><input type="number" min={100} max={200000} value={value.style.reportWords ?? ''} onChange={(event) => onChange({ ...value, style: { ...value.style, reportWords: event.target.value ? Number(event.target.value) : undefined } })} placeholder="例如 8000" /></label>
          <label><span>PPT 目标页数</span><input type="number" min={1} max={64} value={value.style.slideCount ?? ''} onChange={(event) => onChange({ ...value, style: { ...value.style, slideCount: event.target.value ? Number(event.target.value) : undefined } })} placeholder="例如 12" /></label>
          <label><span>表达语气</span><input value={value.style.tone} onChange={(event) => onChange({ ...value, style: { ...value.style, tone: event.target.value } })} placeholder="清晰、严谨、可执行" /></label>
          <label><span>字体</span><input value={value.style.fontFamily} onChange={(event) => onChange({ ...value, style: { ...value.style, fontFamily: event.target.value } })} placeholder="系统默认 / 思源黑体" /></label>
          <label className="color-field"><span>主色</span><div><input type="color" value={value.style.accentColor} onChange={(event) => onChange({ ...value, style: { ...value.style, accentColor: event.target.value } })} /><input value={value.style.accentColor} onChange={(event) => onChange({ ...value, style: { ...value.style, accentColor: event.target.value } })} /></div></label>
        </div>
      </section>
    </div>
  );
}

function SparkleIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
}
