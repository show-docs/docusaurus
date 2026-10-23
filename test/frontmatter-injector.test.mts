import { describe, expect, it } from 'vitest';

import frontMatterInjectorPlugin, {
  applyRules,
  defaultRules,
  injectFrontMatter,
  isPlainObject,
  matchesFile,
  normalizePath,
  wrapParseFrontMatter,
  type DefaultParseFrontMatter,
  type FrontMatterRule,
  type ParseFrontMatter,
  type ParseFrontMatterParams,
  type RuleContext,
} from '../plugins/plugin-frontmatter-injector/src/index.mts';

const DOC = '/site/docs/intro.md';

/** 每条用例自己那份规则表：断言不跟着 `defaultRules` 改 */
const rule = (
  match: FrontMatterRule['match'],
  frontMatter: FrontMatterRule['frontMatter'],
): FrontMatterRule => ({ name: 'stub', match, frontMatter });

/** 假的默认实现：原文 → 一份普通的 frontmatter，够用例判「注入叠在哪一层」 */
const fakeParse: DefaultParseFrontMatter = async ({ filePath }) => ({
  frontMatter: { title: filePath, sidebar_position: 1 },
  content: '正文',
});

/** 调包装层必须带 `defaultParseFrontMatter`，用例这里包一层省掉样板 */
function callParse(
  parse: ParseFrontMatter,
  filePath = DOC,
): Promise<{ frontMatter: Record<string, unknown>; content: string }> {
  const params: ParseFrontMatterParams & {
    defaultParseFrontMatter: DefaultParseFrontMatter;
  } = { filePath, fileContent: '', defaultParseFrontMatter: fakeParse };

  return parse(params);
}

