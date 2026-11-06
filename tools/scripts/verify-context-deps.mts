/**
钉住「把层目录登记成引用方的上下文依赖」那一条规则：两个 bundler 各开一次**真实编译器**，
第一趟看层目录有没有进 `compilation.contextDependencies`，第二趟看「往内层目录写一个新组件」
这件事本身有没有成为重新解析的理由。跑法：`pnpm build && pnpm verify:context-deps`
（读 `pnpm build:core` 产出的包内 `dist/`，也就是包出口真正指向的那份产物，不是 `src/` 的副本）。

**为什么要有这个脚本**：`@theme-prev/X` 的落点是「下面那一层的目录里**现在**有没有这个文件」现算的，
而 bundler 记的是上一次的解析结果。层目录不在引用方的依赖表里时，「层里新增一个组件」这种改动判不旧：
链停在旧落点上，而且一句错都不报。那条规则
（`packages/plugin-prev-layer-resolver/src/layer-watch.mts`）就是补这个依赖的，可它此前只被一次手工
探针背过（记录在仓库根 `proposal-prev-layer-rspack.md`「另补一条」，探针工件本身已删），而
`verify:chain` 只看 build 产物、既不读依赖表也不碰 watch，所以仓库里没有任何东西重跑这条判据 ——
本脚本把它变成每次 `pnpm verify` 都跑的一跑。机制全文在
`packages/plugin-prev-layer-resolver/docs/internals.md`「层目录的上下文依赖」，这里不抄第二份。

**为什么第二趟只认 watcher 自己发起的那一次**：`watching.invalidate()` 会让 bundler 重新 stat 一遍
磁盘（实测：规则拿掉之后 `invalidate()` 照样能把新文件拿到），拿它当触发器，反向对照就成了自证。
所以写完新组件就等编译器自己发那一次重编译，等不到判红 —— 「等不到」正是要防的那个症状。

**反向对照（不带那条规则的那两趟）也在门禁里**：只有「规则在场 ⇒ 会重解析」而没有
「规则不在 ⇒ 不会重解析」，半 B 并不知道自己防的是什么。代价是每个 bundler 多等一个固定窗口
（`STALE_WINDOW_MS`），四趟实测 20 出头（判红的那几条要等满窗口，会更长一些）。

每一格判三件事：**起点**（第一趟真的没落上）—— 缺它时后半什么都说明不了；**半 A**（层目录进了
依赖表）—— 缺它时半 B 的红无处可归（是登记坏了还是判旧坏了）；**半 B**（新增文件真的换到了落点）
—— 缺它时半 A 只是一份自话自说的登记表。
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import webpack from 'webpack';

import { rspack } from '@docusaurus/faster';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const coreDist = path.join(root, 'packages/plugin-prev-layer-resolver/dist');

// `dist/` 是构建产物，类型检查不能依赖它存在，因此**类型从源码取、值从产物取**（同 `verify-chain.mts`）：
// 拼错产物名在这里就红，而不是到运行期才变成一个 undefined 的导入。
type LayerWatchModule =
  typeof import('../../packages/plugin-prev-layer-resolver/src/layer-watch.mts');
type ResolverModule =
  typeof import('../../packages/plugin-prev-layer-resolver/src/resolver.mts');
type ResolveTapModule =
  typeof import('../../packages/plugin-prev-layer-resolver/src/resolve-tap.mts');
type ThemeLayer =
  import('../../packages/plugin-prev-layer-resolver/src/types.mts').ThemeLayer;
const layerWatchModule: LayerWatchModule = await import(
  pathToFileURL(path.join(coreDist, 'layer-watch.mjs')).href
);
const resolverModule: ResolverModule = await import(
  pathToFileURL(path.join(coreDist, 'resolver.mjs')).href
);
const resolveTapModule: ResolveTapModule = await import(
  pathToFileURL(path.join(coreDist, 'resolve-tap.mjs')).href
);
const { layerWatchRule } = layerWatchModule;
const { PrevLayerResolverPlugin } = resolverModule;
const { PrevLayerResolveTapPlugin } = resolveTapModule;

/** 站点当前只配了一个 bundler，这一跑两个都要：两支的接线不同格，同一份判据才说明换 bundler 不换失效 */
type Bundler = 'rspack' | 'webpack';
const BUNDLERS: Bundler[] = ['webpack', 'rspack'];

