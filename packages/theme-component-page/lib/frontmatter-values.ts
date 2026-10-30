/**
从某一页的 frontmatter 里读「一组键中写了的那几把」：各条 API 层用它挑要渲染哪份文档。

**机制层不认识业务键**：这一份只回答「这组键名里，这一页写了哪几把、写的值像不像一串非空文本」，
`oas3:` / `aas3:` 那一串由调用方自己给，谁先谁后也由调用方排。为什么要抽这一格：三条层读的是
同一组键、同一份优先级，三份各抄一遍的话「两把都写时哪把赢」这条就会在三个地方各漂一次。

不引 React、不引 DOM：单测与各包的主题层引同一份。
*/

/** 一把被写了的键：键名与那串非空文本一起交回（告警要按键名说「用的是哪一把」）。 */
export type WrittenValue = { key: string; value: string };

/**
这一页在那组键里写了哪几把（值是非空字符串），**保持调用方给的顺序**。

只看 frontmatter 这一份：那几把键的语义归写它们的层，模块上的同名导出不是作者的本意。
*/
export function writtenValues(
  frontMatter: Record<string, unknown> | undefined,
  keys: readonly string[],
): WrittenValue[] {
  const written: WrittenValue[] = [];

  for (const key of keys) {
    const value = frontMatter?.[key];

    if (typeof value === 'string' && value !== '') {
      written.push({ key, value });
    }
  }

  return written;
}

/**
这一页在这组键里**第一把**写了非空文本的值；一把都没写交回 `undefined`。

顺序就是优先级：两把都写时用排在最前那一把，通常是手误 —— 说这句话的告警归调用方
（各家对自己的键名与文案负责，机制层不替它们说话）。
*/
export function firstWrittenValue(
  frontMatter: Record<string, unknown> | undefined,
  keys: readonly string[],
): WrittenValue | undefined {
  return writtenValues(frontMatter, keys)[0];
}
