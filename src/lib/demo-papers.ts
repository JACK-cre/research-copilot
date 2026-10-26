import type { Paper } from "@/types/research";

export const demoPapers: Paper[] = [
  {
    id: "https://openalex.org/W-demo-rag",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    abstract:
      "Retrieval-augmented generation combines parametric language models with non-parametric memory. Retrieved evidence improves factual grounding and allows knowledge to be updated without retraining the generator.",
    year: 2020,
    authors: [{ name: "Patrick Lewis" }, { name: "Ethan Perez" }],
    citedByCount: 8432,
    doi: "https://doi.org/10.48550/arXiv.2005.11401",
    url: "https://arxiv.org/abs/2005.11401",
    pdfUrl: "https://arxiv.org/pdf/2005.11401",
    topics: ["Retrieval-augmented generation", "Natural language processing"],
    source: "demo",
  },
  {
    id: "https://openalex.org/W-demo-react",
    title: "ReAct: Synergizing Reasoning and Acting in Language Models",
    abstract:
      "ReAct interleaves reasoning traces with actions. The approach lets language models gather external information, update plans, and provide interpretable trajectories for knowledge and decision tasks.",
    year: 2023,
    authors: [{ name: "Shunyu Yao" }, { name: "Jeffrey Zhao" }],
    citedByCount: 5120,
    doi: "https://doi.org/10.48550/arXiv.2210.03629",
    url: "https://arxiv.org/abs/2210.03629",
    pdfUrl: "https://arxiv.org/pdf/2210.03629",
    topics: ["Language model agents", "Reasoning"],
    source: "demo",
  },
  {
    id: "https://openalex.org/W-demo-agent-survey",
    title: "A Survey on Large Language Model based Autonomous Agents",
    abstract:
      "This survey organizes autonomous language-model agents around profiling, memory, planning, and action. It also discusses evaluation, tool use, multi-agent collaboration, and open reliability challenges.",
    year: 2024,
    authors: [{ name: "Lei Wang" }, { name: "Chen Ma" }],
    citedByCount: 1830,
    url: "https://arxiv.org/abs/2308.11432",
    pdfUrl: "https://arxiv.org/pdf/2308.11432",
    topics: ["Autonomous agents", "Large language models"],
    source: "demo",
  },
  {
    id: "https://openalex.org/W-demo-crag",
    title: "Corrective Retrieval Augmented Generation",
    abstract:
      "Corrective RAG introduces a retrieval evaluator and corrective actions for low-quality search results. It demonstrates that retrieval quality control is essential for robust grounded generation.",
    year: 2024,
    authors: [{ name: "Shi-Qi Yan" }, { name: "Jia-Chen Gu" }],
    citedByCount: 890,
    url: "https://arxiv.org/abs/2401.15884",
    pdfUrl: "https://arxiv.org/pdf/2401.15884",
    topics: ["Retrieval quality", "Grounded generation"],
    source: "demo",
  },
];