/**
第一趟的硬上限。给到 30s 不是预计要这么久（实测 webpack 约 0.2s、rspack 约 0.1s），
而是这一趟含编译器自己的首次冷启动；超了就是编译器坏了，不是「再等等」。
*/
const FIRST_COMPILE_TIMEOUT_MS = 30_000;
/**
写完新组件之前先等这么久。不能省：编译器在头一趟之后还会再来一趟（watchpack 把「目录建好」和
「文件写进去」算两个事件），拿这一趟当基线的话，反向对照会把它的尾巴当成「新文件触发的重解析」而假绿。
*/
const SETTLE_MS = 1500;
/**
第二趟的窗口：正向实测最长约 1.6s（rspack）/ 0.4s（webpack），这里给四倍余量。
反向对照等的是同一个窗口 —— 窗口短于正向耗时就成了「反正没人来，所以没落地」。
*/
const STALE_WINDOW_MS = 6000;
/** 轮询步长：只影响「第几趟已经落地」这件事多快被发现，不参与任何判据 */
const POLL_MS = 50;

/** 两层夹具的目录名；`INNER_LANDING` 与它同源，改名字时只改这两行 */
const INNER_DIR_NAME = 'layer-inner';
const OUTER_DIR_NAME = 'layer-outer';
/** 内层那份新组件的定位串：判「落点有没有换到内层」只认它 */
const INNER_LANDING = `${INNER_DIR_NAME}/OnlyInner.js`;
/** 第二趟写进内层的那份新组件（目录形式与单文件形式都成立，取单文件少造一层） */
const NEW_COMPONENT =
  'export default function OnlyInner() {\n  return "inner";\n}\n';

/**
上下文依赖那把访问器在两边共有的那一格。

**为什么只取 `values()`**：webpack 给的是一只 `Set`，rspack 给的是原生背书的包装对象 ——
它有同名的 `has` / `values` / `size`，但**不是** `Set`，也没有 `forEach`、不可迭代
（rspack 的模块对象上更是根本没有 `contextDependencies`，恒空 —— 读不到不等于没登记，
见 `proposal-prev-layer-rspack.md`「另补一条」）。只认两边都在的那一格，判据才不会跟着包装形状漂。
*/
interface ContextDependencySetLike {
  values(): Iterable<string>;
}

/**
`Compilation` / `Stats` 里本脚本读的那几格，两个 bundler 共有的形状
（不引官方类型，理由同包内 `types.mts` 的 `ResolverLike`）。
*/
interface StatsShape {
  compilation: { contextDependencies?: ContextDependencySetLike };
  hasErrors(): boolean;
  toJson(options: { all: false; errors: true; modules: true }): {
    errors?: { message?: string }[];
    modules?: {
      identifier?: string;
      name?: string;
      nameForCondition?: string;
    }[];
  };
}

interface WatchingShape {
  close(callback: (error?: Error | null) => void): void;
}

/** `compiler.watch` 在两边共有的那一格 */
interface WatchableCompiler {
  watch(
    options: { aggregateTimeout: number },
    handler: (error: Error | null | undefined, stats: StatsShape) => void,
  ): WatchingShape;
}

/** 一趟编译读到的观测值 */
interface ObservedRun {
  /** 这一趟读到的上下文依赖（posix 绝对路径） */
  contextDirs: string[];
  /** 首行错误文本，只用于失败时的诊断打印 */
  firstError: string | undefined;
  /** 半 B 那一趟还得干净：落上了但换一条错法，不等于修好 */
  hasError: boolean;
  /** 图上有没有落进内层那份新组件 —— 「落点换没换」只认这一条 */
  landsInner: boolean;
}

