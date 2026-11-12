'use client';

import { ChevronLeft, ChevronRight, Expand, Eye, EyeOff, Layers3, Minimize2, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { TemplateSlideBlueprint, TemplateSlideElement } from '@/types/platform';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function imageUrl(element: TemplateSlideElement, templateId?: string): string | undefined {
  if (element.imageDataUrl) return element.imageDataUrl;
  if (element.imageStoragePath && templateId) return `/api/templates/${templateId}/visual/${encodeURIComponent(element.id)}`;
  return undefined;
}

function withOpacity(color: string | undefined, opacity: number | undefined): string | undefined {
  if (!color) return undefined;
  if (opacity === undefined || opacity >= 1) return color;
  const hex = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
  return `#${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

function styleFor(element: TemplateSlideElement, slideWidth: number, slideHeight: number): React.CSSProperties {
  const border = element.stroke && element.stroke !== '#FFFFFF'
    ? `1px solid ${withOpacity(element.stroke, element.strokeOpacity)}`
    : undefined;
  return {
    left: `${element.x / slideWidth * 100}%`,
    top: `${element.y / slideHeight * 100}%`,
    width: `${element.width / slideWidth * 100}%`,
    height: `${element.height / slideHeight * 100}%`,
    zIndex: element.zIndex,
    color: element.color,
    background: element.type === 'image' ? undefined : withOpacity(element.fill, element.fillOpacity),
    border,
    borderRadius: element.shape === 'roundRect' ? 12 : element.shape === 'ellipse' ? '50%' : undefined,
    fontFamily: element.fontFamily,
    fontSize: element.fontSize ? `${element.fontSize / slideWidth * 100}cqw` : '1.7cqw',
    fontWeight: element.fontWeight,
    textAlign: element.align,
    display: element.type === 'text' ? 'flex' : undefined,
    flexDirection: element.type === 'text' ? 'column' : undefined,
    justifyContent: element.type === 'text'
      ? element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'
      : undefined,
    objectFit: 'contain',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    lineHeight: 1.2,
    padding: element.type === 'text' ? '0.6% 0.8%' : undefined,
  };
}

export function PptxSlideCanvas({
  slides,
  selectedSlideIndex,
  onSelectSlide,
  onChangeSlide,
  onReorderSlides,
  templateId,
  slideWidth = 960,
  slideHeight = 540,
}: {
  slides: TemplateSlideBlueprint[];
  selectedSlideIndex: number;
  onSelectSlide: (index: number) => void;
  onChangeSlide: (index: number, slide: TemplateSlideBlueprint) => void;
  onReorderSlides?: (slides: TemplateSlideBlueprint[]) => void;
  templateId?: string;
  slideWidth?: number;
  slideHeight?: number;
}) {
  const [internalSlideIndex, setInternalSlideIndex] = useState(selectedSlideIndex);
  const activeSlideIndex = Math.min(Math.max(0, internalSlideIndex), Math.max(0, slides.length - 1));
  const selected = slides[activeSlideIndex];
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const elements = useMemo(() => selected?.elements ?? [], [selected]);
  const selectedElement = elements.find((element) => element.id === selectedElementId);

  useEffect(() => {
    setInternalSlideIndex(selectedSlideIndex);
  }, [selectedSlideIndex]);

  useEffect(() => {
    setSelectedElementId(null);
  }, [activeSlideIndex]);

  function selectSlide(index: number) {
    setInternalSlideIndex(index);
    onSelectSlide(index);
  }

  function updateElement(patch: Partial<TemplateSlideElement>) {
    if (!selected || !selectedElement) return;
    onChangeSlide(activeSlideIndex, {
      ...selected,
      elements: elements.map((element) => element.id === selectedElement.id ? { ...element, ...patch } : element),
    });
  }

  const dragRef = useRef<{
    elementId: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  function beginDrag(event: React.PointerEvent, element: TemplateSlideElement, mode: 'move' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    const canvas = (event.currentTarget as HTMLElement).closest('.visual-canvas') as HTMLElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      elementId: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
      scaleX: slideWidth / rect.width,
      scaleY: slideHeight / rect.height,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function continueDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !selected) return;
    const dx = (event.clientX - drag.startX) * drag.scaleX;
    const dy = (event.clientY - drag.startY) * drag.scaleY;
    const element = elements.find((item) => item.id === drag.elementId);
    if (!element) return;
    onChangeSlide(activeSlideIndex, {
      ...selected,
      elements: elements.map((item) => item.id === drag.elementId
        ? drag.mode === 'move'
          ? { ...item, x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) }
          : { ...item, width: Math.max(20, Math.round(drag.originWidth + dx)), height: Math.max(16, Math.round(drag.originHeight + dy)) }
        : item),
    });
  }

  function endDrag() {
    dragRef.current = null;
  }

  function nudgeElement(event: React.KeyboardEvent) {
    if (!selectedElement) return;
    const amount = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') updateElement({ x: selectedElement.x - amount });
    else if (event.key === 'ArrowRight') updateElement({ x: selectedElement.x + amount });
    else if (event.key === 'ArrowUp') updateElement({ y: selectedElement.y - amount });
    else if (event.key === 'ArrowDown') updateElement({ y: selectedElement.y + amount });
    else return;
    event.preventDefault();
  }

  function moveSlide(direction: -1 | 1) {
    const target = activeSlideIndex + direction;
    if (!selected || target < 0 || target >= slides.length) return;
    const reordered = slides.slice();
    [reordered[activeSlideIndex], reordered[target]] = [reordered[target], reordered[activeSlideIndex]];
    if (onReorderSlides) onReorderSlides(reordered);
    setInternalSlideIndex(target);
    onSelectSlide(target);
  }

  return (
    <div className={'visual-slide-editor' + (fullscreen ? ' fullscreen' : '')}>
      <aside className="visual-slide-rail">
        <div className="visual-rail-heading"><Layers3 size={15} /><span>页面</span><small>{slides.length}</small></div>
        <div className="visual-slide-thumbs">
          {slides.map((slide, index) => <button
            type="button"
            className={'visual-slide-thumb' + (index === activeSlideIndex ? ' active' : '')}
            key={slide.id}
            onClick={() => selectSlide(index)}
            title={slide.title}
          >
            <span className="visual-thumb-canvas" style={{ background: slide.background || '#fff' }}>
              {(slide.elements ?? []).slice(0, 20).map((element) => {
                const placement = {
                  left: `${element.x / slideWidth * 100}%`,
                  top: `${element.y / slideHeight * 100}%`,
                  width: `${element.width / slideWidth * 100}%`,
                  height: `${element.height / slideHeight * 100}%`,
                  zIndex: element.zIndex,
                };
                if (element.type === 'image' && imageUrl(element, templateId)) {
                  return <img key={element.id} className="visual-thumb-media" src={imageUrl(element, templateId)} alt="" style={placement} />;
                }
                return <span
                  key={element.id}
                  className={'visual-thumb-element ' + element.type}
                  style={{
                    ...placement,
                    background: element.type === 'text' ? undefined : element.fill,
                    color: element.color,
                    borderRadius: element.shape === 'ellipse' ? '50%' : element.shape === 'roundRect' ? 4 : undefined,
                  }}
                />;
              })}
              {(slide.elements ?? []).some((element) => element.type === 'image') ? <span className="visual-thumb-image"><Eye size={13} /></span> : null}
            </span>
            <small><span>{String(index + 1).padStart(2, '0')}</span>{slide.title}</small>
          </button>)}
        </div>
      </aside>

      <section className="visual-slide-main">
        {selected ? <>
          <header className="visual-slide-toolbar">
            <div className="visual-slide-title"><input value={selected.title} onChange={(event) => onChangeSlide(activeSlideIndex, { ...selected, title: event.target.value })} aria-label="页面标题" /><small>第 {activeSlideIndex + 1} / {slides.length} 页 · {elements.length} 个元素</small></div>
            <div className="visual-page-actions">
              <button type="button" disabled={activeSlideIndex === 0} onClick={() => selectSlide(activeSlideIndex - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
              <button type="button" disabled={activeSlideIndex === slides.length - 1} onClick={() => selectSlide(activeSlideIndex + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
              <button type="button" onClick={() => moveSlide(-1)} disabled={activeSlideIndex === 0} title="上移页面">↑</button>
              <button type="button" onClick={() => moveSlide(1)} disabled={activeSlideIndex === slides.length - 1} title="下移页面">↓</button>
              <button type="button" onClick={() => setShowLayers((value) => !value)} title={showLayers ? '隐藏元素列表' : '显示元素列表'}>{showLayers ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              <button type="button" onClick={() => setFullscreen((value) => !value)} title={fullscreen ? '退出放大编辑' : '放大编辑'}>{fullscreen ? <Minimize2 size={15} /> : <Expand size={15} />}</button>
            </div>
          </header>
          <div className={'visual-slide-stage ' + (showLayers ? 'with-layers' : '')}>
            <div className="visual-canvas-frame">
              <div
                className="visual-canvas"
                style={{
                  containerType: 'inline-size',
                  aspectRatio: `${slideWidth} / ${slideHeight}`,
                  background: selected.background || '#fff',
                }}
                onClick={() => setSelectedElementId(null)}
              >
                {elements.slice().sort((left, right) => left.zIndex - right.zIndex).map((element) => {
                  if (element.type === 'image' && imageUrl(element, templateId)) {
                    return <div
                      key={element.id}
                      className={'visual-element image' + (selectedElementId === element.id ? ' selected' : '')}
                      style={{ ...styleFor(element, slideWidth, slideHeight), background: selected.background || '#FFFFFF' }}
                      onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }}
                      onPointerDown={(event) => beginDrag(event, element, 'move')}
                      onPointerMove={continueDrag}
                      onPointerUp={endDrag}
                      onKeyDown={nudgeElement}
                      tabIndex={0}
                    ><img src={imageUrl(element, templateId)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />{selectedElementId === element.id ? <span className="visual-resize-handle" onPointerDown={(event) => beginDrag(event, element, 'resize')} /> : null}</div>;
                  }
                  return <div
                    key={element.id}
                    className={'visual-element ' + element.type + (selectedElementId === element.id ? ' selected' : '')}
                    style={styleFor(element, slideWidth, slideHeight)}
                    onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }}
                    onPointerDown={(event) => beginDrag(event, element, 'move')}
                    onPointerMove={continueDrag}
                    onPointerUp={endDrag}
                    onKeyDown={nudgeElement}
                    tabIndex={0}
                  >{element.type === 'text' ? <span className="visual-text-content">{element.text}</span> : null}{selectedElementId === element.id ? <span className="visual-resize-handle" onPointerDown={(event) => beginDrag(event, element, 'resize')} /> : null}</div>;
                })}
              </div>
            </div>

            {showLayers ? <aside className="visual-layers">
              <div className="visual-layers-heading"><Type size={14} /><span>页面元素</span></div>
              <div className="visual-layer-list">{elements.slice().sort((left, right) => right.zIndex - left.zIndex).map((element) => <button
                type="button"
                className={'visual-layer ' + (selectedElementId === element.id ? 'active' : '')}
                key={element.id}
                onClick={() => setSelectedElementId(element.id)}
              ><span className={'layer-type ' + element.type}>{element.type === 'text' ? 'T' : element.type === 'image' ? '图' : '形'}</span><span>{element.text || (element.type === 'image' ? '图片' : '形状')}</span></button>)}</div>
              {selectedElement ? <div className="visual-element-form">
                <div className="visual-element-form-title"><span>编辑选中元素</span><small>{selectedElement.type === 'text' ? '文本' : selectedElement.type === 'image' ? '图片' : '形状'}</small></div>
                {selectedElement.type === 'text' ? <>
                  <label><span>文字</span><textarea value={selectedElement.text ?? ''} onChange={(event) => updateElement({ text: event.target.value })} /></label>
                  <div className="visual-form-grid">
                    <label><span>字号</span><input type="number" min={6} max={200} value={selectedElement.fontSize ?? 16} onChange={(event) => updateElement({ fontSize: clamp(Number(event.target.value) || 16, 6, 200) })} /></label>
                    <label><span>颜色</span><input type="color" value={selectedElement.color ?? '#1F2937'} onChange={(event) => updateElement({ color: event.target.value })} /></label>
                  </div>
                </> : null}
                <div className="visual-form-grid">
                  <label><span>X</span><input type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement({ x: clamp(Number(event.target.value) || 0, -100, 1000) })} /></label>
                  <label><span>Y</span><input type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement({ y: clamp(Number(event.target.value) || 0, -100, 700) })} /></label>
                  <label><span>宽</span><input type="number" value={Math.round(selectedElement.width)} onChange={(event) => updateElement({ width: clamp(Number(event.target.value) || 1, 1, 1200) })} /></label>
                  <label><span>高</span><input type="number" value={Math.round(selectedElement.height)} onChange={(event) => updateElement({ height: clamp(Number(event.target.value) || 1, 1, 800) })} /></label>
                </div>
              </div> : <div className="visual-element-hint">点击画布中的文字、图片或形状，在这里调整位置和样式。</div>}
              <div className="visual-background-control"><label><span>页面背景</span><input type="color" value={selected.background ?? '#FFFFFF'} onChange={(event) => onChangeSlide(activeSlideIndex, { ...selected, background: event.target.value })} /></label></div>
            </aside> : null}
          </div>
        </> : <div className="visual-empty">还没有可预览的页面。上传 PPTX 后会自动提取页面。</div>}
      </section>
    </div>
  );
}
