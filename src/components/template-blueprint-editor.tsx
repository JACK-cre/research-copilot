'use client';

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileText, GripVertical, Plus, Presentation, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PptxSlideCanvas } from '@/components/pptx-slide-canvas';
import { DocumentPagePreviewPanel } from '@/components/document-page-preview';

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
  templateId,
}: {
  value: TemplateBlueprint;
  onChange: (value: TemplateBlueprint) => void;
  templateId?: string;
}) {
  const [showStructure, setShowStructure] = useState(false);
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
      {value.slides.some((slide) => slide.elements?.length) ? <section className="blueprint-panel visual-preview-panel">
        <header className="blueprint-heading">
          <div><span className="blueprint-icon coral"><Presentation size={17} /></span><div><strong>上传页面预览</strong><small>按 PPTX 的页面坐标和元素还原，点击元素可调整文字、颜色和位置</small></div></div>
        </header>
        <PptxSlideCanvas
          slides={value.slides}
          selectedSlideIndex={0}
          onSelectSlide={() => undefined}
          onChangeSlide={(index, slide) => onChange({
            ...value,
            slides: value.slides.map((current, currentIndex) => currentIndex === index ? slide : current),
          })}
          onReorderSlides={(slides) => onChange({ ...value, slides })}
          templateId={templateId}
          slideWidth={value.style.slideWidth}
          slideHeight={value.style.slideHeight}
        />
        {value.slides.length ? <div className="template-page-roles">{value.slides.map((slide, index) => <span key={slide.id}><b>{index + 1}</b>{slide.layout === 'title' ? '封面' : slide.layout === 'thesis' ? '核心观点' : slide.layout === 'comparison' ? '对比' : slide.layout === 'evidence' ? '证据' : slide.layout === 'roadmap' ? '路线图' : slide.layout === 'conclusion' ? '结论' : '内容页'}</span>)}</div> : null}
      </section> : null}
      {value.documentPages?.length ? <DocumentPagePreviewPanel pages={value.documentPages} /> : null}
      <button type="button" className="structure-toggle" onClick={() => setShowStructure((current) => !current)}>{showStructure ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>编辑结构与页面顺序</span><small>默认不展开，模板预览才是主要内容</small></button>
      {showStructure && value.documentPages?.length && !value.sections.length ? <section className="blueprint-panel">
        <header className="blueprint-heading">
          <div><span className="blueprint-icon"><FileText size={17} /></span><div><strong>论文 / 报告结构</strong><small>AI 将从版式中归纳章节层级；需要手动调整时也可以添加</small></div></div>
          <button type="button" className="blueprint-add" onClick={() => onChange({ ...value, sections: [{ id: nextId('section'), title: '新章节', purpose: '说明这一章要回答的问题' }] })}><Plus size={14} />添加章节</button>
        </header>
        <div className="blueprint-empty">未从模板中提取到可靠的章节标题。可以补充说明，或手动添加章节。</div>
      </section> : null}
      {showStructure && value.sections.length ? <section className="blueprint-panel">
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
        </div> : null}
      </section> : null}

      {showStructure && !value.slides.some((slide) => slide.elements?.length) ? <section className="blueprint-panel">
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
      </section> : null}

      <section className="blueprint-panel style-panel">
        <header className="blueprint-heading"><div><span className="blueprint-icon gold"><SparkleIcon /></span><div><strong>内容偏好</strong><small>用直观选项描述你希望生成成什么样，详细要求可以写在下方的补充说明里</small></div></div></header>
        <div className="template-preference-grid">
          <div className="preference-card">
            <span>内容详略</span>
            <div className="preference-options">
              {[
                ['简洁', 3000, 8],
                ['适中', 6000, 12],
                ['详细', 10000, 18],
                ['完整', 16000, 24],
              ].map(([label, words, slides]) => {
                const active = (value.style.reportWords ?? 0) === words || (value.style.slideCount ?? 0) === slides;
                return <button type="button" className={active ? 'active' : ''} key={String(label)} onClick={() => onChange({ ...value, style: { ...value.style, reportWords: Number(words), slideCount: Number(slides) } })}>{label}</button>;
              })}
            </div>
          </div>
          <div className="preference-card">
            <span>表达风格</span>
            <div className="preference-options">
              {['学术严谨', '清晰务实', '简洁直接', '生动易懂'].map((tone) => <button type="button" className={value.style.tone === tone ? 'active' : ''} key={tone} onClick={() => onChange({ ...value, style: { ...value.style, tone } })}>{tone}</button>)}
            </div>
          </div>
          <div className="preference-card">
            <span>引用呈现</span>
            <div className="preference-options">
              {['正文编号', '作者-年份', '脚注式说明', '按上传模板'].map((citationStyle) => <button type="button" className={value.style.citationStyle === citationStyle ? 'active' : ''} key={citationStyle} onClick={() => onChange({ ...value, style: { ...value.style, citationStyle } })}>{citationStyle}</button>)}
            </div>
          </div>
          <div className="preference-card">
            <span>主色氛围</span>
            <div className="color-swatches">
              {['#0F766E', '#1F4E79', '#7C3AED', '#C45D40', '#475569'].map((accentColor) => <button type="button" aria-label={'选择主色 ' + accentColor} className={value.style.accentColor.toLowerCase() === accentColor.toLowerCase() ? 'active' : ''} style={{ background: accentColor }} key={accentColor} onClick={() => onChange({ ...value, style: { ...value.style, accentColor } })} />)}
            </div>
          </div>
        </div>
        <label className="template-preference-note"><span>补充说明（可选）</span><textarea value={value.style.notes ?? ''} onChange={(event) => onChange({ ...value, style: { ...value.style, notes: event.target.value } })} placeholder="例如：每页保留讲稿备注；正文不要太多小标题；论文最后列出参考文献。" /></label>
      </section>
    </div>
  );
}

function SparkleIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
}