/** 一次「两趟」跑完的结果 */
interface FixtureOutcome {
  first: ObservedRun;
  /** 第二趟里**落到了内层**的那一趟；没有就是 null —— 反向对照要的就是 null */
  landed: ObservedRun | null;
  /** 从写下新组件到那一趟结束的耗时；没落地时是窗口长度 */
  landedAfterMs: number;
  /** 层目录（posix 绝对路径），半 A 的期望值 */
  layerDirs: string[];
  /** 写完新组件之后编译器自己发过的趟数（没落地时也报，区分「没重编译」与「重编译了但没换落点」） */
  runsAfterWrite: number;
  /** 那些没换落点的趟里最后一趟的错误（诊断用） */
  staleError: string | undefined;
}

const toPosix = (p: string): string => p.replaceAll(path.sep, '/');

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
轮询到条件成立，或者等满窗口就走。

不抛也不回报：「等不到」正是这条判据要区分出来的那种结果，抛了反而把它和编译器崩溃混成一类；
回报一个布尔又会让「落没落地」有两处说得出答案的地方 —— 判据只从 `runs` 那一侧读。
*/
async function waitFor(
  condition: () => boolean,
  timeoutMs: number = STALE_WINDOW_MS,
): Promise<void> {
  for (let step = 0; step < Math.ceil(timeoutMs / POLL_MS); step += 1) {
    if (condition()) return;
    await sleep(POLL_MS);
  }
}

/** 打印一格的判据，判红时紧跟一条「往哪查」的提示；返回这一格是否成立 */
function check(label: string, isOk: boolean, hint: string): boolean {
  console.log(`   ${isOk ? '✅' : '❌'} ${label}`);
  if (!isOk) console.log(`      → ${hint}`);
  return isOk;
}

/**
读一趟编译的观测值。

上下文依赖的映射函数直接交给 `Array.from`：两边交回来的都只是「可迭代」这一条最弱前提
（见 {@link ContextDependencySetLike}），而迭代器方法在本仓的 TS lib 里还没有声明 ——
判据不该跟着某一边的包装形状走。
*/
function observe(stats: StatsShape): ObservedRun {
  const json = stats.toJson({ all: false, errors: true, modules: true });
  return {
    contextDirs: Array.from(
      stats.compilation.contextDependencies?.values() ?? [],
      (dir) => toPosix(dir),
    ),
    firstError: json.errors?.[0]?.message?.split('\n', 1)[0],
    hasError: stats.hasErrors(),
    landsInner: (json.modules ?? []).some((module) =>
      toPosix(
        module.identifier ?? module.nameForCondition ?? module.name ?? '',
      ).endsWith(INNER_LANDING),
    ),
  };
}

/**
造一份只用得上两层的假站点：内层 `layer-inner` 与外层 `layer-outer`（导入者在外层）。

第一趟时内层**还没有** `OnlyInner` —— 于是 `@theme-prev/OnlyInner` 交回官方解析、报一条真实的
Module not found：「层里新增文件」这一步才有东西可改，半 B 才看得见落点从「没有」换成「内层那份」。
*/
function createFixture(tag: string) {
  // realpath：层 `owner` 走的是 realpath 口径（见 docs/internals.md「层归属怎么判」），而临时目录
  // 在部分平台是软链；不真实化的话那条规则的 `include` 前缀判不中，半 A 会以「依赖表是空的」红掉。
  const staged = fs.mkdtempSync(
    path.join(os.tmpdir(), `prev-layer-context-${tag}-`),
  );
  const base = fs.realpathSync(staged);
  const inner = path.join(base, INNER_DIR_NAME);
  const outer = path.join(base, OUTER_DIR_NAME);
  fs.mkdirSync(inner);
  fs.mkdirSync(outer);
  const entry = path.join(outer, 'index.js');
  fs.writeFileSync(
    entry,
    "import OnlyInner from '@theme-prev/OnlyInner';\n\nexport default OnlyInner;\n",
  );

  // 层栈（内 → 外）就是 `PrevLayerResolverPlugin` 与 `layerWatchRule` 收的那份形状。这里直接摆两层，
  // 是为了把「解析判据」和「那条规则」单独拿出来跑；整站层栈的推导另由 `verify:chain` 与包内用例钉。
  const layers: ThemeLayer[] = [
    { exists: true, kind: 'plugin', name: INNER_DIR_NAME, owner: inner },
    { exists: true, kind: 'site', name: OUTER_DIR_NAME, owner: outer },
  ];

  return {
    base,
    entry,
    layers,
    newComponent: path.join(inner, 'OnlyInner.js'),
  };
}

