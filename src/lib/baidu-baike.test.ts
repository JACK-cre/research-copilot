import { describe, expect, it } from 'vitest';

import { mapBaiduBaikeLemma } from '@/lib/baidu-baike';

describe('mapBaiduBaikeLemma', () => {
  it('keeps the Long March lemma with facts and a https url', () => {
    const paper = mapBaiduBaikeLemma({
      id: 6412,
      title: '长征',
      desc: '历史事件',
      abstract: '土地革命战争时期，中国工农红军主力撤离长江南北各苏区，转战两年，到达陕甘苏区的战略转移行动。',
      url: 'http://baike.baidu.com/subview/6412/6766468.htm',
      card: [
        { name: '中文名', value: ['长征'] },
        { name: '发生时间', value: ['1934年10月至1936年10月'] },
        { name: '领导人', value: ['<a>毛泽东</a>、周恩来'] },
      ],
    });

    expect(paper).toMatchObject({
      id: 'baidu-baike:6412',
      title: '长征',
      source: 'baidu-baike',
      sourceType: 'web',
      year: 1934,
      url: 'https://baike.baidu.com/subview/6412/6766468.htm',
    });
    expect(paper?.abstract).toContain('中国工农红军');
    expect(paper?.abstract).toContain('发生时间：1934年10月至1936年10月');
    expect(paper?.abstract).not.toContain('<a>');
  });

  it('returns null for an empty lemma payload', () => {
    expect(mapBaiduBaikeLemma({})).toBeNull();
  });
});
