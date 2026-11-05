'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export const RESEARCH_LAYOUT_KEY = 'research-copilot.research.layout';

export interface ResearchLayout {
  briefWidth: number;
  evidenceWidth: number;
  metaHeight: number | null;
}

export const DEFAULT_RESEARCH_LAYOUT: ResearchLayout = {
  briefWidth: 320,
  evidenceWidth: 300,
  metaHeight: null,
};

export const LAYOUT_LIMITS = {
  briefMin: 220,
  briefMax: 520,
  evidenceMin: 200,
  evidenceMax: 480,
  middleMin: 380,
  metaMin: 92,
  outputMin: 180,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseResearchLayout(raw: string | null): ResearchLayout {
  if (!raw) return DEFAULT_RESEARCH_LAYOUT;
  try {
    const parsed = JSON.parse(raw) as Partial<ResearchLayout>;
    return {
      briefWidth: clamp(Number(parsed.briefWidth) || DEFAULT_RESEARCH_LAYOUT.briefWidth, LAYOUT_LIMITS.briefMin, LAYOUT_LIMITS.briefMax),
      evidenceWidth: clamp(Number(parsed.evidenceWidth) || DEFAULT_RESEARCH_LAYOUT.evidenceWidth, LAYOUT_LIMITS.evidenceMin, LAYOUT_LIMITS.evidenceMax),
      metaHeight: parsed.metaHeight == null || Number.isNaN(Number(parsed.metaHeight))
        ? null
        : clamp(Number(parsed.metaHeight), LAYOUT_LIMITS.metaMin, 720),
    };
  } catch {
    return DEFAULT_RESEARCH_LAYOUT;
  }
}

export function useResearchLayout() {
  const [layout, setLayout] = useState<ResearchLayout>(DEFAULT_RESEARCH_LAYOUT);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    setLayout(parseResearchLayout(window.localStorage.getItem(RESEARCH_LAYOUT_KEY)));
  }, []);

  const persist = useCallback((next: ResearchLayout) => {
    layoutRef.current = next;
    setLayout(next);
    window.localStorage.setItem(RESEARCH_LAYOUT_KEY, JSON.stringify(next));
  }, []);

  const update = useCallback((patch: Partial<ResearchLayout>) => {
    persist({ ...layoutRef.current, ...patch });
  }, [persist]);

  return { layout, layoutRef, update, persist };
}

export function ResizeHandle({
  orientation,
  label,
  className,
  value,
  min,
  max,
  onDrag,
  onReset,
}: {
  orientation: 'horizontal' | 'vertical';
  label: string;
  className?: string;
  value?: number;
  min?: number;
  max?: number;
  onDrag: (delta: number) => void;
  onReset?: () => void;
}) {
  const last = useRef(0);
  const [dragging, setDragging] = useState(false);

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove('resizing-columns', 'resizing-rows');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={`${label}，双击还原`}
      className={['resize-handle', orientation, dragging ? 'dragging' : '', className].filter(Boolean).join(' ')}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        last.current = orientation === 'horizontal' ? event.clientX : event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.classList.add(orientation === 'horizontal' ? 'resizing-columns' : 'resizing-rows');
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const current = orientation === 'horizontal' ? event.clientX : event.clientY;
        const delta = current - last.current;
        if (!delta) return;
        last.current = current;
        onDrag(delta);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 36 : 16;
        if (orientation === 'horizontal' && event.key === 'ArrowLeft') {
          event.preventDefault();
          onDrag(-step);
        }
        if (orientation === 'horizontal' && event.key === 'ArrowRight') {
          event.preventDefault();
          onDrag(step);
        }
        if (orientation === 'vertical' && event.key === 'ArrowUp') {
          event.preventDefault();
          onDrag(-step);
        }
        if (orientation === 'vertical' && event.key === 'ArrowDown') {
          event.preventDefault();
          onDrag(step);
        }
        if (event.key === 'Home' || event.key === 'Escape') {
          event.preventDefault();
          onReset?.();
        }
      }}
    />
  );
}