/**
开编译器。两支各按自己那一格接线（webpack 走 `resolve.plugins`、rspack 走模块工厂解析前的
`beforeResolve`），判据仍是包内那一份 `resolveTarget`；`withRule` 决定交不交 `module.rules`
那一条 —— 反向对照只关这一个开关，别的都不动。
*/
function createCompiler(
  bundler: Bundler,
  fixture: ReturnType<typeof createFixture>,
  withRule: boolean,
): WatchableCompiler {
  const resolver = new PrevLayerResolverPlugin({ layers: fixture.layers });
  const rule = layerWatchRule(fixture.layers);
  const shared = {
    context: fixture.base,
    entry: { main: fixture.entry },
    // development 而不是 production：第二半判据靠的是「模块对象跨编译复用」这一层，
    // 生产那套持久缓存不是本判据要碰的东西（它的失效通路是另一条，见 docs/internals.md）。
    mode: 'development' as const,
    module: { rules: withRule && rule ? [rule] : [] },
    output: { path: path.join(fixture.base, 'out') },
  };

  if (bundler === 'webpack') {
    // `cache: { type: 'memory' }` 必须写明：`cache: false` 时每次整图重建、必然重新解析，
    // 半 B 就变成恒真 —— 反向对照再也红不起来，这条判据就没东西可判了（假绿）。
    return webpack({
      ...shared,
      cache: { type: 'memory' },
      resolve: { plugins: [resolver] },
    } as unknown as webpack.Configuration) as unknown as WatchableCompiler;
  }

  return rspack({
    ...shared,
    plugins: [new PrevLayerResolveTapPlugin(resolver)],
  }) as unknown as WatchableCompiler;
}

/**
跑一次两趟：编译 → 读依赖表 → 往内层写新组件 → 只等 watcher 自己发起的重编译。

编译器报错**不在这里判红**，交回调用方按 `withRule` 判：反向对照要的正是「它不动」。
*/
async function runFixture(
  bundler: Bundler,
  withRule: boolean,
): Promise<FixtureOutcome> {
  const fixture = createFixture(withRule ? bundler : `${bundler}-norule`);
  const runs: ObservedRun[] = [];
  let watching: WatchingShape | undefined;

  try {
    const compiler = createCompiler(bundler, fixture, withRule);
    const first = await new Promise<ObservedRun>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `${bundler} 第一趟编译在 ${FIRST_COMPILE_TIMEOUT_MS}ms 内没结束`,
            ),
          ),
        FIRST_COMPILE_TIMEOUT_MS,
      );
      watching = compiler.watch({ aggregateTimeout: 50 }, (error, stats) => {
        if (error) {
          clearTimeout(timer);
          reject(error);
          return;
        }
        const run = observe(stats);
        runs.push(run);
        // 只把**头一趟**交给调用方；之后的趟留在 `runs` 里，由第二半判据去翻
        if (runs.length > 1) return;
        clearTimeout(timer);
        resolve(run);
      });
    });

    await sleep(SETTLE_MS);
    const baseline = runs.length;
    const wroteAt = Date.now();
    fs.writeFileSync(fixture.newComponent, NEW_COMPONENT);
    // 轮询只为早退：判据看的是「有没有一趟落到内层」，等不到就是 null —— 那正是反向对照要的值
    await waitFor(() => runs.slice(baseline).some((run) => run.landsInner));

    const after = runs.slice(baseline);
    const landed = after.find((run) => run.landsInner) ?? null;
    return {
      first,
      landed,
      landedAfterMs: landed ? Date.now() - wroteAt : STALE_WINDOW_MS,
      layerDirs: fixture.layers.map((layer) => toPosix(layer.owner)),
      runsAfterWrite: after.length,
      staleError: after.findLast((run) => !run.landsInner)?.firstError,
    };
  } finally {
    // 显式收尾：watcher 没关成就在这里挂着，比漏一个句柄后「安静地退出」好查
    if (watching) {
      const current = watching;
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
      });
    }
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
}

