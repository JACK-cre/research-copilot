import type { ResearchResult } from '@/types/research';

export interface ResearchDiff {
  titleChanged: boolean;
  thesisChanged: boolean;
  sectionsAdded: string[];
  sectionsRemoved: string[];
  sectionsChanged: string[];
  slidesAdded: string[];
  slidesRemoved: string[];
  slidesChanged: string[];
  evidenceAdded: string[];
  evidenceRemoved: string[];
  sectionDetails: Array<{ title: string; status: 'added' | 'removed' | 'changed'; before?: string; after?: string }>;
  slideDetails: Array<{ title: string; status: 'added' | 'removed' | 'changed'; before?: string; after?: string }>;
  evidenceChanged: string[];
}

function diffNamed(before: Array<{title:string}>, after: Array<{title:string}>, serialize: (item: unknown) => string) {
  const oldMap = new Map(before.map(item => [item.title, serialize(item)]));
  const newMap = new Map(after.map(item => [item.title, serialize(item)]));
  return {
    added: [...newMap.keys()].filter(title => !oldMap.has(title)),
    removed: [...oldMap.keys()].filter(title => !newMap.has(title)),
    changed: [...newMap.keys()].filter(title => oldMap.has(title) && oldMap.get(title) !== newMap.get(title)),
  };
}

function detailNamed<T extends { title: string }>(before: T[], after: T[], serialize: (item: T) => string) {
  const oldMap = new Map(before.map(item => [item.title, serialize(item)]));
  const newMap = new Map(after.map(item => [item.title, serialize(item)]));
  return [
    ...after.filter(item => !oldMap.has(item.title)).map(item => ({ title: item.title, status: 'added' as const, after: serialize(item) })),
    ...before.filter(item => !newMap.has(item.title)).map(item => ({ title: item.title, status: 'removed' as const, before: serialize(item) })),
    ...after.filter(item => oldMap.has(item.title) && oldMap.get(item.title) !== serialize(item)).map(item => ({ title: item.title, status: 'changed' as const, before: oldMap.get(item.title), after: serialize(item) })),
  ];
}

export function diffResearchResults(before: ResearchResult, after: ResearchResult): ResearchDiff {
  const sections = diffNamed(before.sections, after.sections, item => JSON.stringify(item));
  const slides = diffNamed(before.slides, after.slides, item => JSON.stringify(item));
  const oldEvidence = new Map(before.evidence.map(item => [item.id, JSON.stringify(item)]));
  const newEvidence = new Map(after.evidence.map(item => [item.id, JSON.stringify(item)]));
  return {
    titleChanged: before.title !== after.title,
    thesisChanged: before.thesis !== after.thesis,
    sectionsAdded: sections.added,
    sectionsRemoved: sections.removed,
    sectionsChanged: sections.changed,
    slidesAdded: slides.added,
    slidesRemoved: slides.removed,
    slidesChanged: slides.changed,
    evidenceAdded: [...newEvidence.keys()].filter(id => !oldEvidence.has(id)),
    evidenceRemoved: [...oldEvidence.keys()].filter(id => !newEvidence.has(id)),
    sectionDetails: detailNamed(before.sections, after.sections, item => JSON.stringify(item)),
    slideDetails: detailNamed(before.slides, after.slides, item => JSON.stringify(item)),
    evidenceChanged: [...newEvidence.keys()].filter(id => oldEvidence.has(id) && oldEvidence.get(id) !== newEvidence.get(id)),
  };
}
