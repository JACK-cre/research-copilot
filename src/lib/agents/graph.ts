import type { AgentName, AgentTraceStatus, AgentTraceStep } from '@/lib/agents/types';

export const START = '__start__';
export const END = '__end__';

type NodeFn<S> = (state: S) => Promise<Partial<S> | void> | Partial<S> | void;
type Router<S> = (state: S) => string | string[];

export class StateGraph<S extends object> {
  private readonly nodes = new Map<string, NodeFn<S>>();
  private readonly edges = new Map<string, string[]>();
  private readonly routers = new Map<string, Router<S>>();

  addNode(name: string, fn: NodeFn<S>): this {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string): this {
    const next = this.edges.get(from) ?? [];
    next.push(to);
    this.edges.set(from, next);
    return this;
  }

  addConditionalEdges(from: string, router: Router<S>): this {
    this.routers.set(from, router);
    return this;
  }

  compile() {
    const nodes = this.nodes;
    const edges = this.edges;
    const routers = this.routers;

    const successors = (from: string, state: S): string[] => {
      if (routers.has(from)) {
        const routed = routers.get(from)!(state);
        return (Array.isArray(routed) ? routed : [routed]).filter(Boolean);
      }
      return edges.get(from) ?? [];
    };

    return {
      async invoke(initial: S, options: { maxSteps?: number } = {}): Promise<S> {
        let state = { ...initial };
        let frontier = successors(START, state);
        const maxSteps = options.maxSteps ?? 24;

        for (let step = 0; step < maxSteps && frontier.length; step += 1) {
          const batch = Array.from(new Set(frontier.filter((name) => name !== END)));
          if (!batch.length) break;

          const patches = await Promise.all(batch.map(async (name) => {
            const node = nodes.get(name);
            if (!node) throw new Error(`Unknown graph node: ${name}`);
            return node(state);
          }));

          for (const patch of patches) {
            if (patch) state = { ...state, ...patch };
          }

          frontier = batch.flatMap((name) => successors(name, state));
        }

        return state;
      },
    };
  }
}

export async function runAgentNode(
  agent: AgentName,
  title: string,
  task: () => Promise<{ summary: string; status?: AgentTraceStatus }>,
): Promise<AgentTraceStep> {
  const started = Date.now();
  try {
    const result = await task();
    return {
      agent,
      title,
      status: result.status ?? 'ok',
      summary: result.summary,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      agent,
      title,
      status: 'failed',
      summary: error instanceof Error ? error.message : '节点执行失败',
      durationMs: Date.now() - started,
    };
  }
}

export function appendTrace(trace: AgentTraceStep[], step: AgentTraceStep): AgentTraceStep[] {
  return [...trace, step];
}