/**
把一格（某个 bundler 的带规则 / 不带规则两趟）判完并打印；返回这一格是否成立。

**起点**与**半 A** 两支同判，只有期望值相反（半 A 在反向对照那一格期望「一个都没登记」）；
**半 B** 反过来：带规则时要求换到落点，反向对照时要求等满窗口都不落地。失败文案点名是哪一支、
哪一半，以及「往哪查」。
*/
function judge(
  bundler: Bundler,
  withRule: boolean,
  outcome: FixtureOutcome,
): boolean {
  const {
    first,
    landed,
    landedAfterMs,
    layerDirs,
    runsAfterWrite,
    staleError,
  } = outcome;

  // 半 B 断的是「落点从没有换成内层那份新文件」。第一趟就绿 = 夹具形状变了（内层已经提供了那个组件、
  // 或改写没交回官方解析），那时「第二趟也绿」什么都不说明 —— 所以先钉起点，四格都钉。
  let isOk = check(
    `起点 第一趟带一条真实的 Module not found（内层还没提供 OnlyInner）：${first.firstError ?? '(这一趟没有错误)'}`,
    first.hasError,
    '第一趟没报错：夹具不再处于「内层缺那个组件」的状态，半 B 无从判起（查 createFixture 与那句 specifier）。',
  );

  // 依赖表这一半两支只差期望方向：带规则时层目录必须都在，反向对照时必须一个都不在。
  // 于是判据写成「在不在表里」与「带不带规则」是否同向，一格只有一条这样的判断。
  const mismatched = layerDirs.filter(
    (dir) => first.contextDirs.includes(dir) !== withRule,
  );
  isOk =
    check(
      `半 A 第一趟的上下文依赖：${first.contextDirs.join(' , ') || '(空)'}${
        withRule ? '' : '（这一趟没带那条规则，本该为空）'
      }`,
      mismatched.length === 0,
      withRule
        ? `少了 ${mismatched.join(' , ')}：这条 module.rules 规则没把层目录登记成引用方的依赖` +
            '（查产物 layer-watch.mjs 的 include/test，或 loader 的 addContextDependency 这一格被 bundler 换了形状）。'
        : `规则不在却仍登记了 ${mismatched.join(' , ')}：要么本脚本的开关没起作用，` +
            '要么 bundler 现在自己会登记层目录 —— 前者修脚本，后者要重新想这两半判据还在防什么。',
    ) && isOk;

  if (!withRule) {
    return (
      check(
        landed === null
          ? `半 B 反向对照：${STALE_WINDOW_MS}ms 内没有任何一趟把落点换到 ${INNER_LANDING}（窗口内编译器自己跑了 ${runsAfterWrite} 趟）—— 半 B 判的确实是那条规则`
          : `半 B 反向对照没红：规则不在时 ${INNER_LANDING} 也在 ${landedAfterMs}ms 内被拿到了`,
        landed === null,
        '于是「半 B」不再为那条规则作证。两个成因都要先排掉再动判据：\n' +
          '        ① 这一跑是不是用了 invalidate() 当触发器（它会重新 stat 一遍磁盘，把陈旧状态洗掉）；\n' +
          '        ② bundler 是不是现在自己会重试解析失败的依赖（那是机制变了，docs/internals.md 那一节要重写）。',
      ) && isOk
    );
  }

  const landedOk = landed !== null && !landed.hasError;
  return (
    check(
      `半 B 写入 ${INNER_LANDING} 后 ${landedAfterMs}ms：${
        landed
          ? `编译器自己发了一趟，hasErrors=${landed.hasError}，落点${landedOk ? '换成' : '没换成'}内层那份新文件`
          : `${STALE_WINDOW_MS}ms 内没有一趟把落点换到内层（第二趟没来，或来了但仍报旧错）`
      }`,
      landedOk,
      `${bundler} 这一支的链停在旧落点上：层里新增文件没成为引用方的重新解析理由。
        半 A 同时红 = 依赖表没登记，这里必然不失效（先修那一半）；
        半 A 绿而这里红 = 登记上了但 bundler 不再按上下文依赖判旧（版本变了，去改 docs/internals.md「层目录的上下文依赖」那一节）。${
          runsAfterWrite > 0
            ? `
        窗口内自己跑了 ${runsAfterWrite} 趟但没换落点；最后一趟的错误：${staleError ?? '(无错误)'}`
            : ''
        }`,
    ) && isOk
  );
}

