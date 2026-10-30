import { describe, expect, it } from 'vitest';

import {
  firstWrittenValue,
  writtenValues,
} from '../packages/theme-component-page/lib/frontmatter-values.ts';

/**
## 一组键里这一页写了哪几把（三条 API 层共用那一份读法）

`oas3:` / `aas3:` 那几把键归各条层自己解释，机制层只回答两句：给的这组键名里这一页写了哪几把、
写的值像不像一串非空文本。顺序由调用方排，所以「两把都写时哪把赢」这条只在一处判 —— 三份各抄
一遍的话，它会在三个地方各漂一次。这一族钉的就是那两条：交回的顺序不重排、不像文本的一律不算
写了。至于赢了以后拿它做什么（拼地址、告警文案），是各层自己的事，见各包的 `components/*-spec.ts`。
*/

describe('writtenValues：这组键里写了的那几把', () => {
  it('键名与那串文本一起交回，顺序按调用方给的那一份排', () => {
    expect(
      writtenValues({ aas3: 'b.yaml', oas3: 'a.yaml' }, ['oas3', 'aas3']),
    ).toEqual([
      { key: 'oas3', value: 'a.yaml' },
      { key: 'aas3', value: 'b.yaml' },
    ]);
  });

  it('没写的那把一眼不看，写了的几把都留着（两把都写由调用方自己告警）', () => {
    expect(writtenValues({ oas3: 'a.yaml' }, ['oas3', 'aas3'])).toEqual([
      { key: 'oas3', value: 'a.yaml' },
    ]);
  });

  it('空串不算写了：`oas3:` 后面什么都不写就是没给地址', () => {
    expect(writtenValues({ oas3: '' }, ['oas3'])).toEqual([]);
  });

  it('非文本的那几种值都不算写了：布尔、数字、对象、数组、null', () => {
    expect(
      writtenValues(
        {
          oas3: true,
          aas3: 3,
          nested: { url: 'a.yaml' },
          list: ['a.yaml'],
          nul: null,
        },
        ['oas3', 'aas3', 'nested', 'list', 'nul'],
      ),
    ).toEqual([]);
  });

  it('没有 frontmatter 的那一页（undefined）也是一串空，不抛', () => {
    expect(writtenValues(undefined, ['oas3'])).toEqual([]);
  });

  it('给一组空键名就什么都不查', () => {
    expect(writtenValues({ oas3: 'a.yaml' }, [])).toEqual([]);
  });
});

describe('firstWrittenValue：排在最前那一把就是赢的那一把', () => {
  it('两把都写时取调用方排在最前那一个', () => {
    expect(
      firstWrittenValue({ oas3: 'a.yaml', aas3: 'b.yaml' }, ['aas3', 'oas3']),
    ).toEqual({ key: 'aas3', value: 'b.yaml' });
  });

  it('一把都没写交回 undefined（要不要说那句话、怎么说归调用方）', () => {
    expect(firstWrittenValue({ other: 'x' }, ['oas3', 'aas3'])).toBeUndefined();
  });
});
