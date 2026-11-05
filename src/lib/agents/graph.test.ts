import { describe, expect, it } from 'vitest';

import { END, START, StateGraph } from '@/lib/agents/graph';

describe('StateGraph', () => {
  it('runs sequential nodes and merges state', async () => {
    const graph = new StateGraph<{ value: string; steps: string[] }>()
      .addNode('one', (state) => ({ value: state.value + '-1', steps: [...state.steps, 'one'] }))
      .addNode('two', (state) => ({ value: state.value + '-2', steps: [...state.steps, 'two'] }))
      .addEdge(START, 'one')
      .addEdge('one', 'two')
      .addEdge('two', END)
      .compile();

    const result = await graph.invoke({ value: 'start', steps: [] });
    expect(result.value).toBe('start-1-2');
    expect(result.steps).toEqual(['one', 'two']);
  });

  it('follows conditional edges for a critic-style loop', async () => {
    const graph = new StateGraph<{ count: number; done: boolean }>()
      .addNode('work', (state) => ({ count: state.count + 1 }))
      .addNode('check', (state) => ({ done: state.count >= 2 }))
      .addEdge(START, 'work')
      .addEdge('work', 'check')
      .addConditionalEdges('check', (state) => (state.done ? END : 'work'))
      .compile();

    const result = await graph.invoke({ count: 0, done: false });
    expect(result.count).toBe(2);
    expect(result.done).toBe(true);
  });
});
