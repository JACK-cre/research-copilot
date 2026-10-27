import type {
  AiCredentialSource,
  OutputTemplateSnapshot,
  RevisionTarget,
} from "@/types/platform";

export type DeliverableType = "survey" | "proposal" | "briefing";

export interface ResearchRequest {
  topic: string;
  requirements: string;
  deliverable: DeliverableType;
  audience: "general" | "technical" | "academic";
  yearFrom: number;
  paperCount: number;
  includeExternal: boolean;
  includeLibrary: boolean;
  templateId?: string;
}

export interface Author {
  name: string;
}

export interface Paper {
  id: string;
  title: string;
  abstract: string;
  year: number;
  authors: Author[];
  citedByCount: number;
  doi?: string;
  url: string;
  pdfUrl?: string;
  topics: string[];
  source: "openalex" | "demo";
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  chunkCount: number;
  createdAt: string;
  status?: "processing" | "ready" | "failed";
  sha256?: string;
  storagePath?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  page?: number;
  embedding: number[];
}

export interface Evidence {
  id: string;
  kind: "paper" | "knowledge";
  title: string;
  excerpt: string;
  sourceUrl?: string;
  year?: number;
  page?: number;
  score: number;
  retrievalRoutes?: Array<"semantic" | "keyword">;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  citations: string[];
}

export type SlideType =
  | "title"
  | "thesis"
  | "landscape"
  | "comparison"
  | "evidence"
  | "roadmap"
  | "conclusion";

export interface SlideSpec {
  type: SlideType;
  title: string;
  keyPoints: string[];
  citations: string[];
  speakerNotes: string;
}

export interface ResearchResult {
  id: string;
  createdAt: string;
  request: ResearchRequest;
  title: string;
  thesis: string;
  searchQueries: string[];
  papers: Paper[];
  evidence: Evidence[];
  sections: ReportSection[];
  slides: SlideSpec[];
  mode: "model" | "local";
  warnings: string[];
  aiSource?: AiCredentialSource;
  template?: OutputTemplateSnapshot;
  version?: number;
  parentRunId?: string;
  revisionInstruction?: string;
  revisionTarget?: RevisionTarget;
}
