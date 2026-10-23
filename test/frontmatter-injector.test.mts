import { describe, expect, it } from 'vitest';

import frontMatterInjectorPlugin, {
  applyRules,
  defaultRules,
  wrapParseFrontMatter,
  type FrontMatterRule,
  type RuleContext,
} from '../plugins/plugin-frontmatter-injector/src/index.mts';

const DOC = '/site/docs/intro.md';

/** 每条用例自己那份规则表：断言不跟着 `defaultRules` 改 */
const rule = (
  match: FrontMatterRule['match'],
  frontMatter: FrontMatterRule['frontMatter'],
): FrontMatterRule => ({ name: 'stub', match, frontMatter });

/** 跑一遍包装层，只看 frontmatter */
async function frontMatterOf(
  parse: ReturnType<typeof wrapParseFrontMatter>,
  path = DOC,
) {
  const { frontMatter } = await parse({ filePath: path, fileContent: '' });

  return frontMatter;
}

/** 假的解析器：文件路径当标题，够用例判「注入叠在哪一层」；传 `base` 就是「站点写过的那份」 */
const fakeParse =
  (base?: Record<string, unknown>) =>
  async ({ filePath }: { filePath: string }) => ({
    frontMatter: { title: DOC, ...base, path: filePath },
    content: '正文',
  });

describe('applyRules：只补不覆盖', () => {
  it('地盘命中时把缺的那几格补上，并报出补了哪些', () => {
    const frontMatter = { title: 'a' };
    const touched = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { draft: true, custom: 'x' }),
    ]);

    expect(frontMatter).toEqual({ title: 'a', draft: true, custom: 'x' });
    expect(touched).toEqual(['draft', 'custom']);
  });

  it('已经有了的键一个都不动，算值那一步也不跑', () => {
    const frontMatter = { title: '站点写的' };
    let called = false;
    const touched = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', {
        title: () => {
          called = true;
          return '规则写的';
        },
      }),
    ]);

    expect(frontMatter.title).toBe('站点写的');
    expect(called).toBe(false);
    expect(touched).toEqual([]);
  });

  it('值写成 undefined 也算「已经有了」，不再补', () => {
    const frontMatter: Record<string, unknown> = { markmap: undefined };
    const touched = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { markmap: true }),
    ]);

    expect(Object.hasOwn(frontMatter, 'markmap')).toBe(true);
    expect(frontMatter.markmap).toBeUndefined();
    expect(touched).toEqual([]);
  });

  it('原型链上的名字挡不住注入（用 hasOwn 判，不用 in）', () => {
    const frontMatter: Record<string, unknown> = {};
    applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { constructor: '我自己的' }),
    ]);

    expect(frontMatter.constructor).toBe('我自己的');
  });

  it('地盘没命中的规则整条跳过；字符串按后缀比，正则原样', () => {
    const frontMatter: Record<string, unknown> = {};
    const touched = applyRules({ filePath: '/site/blog/a.md', frontMatter }, [
      rule(/\/docs\//, { draft: true }),
      rule('.md.bak', { draft: true }),
      rule('.md', { testing: true }),
    ]);

    expect(frontMatter).toEqual({ testing: true });
    expect(touched).toEqual(['testing']);
  });

  it('算值那一步返回 undefined：不写键、不计入改动', () => {
    const frontMatter: Record<string, unknown> = { title: 'a' };
    const touched = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { draft: () => undefined, custom: 'x' }),
    ]);

    expect(Object.hasOwn(frontMatter, 'draft')).toBe(false);
    expect(touched).toEqual(['custom']);
  });

  it('算值那一步拿得到文件路径与此刻的 frontmatter', () => {
    const frontMatter: Record<string, unknown> = { title: 'a' };
    applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', {
        slug: (context: RuleContext) =>
          `${context.filePath}:${String(context.frontMatter.title)}`,
      }),
    ]);

    expect(frontMatter.slug).toBe(`${DOC}:a`);
  });
});