describe('matchesFile：规则的地盘怎么算', () => {
  it('字符串按后缀比，且串本身就是整段', () => {
    expect(matchesFile('/site/docs/a.md', '.md')).toBe(true);
    expect(matchesFile(String.raw`C:\site\docs\a.md`, '.md')).toBe(true);
    // 尾巴上多一节就不算：给预览文件留的后路
    expect(matchesFile('/site/docs/a.md.bak', '.md')).toBe(false);
    expect(matchesFile('/site/docs/a.mdx', '.md')).toBe(false);
  });

  it('正则原样交给 RegExp', () => {
    expect(matchesFile('/site/docs/a.md', /\/docs\//)).toBe(true);
    expect(matchesFile('/site/blog/a.md', /\/docs\//)).toBe(false);
  });
});

describe('normalizePath：规则表只面对一种分隔符', () => {
  it('反斜杠全换成正斜杠', () => {
    expect(normalizePath(String.raw`C:\site\docs\a.md`)).toBe(
      'C:/site/docs/a.md',
    );
    expect(normalizePath('/site/docs/a.md')).toBe('/site/docs/a.md');
  });
});

describe('isPlainObject：什么才能往里写', () => {
  it('普通对象算，null / 数组 / 原始值都不算', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });
});

describe('applyRules：只补不覆盖', () => {
  it('地盘命中时把缺的那几格补上，并报出补了哪些', () => {
    const frontMatter = { title: 'a' };
    const result = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { draft: true, custom: 'x' }),
    ]);

    expect(frontMatter).toEqual({ title: 'a', draft: true, custom: 'x' });
    expect(result).toEqual({
      changed: [DOC],
      changes: { [DOC]: ['draft', 'custom'] },
    });
  });

  it('已经有了的键一个都不动，算值那一步也不跑', () => {
    const frontMatter = { title: '站点写的' };
    let called = false;
    const result = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', {
        title: () => {
          called = true;
          return '规则写的';
        },
      }),
    ]);

    expect(frontMatter.title).toBe('站点写的');
    expect(called).toBe(false);
    expect(result).toEqual({ changed: [], changes: {} });
  });

  it('值写成 undefined 也算「已经有了」，不再补', () => {
    const frontMatter: Record<string, unknown> = { markmap: undefined };
    const result = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { markmap: true }),
    ]);

    expect(Object.hasOwn(frontMatter, 'markmap')).toBe(true);
    expect(frontMatter.markmap).toBeUndefined();
    expect(result.changed).toEqual([]);
  });

  it('原型链上的名字挡不住注入（用 hasOwn 判，不用 in）', () => {
    const frontMatter: Record<string, unknown> = {};
    applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { constructor: '我自己的' }),
    ]);

    expect(frontMatter.constructor).toBe('我自己的');
  });

  it('地盘没命中的规则整条跳过', () => {
    const frontMatter: Record<string, unknown> = {};
    const result = applyRules({ filePath: '/site/blog/a.md', frontMatter }, [
      rule(/\/docs\//, { draft: true }),
    ]);

    expect(frontMatter).toEqual({});
    expect(result.changed).toEqual([]);
  });

  it('算值那一步返回 undefined：不写键、不计入改动', () => {
    const frontMatter: Record<string, unknown> = { title: 'a' };
    const result = applyRules({ filePath: DOC, frontMatter }, [
      rule('.md', { draft: () => undefined, custom: 'x' }),
    ]);

    expect(Object.hasOwn(frontMatter, 'draft')).toBe(false);
    expect(result).toEqual({ changed: [DOC], changes: { [DOC]: ['custom'] } });
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

describe('injectFrontMatter：正文不动，frontmatter 是新的一份', () => {
  it('命中时换一份 frontMatter，content 原样交回，入参不变', () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const result = injectFrontMatter(parsed, {
      filePath: DOC,
      rules: [rule('.md', { draft: true })],
    });

    expect(result.frontMatter).toEqual({ title: 'a', draft: true });
    expect(result.content).toBe('正文');
    expect(parsed.frontMatter).toEqual({ title: 'a' });
    // 新对象：下游按引用比较时不至于以为「什么都没变」
    expect(result.frontMatter).not.toBe(parsed.frontMatter);
  });

  it('没命中时把入参原样交回（同一个对象）', () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const result = injectFrontMatter(parsed, {
      filePath: '/site/blog/a.md',
      rules: [rule(/\/docs\//, { draft: true })],
    });

    expect(result).toBe(parsed);
  });

  it('frontMatter 不是普通对象时原样交回，不去改别人的返回值', () => {
    for (const frontMatter of [undefined, null, ['a']]) {
      const parsed = { frontMatter, content: '正文' } as unknown as {
        frontMatter: Record<string, unknown>;
        content: string;
      };

      expect(
        injectFrontMatter(parsed, {
          filePath: DOC,
          rules: [rule('.md', { draft: true })],
        }),
      ).toBe(parsed);
    }
  });
});

describe('wrapParseFrontMatter：包装而非覆盖', () => {
  it('注入叠在 base 的结果上：base 先跑，站点自己改写的那几格还在', async () => {
    const base: ParseFrontMatter = async (params) => {
      const { frontMatter } = await fakeParse(params);
      return {
        frontMatter: { ...frontMatter, title: 'base 改过' },
        content: 'base 的正文',
      };
    };
    const wrapped = wrapParseFrontMatter(base, [rule('.md', { draft: true })]);

    expect(await callParse(wrapped)).toEqual({
      frontMatter: { title: 'base 改过', sidebar_position: 1, draft: true },
      content: 'base 的正文',
    });
  });

  it('以调用方带进来的默认实现为底，不抓闭包里那份', async () => {
    const fromCaller: ParseFrontMatter = async () => ({
      frontMatter: { from: 'caller' },
      content: 'c',
    });
    // `siteConfig` 里那份默认实现被换成另一个：包装层不该用它
    const wrapped = wrapParseFrontMatter(fromCaller, [
      rule('.md', { draft: true }),
    ]);
    const result = await wrapped({
      filePath: DOC,
      fileContent: '',
      defaultParseFrontMatter: async () => ({
        frontMatter: { from: 'default' },
        content: 'd',
      }),
    });

    expect(result.frontMatter).toEqual({ from: 'caller', draft: true });
  });

  it('Windows 路径先归一再比规则，正则那条规则也吃得到', async () => {
    const wrapped = wrapParseFrontMatter(fakeParse, [
      rule(/\/docs\//, { draft: true }),
    ]);
    const result = await callParse(wrapped, String.raw`C:\site\docs\intro.md`);

    expect(result.frontMatter.draft).toBe(true);
  });

  it('包两次只有一层：第二次原样交回同一个函数', () => {
    const wrapped = wrapParseFrontMatter(fakeParse, [
      rule('.md', { draft: true }),
    ]);

    expect(
      wrapParseFrontMatter(wrapped, [rule('.md', { title: '第二次' })]),
    ).toBe(wrapped);
  });

  it('包装不丢 base 的异常：抛就抛出去', async () => {
    const boom: ParseFrontMatter = () => Promise.reject(new Error('yaml 坏了'));
    const wrapped = wrapParseFrontMatter(boom, [
      rule('.md', { testing: true }),
    ]);

    await expect(callParse(wrapped)).rejects.toThrow('yaml 坏了');
  });
});

describe('defaultRules：只有 testing 一条', () => {
  const injected = (frontMatter: Record<string, unknown>, filePath = DOC) =>
    injectFrontMatter(
      { frontMatter, content: '' },
      { filePath, rules: defaultRules },
    ).frontMatter;

  it('每一页 md 都补上 testing: true，页面自己写的那一份不碰', () => {
    expect(injected({})).toEqual({ testing: true });
    expect(injected({ testing: false })).toEqual({ testing: false });
    expect(injected({ testing: 'yaml 里写歪了' })).toEqual({
      testing: 'yaml 里写歪了',
    });
  });

  it('不替主题层补它们自己的键：markmap / diff / iframe 一个都不出现', () => {
    // 那几把键的缺省由各层自己兜，注入往它们身上写等于替人家改判定口径
    const { frontMatter } = injectFrontMatter(
      { frontMatter: {}, content: '' },
      { filePath: DOC, rules: defaultRules },
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
    expect(injected({}, '/site/docs/a.dbml')).toEqual({});
  });
});

describe('plugin-frontmatter-injector 插件接线', () => {
  /** 站点配置里共享的那份 `markdown`：默认只有官方填进来的那一格 */
  const createMarkdown = (parseFrontMatter: unknown = fakeParse) => ({
    parseFrontMatter,
  });

  /**
  只造出插件真正读的那一格：站点配置里共享的那份 `markdown`。

  `options` 缺省是 `undefined`（不是 `{}`）：官方 `initPlugins()` 在没有插件选项时**不传**
  第二个参数，那条路也要走到。
  */
  function loadPlugin(
    options: Parameters<
      typeof frontMatterInjectorPlugin
    >[1] = undefined as never,
    markdown: Record<string, unknown> = createMarkdown(),
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

  it('插件名就是包名，且不声明任何客户端模块', () => {
    const { plugin } = loadPlugin();

    expect(plugin.name).toBe(
      '@show-docs/docusaurus-plugin-frontmatter-injector',
    );
    expect(plugin.getClientModules).toBeUndefined();
    expect(plugin.getThemePath).toBeUndefined();
  });

  it('loadContent 之后站点那份解析器被包住：原来那格还在，注入那格补上', async () => {
    const { plugin, markdown } = loadPlugin();
    plugin.loadContent?.();

    const result = await callParse(
      markdown.parseFrontMatter as ParseFrontMatter,
    );

    expect(result.frontMatter.title).toBe(DOC);
    expect(result.frontMatter.testing).toBe(true);
  });

  it('接线落在读走解析器之前：模拟 docs 插件与 mdx-loader 两条路都吃得到', async () => {
    // `@docusaurus/plugin-content-docs` 在**它自己的** `loadContent()` 里就把
    // `siteConfig.markdown.parseFrontMatter` 解构走了（拿到的是函数引用，之后再换属性
    // 它也不看），而 mdx-loader 是编译每个 md 时才读属性 —— 两条路不是同一次调用，
    // 接线必须早于前者的那一次。
    const { plugin, markdown } = loadPlugin();
    plugin.loadContent?.();

    // 站在 docs 插件那一侧：它在自己的 `loadContent()` 里读到的属性
    const docsRead = markdown.parseFrontMatter as ParseFrontMatter;
    // 站在 mdx-loader 那一侧：它编译时才读属性
    const loaderReads = markdown.parseFrontMatter as ParseFrontMatter;

    const viaDocs = await callParse(docsRead);
    const viaLoader = await callParse(loaderReads);

    expect(viaDocs.frontMatter.testing).toBe(true);
    expect(viaLoader.frontMatter.testing).toBe(true);
  });

  it('构造函数本身不碰站点配置：那时别的插件可能还没跑完', () => {
    const { markdown } = loadPlugin();

    expect(markdown.parseFrontMatter).toBe(fakeParse);
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

    const { frontMatter } = await callParse(
      markdown.parseFrontMatter as ParseFrontMatter,
    );

    expect(frontMatter.testing).toBe(true);
  });

  it('选件：rules 传空数组时一个字节都不改', () => {
    const { plugin, markdown } = loadPlugin({ rules: [] });

    // 早退：连 `parseFrontMatter` 都不该被替换
    expect(() => plugin.loadContent?.()).not.toThrow();
    expect(() => plugin.contentLoaded?.({} as never)).not.toThrow();
    expect(markdown.parseFrontMatter).toBe(fakeParse);
  });

  it('选件：不传 rules 时用 defaultRules（只补 testing）', async () => {
    const { plugin, markdown } = loadPlugin();
    plugin.loadContent?.();

    const { frontMatter } = await callParse(
      markdown.parseFrontMatter as ParseFrontMatter,
    );

    expect(frontMatter.testing).toBe(true);
    expect(Object.hasOwn(frontMatter, 'diff')).toBe(false);
    expect(Object.hasOwn(frontMatter, 'markmap')).toBe(false);
  });

  it('选件：自定义规则表说了算', async () => {
    const { plugin, markdown } = loadPlugin({
      rules: [rule('.md', { title: '被规则改掉' })],
    });
    plugin.loadContent?.();

    const result = await callParse(
      markdown.parseFrontMatter as ParseFrontMatter,
    );

    // 只补不覆盖：`title` 是 base 给的，稳
    expect(result.frontMatter.title).toBe(DOC);
  });

  it('站点没写 parseFrontMatter（官方填进来的默认值）时照样包得住', async () => {
    const { DEFAULT_PARSE_FRONT_MATTER } = await import('@docusaurus/utils');
    const { plugin, markdown } = loadPlugin(
      {},
      // 官方 `configValidation` 就是这么填的：一个 `fileContent → {frontMatter, content}` 的函数
      createMarkdown(DEFAULT_PARSE_FRONT_MATTER),
    );
    plugin.loadContent?.();

    const result = await (markdown.parseFrontMatter as ParseFrontMatter)({
      filePath: DOC,
      fileContent: '---\ntitle: 原文\n---\n\n# 标题\n',
      defaultParseFrontMatter: DEFAULT_PARSE_FRONT_MATTER,
    });

    // 真的走了 yaml 解析：原来那格在，注入那格也补上了
    expect(result.frontMatter.title).toBe('原文');
    expect(result.frontMatter.testing).toBe(true);
    expect(result.content.trim()).toBe('# 标题');
  });
});
