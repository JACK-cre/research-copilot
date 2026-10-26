# Research agent evaluation notes

研究智能体不能只评价语言模型的回答，还要评价完整工作流。核心指标包括检索召回率、引用准确率、任务完成率、延迟、成本，以及交付前需要人工修改的工作量。对于 RAG 与 MCP 结合的系统，证据检索和工具执行应保留可审计轨迹。

An applied research agent should be evaluated as a workflow rather than only as a language model. The primary measures are retrieval recall, citation precision, task completion rate, latency, cost, and the amount of human correction required before delivery.

For retrieval, a useful baseline combines lexical and vector search. Reranking should be measured separately so that improvements are not incorrectly attributed to the generator. Every generated claim should retain links to the chunks that support it.

For tool use, read-only tools should be separated from actions with side effects. Actions that publish, send, delete, or purchase should require explicit human confirmation. Tool errors must be visible in the final task trace instead of being silently replaced by plausible prose.

For presentation generation, content planning and layout rendering should be separate stages. The model produces a typed slide specification, while deterministic templates control coordinates, typography, overflow, and citations.