if (!fs.existsSync(path.join(coreDist, 'layer-watch.mjs'))) {
  // 判红而不是「跳过并说明」：退出码 0 会让什么都没验的一次运行看起来和全过一样
  console.log(
    '\n❌ 未找到 packages/plugin-prev-layer-resolver/dist/，请先执行 `pnpm build` 再运行本脚本。',
  );
  process.exit(1);
}

let isOk = true;
const startedAt = Date.now();
// 每个 bundler 先跑带规则那一格、再跑反向对照：只关 `module.rules` 那一个开关，别的都不动
for (const bundler of BUNDLERS) {
  for (const withRule of [true, false]) {
    console.log(
      `\n${bundler}${withRule ? '（带那条规则）' : '（反向对照：同一份判据，把那条规则拿掉）'}：`,
    );
    try {
      const outcome = await runFixture(bundler, withRule);
      isOk = judge(bundler, withRule, outcome) && isOk;
    } catch (error) {
      // 崩溃与「判据不成立」分开报：前者是这一格没跑完，不能替后者背书
      console.log(
        `   ❌ ${bundler}${withRule ? '' : '（反向对照）'}这一格没跑完：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      isOk = false;
    }
  }
}

console.log(
  `
读法：
- 半 A 看编译完成后 \`compilation.contextDependencies\` 里有没有那两层目录 —— 它是「层里多了个
  文件」能成为引用方重新解析理由的唯一通路（两支都靠 loader 的 addContextDependency；为什么不能
  在 beforeResolve 里 push 依赖，见 docs/internals.md「层目录的上下文依赖」末段）。
- 半 B 看往内层写一个新组件之后，引用方**自己**有没有重新解析并落到新文件上；
  反向对照那两趟判它的反面：规则不在时不许落地。
- 第一趟带一条真实的 Module not found 是设计如此（内层先不提供那个组件），不是这一跑坏了。
` +
    `耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s：${
      isOk ? '✅ 四格全部成立' : '❌ 有判据没成立（见上）'
    }`,
);

// 用 `process.exitCode` 而不是 `process.exit`：跑完就退出本身就是「没有句柄漏在外面」的证据
// （watcher 没关成功时脚本会挂在这里，而不是安静地返回一个退出码）。
process.exitCode = isOk ? 0 : 1;