describe('wrapParseFrontMatter：包装而非覆盖', () => {
  const call = (parse: ReturnType<typeof wrapParseFrontMatter>) =>
    parse({ filePath: DOC, fileContent: '' });

  it('注入叠在 base 的结果上：base 先跑，站点自己改写的那几格还在', async () => {
    const base = async () => ({
      frontMatter: { title: 'base 改过' },
      content: 'base 的正文',
    });

    expect(
      await frontMatterOf(
        wrapParseFrontMatter(base, [rule('.md', { draft: true })]),
      ),
    ).toEqual({ title: 'base 改过', draft: true });
  });

  it('注入只改元数据：content 原样交回，解析结果不动', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped = wrapParseFrontMatter(
      async () => parsed,
      [rule('.md', { draft: true })],
    );
    const result = await call(wrapped);

    expect(result.content).toBe('正文');
    expect(result.frontMatter).toEqual({ title: 'a', draft: true });
    // 新对象：下游按引用比较时不至于以为「什么都没变」
    expect(result.frontMatter).not.toBe(parsed.frontMatter);
    expect(parsed.frontMatter).toEqual({ title: 'a' });
  });

  it('一条都没补上时把 base 那份原样交回（frontmatter 还是同一个对象）', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped = wrapParseFrontMatter(
      async () => parsed,
      [rule(/\/blog\//, { draft: true })],
    );

    const result = await call(wrapped);

    expect(result.frontMatter).toBe(parsed.frontMatter);
  });

  it('frontMatter 不是普通对象时原样交回，不去改别人的返回值', async () => {
    for (const frontMatter of [undefined, null, ['a']]) {
      const parsed = { frontMatter, content: '正文' };
      const wrapped = wrapParseFrontMatter(
        async () => parsed as never,
        [rule('.md', { draft: true })],
      );

      expect(await call(wrapped)).toEqual(parsed);
    }
  });

  it('Windows 路径先归一再比规则，正则那条规则也吃得到', async () => {
    const wrapped = wrapParseFrontMatter(fakeParse(), [
      rule(/\/docs\//, { draft: true }),
    ]);
    expect(
      await frontMatterOf(wrapped, String.raw`C:\site\docs\intro.md`),
    ).toMatchObject({ draft: true });
  });

  it('包两次只有一层：第二次原样交回同一个函数', () => {
    const wrapped = wrapParseFrontMatter(fakeParse(), [
      rule('.md', { draft: true }),
    ]);

    expect(
      wrapParseFrontMatter(wrapped, [rule('.md', { title: '第二次' })]),
    ).toBe(wrapped);
  });

  it('包装不丢 base 的异常：抛就抛出去', async () => {
    const wrapped = wrapParseFrontMatter(
      () => Promise.reject(new Error('yaml 坏了')),
      [rule('.md', { testing: true })],
    );

    await expect(call(wrapped)).rejects.toThrow('yaml 坏了');
  });
});

describe('defaultRules：只有 testing 一条', () => {
  it('每一页 md 都补上 testing: true，页面自己写的那一份不碰', async () => {
    expect(
      await frontMatterOf(wrapParseFrontMatter(fakeParse(), defaultRules)),
    ).toEqual({ title: DOC, path: DOC, testing: true });

    expect(
      await frontMatterOf(
        wrapParseFrontMatter(fakeParse({ testing: false }), defaultRules),
      ),
    ).toMatchObject({ testing: false });
  });

  it('不替主题层补它们自己的键：markmap / diff / iframe 一个都不出现', async () => {
    const frontMatter = await frontMatterOf(
      wrapParseFrontMatter(fakeParse(), defaultRules),
    );

    for (const key of [
      'markmap',
      'diff',
      'iframe',
      'oas3',
      'redoc',
      'scalar',
    ]) {
      expect(Object.hasOwn(frontMatter, key)).toBe(false);
    }
  });

  it('管不到非 md 文件', () => {
    const frontMatter: Record<string, unknown> = {};

    expect(
      applyRules({ filePath: '/site/docs/a.dbml', frontMatter }, defaultRules),
    ).toEqual([]);
    expect(frontMatter).toEqual({});
  });
});

describe('plugin-frontmatter-injector 插件接线', () => {
  /** 站点配置里共享的那份 `markdown`：除了解析器，还住着兄弟键 */
  const createMarkdown = (parseFrontMatter: unknown = fakeParse()) => ({
    parseFrontMatter,
    preprocessor: (params: { fileContent: string }) => params.fileContent,
    format: 'mdx',
  });

  /**
  只造出插件真正读的那一格：站点配置里共享的那份 `markdown`。

  `options` 缺省是 `undefined`（不是 `{}`）：官方 `initPlugins()` 在没有插件选项时**不传**
  第二个参数，那条路也要走到。
  */
  function loadPlugin(
    options: Parameters<typeof frontMatterInjectorPlugin>[1] = undefined,
    markdown = createMarkdown(),
  ) {
    const context = { siteConfig: { markdown } } as unknown as Parameters<
      typeof frontMatterInjectorPlugin
    >[0];

    return {
      markdown,
      plugin:
        options === undefined
          ? frontMatterInjectorPlugin(context)
          : frontMatterInjectorPlugin(context, options),
    };
  }

  /** 站点的两条消费路径读到的都是同一个属性，这里只造一次调用 */
  async function parseFrontMatter(markdown: {
    parseFrontMatter: unknown;
  }): Promise<Record<string, unknown>> {
    const { frontMatter } = await (
      markdown.parseFrontMatter as (params: {
        filePath: string;
        fileContent: string;
      }) => Promise<{ frontMatter: Record<string, unknown> }>
    )({ filePath: DOC, fileContent: '' });

    return frontMatter;
  }

  it('插件名就是包名，且不声明任何客户端模块', () => {
    const { plugin } = loadPlugin();

    expect(plugin.name).toBe(
      '@show-docs/docusaurus-plugin-frontmatter-injector',
    );
    expect(plugin.getClientModules).toBeUndefined();
    expect(plugin.getThemePath).toBeUndefined();
  });

  it('构造函数本身不碰站点配置：那时别的插件可能还没跑完', () => {
    const base = fakeParse();
    const { markdown } = loadPlugin(undefined, createMarkdown(base));

    expect(markdown.parseFrontMatter).toBe(base);
  });

  it('loadContent 之后站点那份解析器被包住，兄弟键连引用都不换', async () => {
    const { plugin, markdown } = loadPlugin();
    const { preprocessor } = markdown;
    plugin.loadContent?.();

    const frontMatter = await parseFrontMatter(markdown);

    expect(frontMatter.testing).toBe(true);
    // preprocessor 被整份换掉/摘掉，就是「中文标题 {#id}」那批页一起白屏的成因
    expect(markdown.preprocessor).toBe(preprocessor);
    expect(markdown.format).toBe('mdx');
  });

  it('两个阶段都调也不会套第二层（reloadSite 只重跑 contentLoaded）', () => {
    const { plugin, markdown } = loadPlugin();
    plugin.loadContent?.();
    const once = markdown.parseFrontMatter;
    plugin.contentLoaded?.({} as never);

    expect(markdown.parseFrontMatter).toBe(once);
  });

  it('只重跑 contentLoaded（reloadSite 那条路）时也包得上', async () => {
    const { plugin, markdown } = loadPlugin();
    plugin.contentLoaded?.({} as never);

    expect(await parseFrontMatter(markdown)).toMatchObject({ testing: true });
  });

  it('选件：rules 传空数组时一个字节都不改', () => {
    const base = fakeParse();
    const { plugin, markdown } = loadPlugin(
      { rules: [] },
      createMarkdown(base),
    );

    // 早退：连 `parseFrontMatter` 都不该被替换
    expect(() => plugin.loadContent?.()).not.toThrow();
    expect(() => plugin.contentLoaded?.({} as never)).not.toThrow();
    expect(markdown.parseFrontMatter).toBe(base);
  });

  it('选件：不传 rules 时用 defaultRules（只补 testing）', async () => {
    const { plugin, markdown } = loadPlugin();
    plugin.loadContent?.();

    const frontMatter = await parseFrontMatter(markdown);

    expect(frontMatter.testing).toBe(true);
    expect(Object.hasOwn(frontMatter, 'diff')).toBe(false);
    expect(Object.hasOwn(frontMatter, 'markmap')).toBe(false);
  });

  it('选件：自定义规则表说了算，只补不覆盖', async () => {
    const { plugin, markdown } = loadPlugin({
      rules: [rule('.md', { title: '被规则改掉' })],
    });
    plugin.loadContent?.();

    const frontMatter = await parseFrontMatter(markdown);

    // `title` 是 base 给的，稳
    expect(frontMatter.title).toBe(DOC);
  });

  it('站点没写 parseFrontMatter（官方填进来的默认值）时照样包得住', async () => {
    const { DEFAULT_PARSE_FRONT_MATTER } = await import('@docusaurus/utils');
    const markdown = createMarkdown(DEFAULT_PARSE_FRONT_MATTER);
    const context = { siteConfig: { markdown } } as unknown as Parameters<
      typeof frontMatterInjectorPlugin
    >[0];
    frontMatterInjectorPlugin(context).loadContent?.();

    const fileContent = '---\ntitle: 原文\n---\n\n# 标题 {#custom}\n';
    const result = await (
      markdown.parseFrontMatter as (params: {
        filePath: string;
        fileContent: string;
        defaultParseFrontMatter: unknown;
      }) => Promise<{ frontMatter: Record<string, unknown>; content: string }>
    )({
      filePath: DOC,
      fileContent,
      defaultParseFrontMatter: DEFAULT_PARSE_FRONT_MATTER,
    });

    // 真的走了 yaml 解析：原来那格在、注入那格也补上，且正文（含没转义的 `{#custom}`）原样
    expect(result.frontMatter).toEqual({ title: '原文', testing: true });
    expect(result.content).toContain('{#custom}');
  });
});
