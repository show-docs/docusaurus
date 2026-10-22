import { normalizeLayerPath } from './layers.mts';
import {
  findIssuerLayerIndex,
  isSafeComponentName,
  matchSpecifier,
  resolveComponentInLayer,
  resolveIssuer,
} from './resolve.mts';
import type {
  LoggerLike,
  ResolveContextLike,
  ResolvedThemeTarget,
  ResolveRequestLike,
  ResolverLike,
  ThemeLayer,
} from './types.mts';

/**
`theme-fallback` 是 **stub 层**（`Root` / `Layout` / `Error` 等在官方 fallback 里都是空实现），
落点是它时必须告警 —— 否则看起来「解析成功」，拿到的却是 stub。文案只承担「为什么危险」：
是哪一层由调用方的模板拼，这里不重复层名（外部构造的 fallback 层可以叫任何名字）。
*/
const FALLBACK_NOTE = '官方链底的 stub 层，不是真实实现';

/**
两个缓存共用的上限策略：**超限就不再写入**（不淘汰、不抖动），退化成「现算」。超限的场景恰恰是
「键各不相同」，继续写只是把内存涨上去。
*/
const RESOLUTION_CACHE_MAX = 8192;
const REALPATH_CACHE_MAX = 4096;

/** 同一类告警最多逐条报几条，之后只按量级补报汇总（见 {@link warnSample}）。 */
const WARN_SAMPLE_LIMIT = 5;

/** 折叠汇总的补报点取 10 的幂：让「报出的数」与「触发点」重合。 */
const WARN_SUMMARY_BASE = 10;

/**
该不该补报折叠汇总；该的话返回「下一个补报点」，否则返回 null。取**严格大于当前折叠数**的最小幂，
同一个数字就不报两遍。不对外出口 —— 补报点对不对只在真实告警路径上看得见，由那条用例端到端钉住。
*/
function nextSummaryThreshold(
  current: number,
  suppressed: number,
): number | null {
  if (suppressed < current) return null;
  let step = WARN_SUMMARY_BASE;
  while (suppressed >= step) step *= WARN_SUMMARY_BASE;
  return step;
}

/** resolve hook 的回调（增强版 resolve 的 `callback` 形状） */
type ResolveCallback = (
  error?: Error | null,
  result?: ResolveRequestLike | null,
) => void;

type ResolveHookHandler = (
  request: ResolveRequestLike,
  resolveContext: ResolveContextLike,
  callback: ResolveCallback,
) => void;

/**
`resolveContext.stack`：enhanced-resolve 5.21+ 的 `StackEntry` 单向链表；
只用到「这条路走过没有」所需的两个字段（判等口径见 {@link stackHasEntry}）。
*/
interface StackEntryLike {
  name?: string;
  request?: string;
  parent?: StackEntryLike;
}

/**
「这条 `(name, request)` 是否已在栈上」，**比上游 `StackEntry#has` 粗**（上游还比七个字段）。
粗的方向是保守：同名的 `internal-resolve` 加上同一个绝对目标路径本就只可能来自同一条改写，
误判的代价是少改写一次、交回官方，不会静默回环。为什么不逐项复刻，
见 docs/internals.md「设计取舍」的「改写的『栈上判等』只看 `(name, request)`」。
*/
function stackHasEntry(
  // 收 `unknown`：这个值来自 webpack 内联的 `ResolveContext`，声明成我们的形状会让调用点
  // 不可赋值（同 `ResolverLike` 的理由）；运行时判形，读不到即「没走过」。
  stack: unknown,
  name: string,
  request: string,
): boolean {
  if (!stack) return false;
  for (
    let node = stack as StackEntryLike | undefined;
    node;
    node = node.parent
  ) {
    if (node.name === name && node.request === request) return true;
  }
  return false;
}

export interface PrevLayerResolverOptions {
  /** 层栈（由插件在初始化阶段推好后传入） */
  layers?: ThemeLayer[];
  logger?: LoggerLike;
  /**
  解析结果缓存的上限（默认 {@link RESOLUTION_CACHE_MAX}）。测试用：那两条判据要钉的是
  「越过上限就不再写入、且仍返回现算的正确结果」，而上限本身只是一个数 —— 按默认值去跑就是
  八千多次真实 fs 解析（实测 14s，慢机器上直接顶到 vitest 的 30s 超时），把上限交出去，
  同一条判据几十次就能跑完。生产路径不传它。
  */
  resolutionCacheMax?: number;
  /** realpath 缓存的上限，同上（默认 {@link REALPATH_CACHE_MAX}），也供那条判据把量收小 */
  realpathCacheMax?: number;
}

/**
让「多层主题链式包裹同一个组件」成立，且**不改动 @theme-original/X 的官方语义**。

官方 `@theme-original/X` 与 `@theme/X` 各是**每个组件一个全局值**，而链上每一层要的是「我自己
下面那一层」—— 多个消费者要多个答案，全局别名原理上无法同时满足，所以这里另起一个新的
`@theme-prev/*` specifier（为什么不改写官方别名、各别名的语义差在哪，见 `./README.md`）。

设层栈（内 → 外）为 `L0..Ln`、导入者在 `Li`：目标收在 `j < i` —— 「落点在导入者下方」是整套
机制无环（不会 OOM）的来源。层栈里没人提供该组件时交回官方解析（`@theme-prev/*` 官方不认识 ⇒
必定 `Module not found`）。因此只在「导入者属于某个已知层」且「目标不是自己」时改写 request，
其余情况一律 `callback()`：**最坏情况退化为官方语义，而不是构建失败**。
*/
export class PrevLayerResolverPlugin {
  logger: LoggerLike;
  layers: ThemeLayer[] = [];
  /**
  带上限的 `normalizeLayerPath`，见 {@link realpathCache}。箭头属性而不是方法：它被当值传给
  `findIssuerLayerIndex`（那里不该知道「谁在缓存」），方法形态传出去就丢了 `this`。
  */
  realpathOf = (p: string): string => {
    const hit = this.realpathCache.get(p);
    if (hit !== undefined) return hit;
    const normalized = normalizeLayerPath(p);
    if (this.realpathCache.size < this.realpathCacheMax)
      this.realpathCache.set(p, normalized);
    return normalized;
  };

  /** 解析结果缓存（只存正解，key 见 {@link resolveTarget}）；上限见 {@link resolutionCacheMax} */
  resolutionCache = new Map<string, ResolvedThemeTarget>();
  /** 这次实例的解析缓存上限，取值口径见 {@link PrevLayerResolverOptions.resolutionCacheMax} */
  resolutionCacheMax: number;
  /**
  已告警过的「不变量违规」—— 它是**真 bug 信号**（层栈推导错了），
  单独一份是为了让外部能断言「这次构建有没有出现真违规」；不承担防刷屏职责。
  */
  violations = new Set<string>();
  /**
  realpath 结果的缓存，**一份实例一份**（= 一次构建；为什么这个粒度够用，见 docs/internals.md
  「设计取舍」的「realpath 缓存与层栈推导都挂在实例上」）。要缓存是因为 `findIssuerLayerIndex`
  每层、每次请求都 realpath 一次，而 `resolutionCache` 只按「完全相同 issuer」命中：
  唯一 issuer 的站点要付「层数 × 请求数」次同步 syscall（一次构建的请求是万级的）。
  */
  private realpathCache = new Map<string, string>();
  /** {@link PrevLayerResolverOptions.realpathCacheMax}，与 {@link resolutionCacheMax} 同一套口径 */
  private realpathCacheMax: number;
  /**
  告警去重集合（「同一句话别说第二遍」），与 {@link violations} 分开。**没有上限**：高基数可变内容
  （issuer 路径、用户写的组件名）必须走 {@link warnSample}，低基数罕见的失败路径才用 {@link warn}。
  */
  private warnedMessages = new Set<string>();
  /** 「同类告警」的计数（键是类别，不是完整消息）—— 防刷屏要的是「已说了多少条同类」 */
  private warnCounts = new Map<string, number>();
  /**
  每个类别「下一次补折叠汇总」的阈值（见 {@link warnSample}）。必须与 {@link warnCounts} 一样
  按类别各存一份：共用一份会让攒得最快的那类把阈值推高，后出现的类别永远报不出汇总。
  */
  private nextSummaryAtFolded = new Map<string, number>();
  /**
  层栈指纹（{@link resolveTarget} 的 `cacheKey` 第一段）与它对应的层栈引用：
  实例被复用到第二个层栈时，没有指纹旧键就会命中、把上一个层栈的落点当成这一个的
  答案（静默错层）。引用没变就不重算。
  */
  private layersFingerprint = '';
  private fingerprintedLayers: ThemeLayer[] | undefined;

  constructor({
    layers = [],
    logger = console,
    resolutionCacheMax = RESOLUTION_CACHE_MAX,
    realpathCacheMax = REALPATH_CACHE_MAX,
  }: PrevLayerResolverOptions = {}) {
    this.logger = logger;
    this.layers = layers;
    this.resolutionCacheMax = resolutionCacheMax;
    this.realpathCacheMax = realpathCacheMax;
  }

  /**
  解析目标层下标；`-1` 表示层栈里没人提供该组件，`[-1, issuerIndex)` 之外的值不该出现
  （判据在调用方 `computeTarget`，这里不再各判一份）。
  */
  findTargetLayerIndex(issuerIndex: number, componentName: string): number {
    const { layers } = this;
    const provides = (i: number): boolean =>
      Boolean(resolveComponentInLayer(layers[i], componentName));

    for (let i = issuerIndex - 1; i >= 0; i -= 1) {
      if (provides(i)) return i;
    }
    return -1;
  }

  /** 告警（同一实例内同一句话只报一次，避免刷屏） */
  warn(message: string): void {
    if (this.warnedMessages.has(message)) return;
    this.warnedMessages.add(message);
    this.logger?.warn?.(message);
  }

  /**
  **按类别**限流的告警：同一类别最多逐条报 {@link WARN_SAMPLE_LIMIT} 次，之后按折叠量级
  （1 → 10 → 100 …）补报汇总，N 条同类告警只出 O(log N) 行。与 {@link warn} 的差别只在去重键：
  那条按完整消息（同一件事反复发生），这条按类别（同一类事发生在不同对象上，消息里带 issuer
  路径这类易变部分）。`summarize` 收到的是**本次被折叠的条数**，真实快照。
  
  @param category 类别键（不含易变部分，例如不要带具体路径）
  */
  warnSample(
    category: string,
    message: string,
    summarize: (suppressed: number) => string,
  ): void {
    const count = (this.warnCounts.get(category) ?? 0) + 1;
    this.warnCounts.set(category, count);
    if (count <= WARN_SAMPLE_LIMIT) {
      // 逐条报，但仍走同一份去重集合：同一条消息（同一个 issuer）只说一次
      this.warn(message);
      return;
    }
    // 超出采样上限：只在折叠数达到补报点时各报一次（1 → 10 → 100 …），其余静默。
    // 汇总**不走 `warn`**：它的键是完整消息，一旦文案在别处先被说过就会把它去重掉
    // —— 防刷屏装置不能漏掉自己唯一的汇总。
    const suppressed = count - WARN_SAMPLE_LIMIT;
    const nextSummaryAt = nextSummaryThreshold(
      this.nextSummaryAtFolded.get(category) ?? 1,
      suppressed,
    );
    if (nextSummaryAt === null) return;
    const summary = summarize(suppressed);
    this.warnedMessages.add(summary);
    this.logger?.warn?.(summary);
    this.nextSummaryAtFolded.set(category, nextSummaryAt);
  }

  /**
  计算一次改写的目标文件；返回 null 表示「不改写，交回官方解析」。
  可测核心，`apply()` 只负责把它接到 webpack hook 上。
  */
  resolveTarget({
    request,
    issuer,
  }: {
    request?: string;
    issuer?: string;
  }): ResolvedThemeTarget | null {
    const prefix = matchSpecifier(request);
    if (!prefix) return null;
    // 拿不到 issuer 时不告警，就会把「上游 contextInfo 形态漂移」表现成和「写在层外」
    // 一样的 Module not found，而后者有告警。文案无可变内容，`warn` 去重后只出一行。
    if (!issuer) {
      this.warn(
        '[plugin-prev-layer-resolver] 匹配到 @theme-prev/* 但拿不到导入者（issuer），已交回官方解析。' +
          '通常是上游不再把 contextInfo 挂成 request.context，请升级 plugin-prev-layer-resolver。',
      );
      return null;
    }

    const componentName = request!.slice(prefix.length);
    if (!componentName) return null;
    // 组件名为何是不可信输入、拒哪些形状：判据在 `resolve.mts` 的 `isSafeComponentName`。
    // 告警走 warnSample：消息里带用户写的组件名，高基数时按完整消息去重会失效
    // （判据见 {@link warnedMessages}）。
    if (!isSafeComponentName(componentName)) {
      this.warnSample(
        'unsafe-component-name',
        `[plugin-prev-layer-resolver] 组件名不是安全的相对路径，已交回官方解析：\`${componentName}\`。` +
          '组件名只能是 `/` 分隔的相对片段（如 `DocItem/Footer`），不接受 `.` / `..` / 绝对路径 / 反斜杠。',
        (suppressed) =>
          `[plugin-prev-layer-resolver] 截至这里，另有 ${suppressed} 条「组件名不是安全的相对路径」的告警已被折叠` +
          '（首批已列出，见上；继续增长时按量级补报）。这些请求全部保持官方解析。',
      );
      return null;
    }
    // query/fragment 不属于组件名，但属于改写后的请求：官方别名对 `@theme/Logo?raw` 一样生效
    // 并把尾部带回（实测），故用裸名定位文件、把尾部拼回落点。切法同上游 `ParseModule`：
    // 第一个 `?` 或 `#` 起整段是尾部。
    const sep = componentName.search(/[?#]/);
    const base = sep < 0 ? componentName : componentName.slice(0, sep);
    const tail = sep < 0 ? '' : componentName.slice(sep);

    // 键的四段：层栈指纹 / 前缀 / 组件名（含尾部）/ issuer。分隔符必须取 NUL 而不是 `|`
    // （`|` 是合法文件名字符，能让两组字段划分撞进同一个键 = 静默错层），理由见 docs/internals.md
    // 「设计取舍」的「缓存键的分隔符取 NUL」。
    const cacheKey = `${this.fingerprint()}\0${prefix}\0${componentName}\0${issuer}`;
    const hit = this.resolutionCache.get(cacheKey);
    if (hit !== undefined) {
      // Watch 模式下组件文件可能新增、删除或切换扩展名；重新确认该层当前的
      // 官方赢家，避免永久缓存把旧文件路径钉死。
      const current = resolveComponentInLayer(
        this.layers[hit.targetIndex],
        base,
      );
      const cachedBase = tail ? hit.target.slice(0, -tail.length) : hit.target;
      if (current === cachedBase) return hit;
      this.resolutionCache.delete(cacheKey);
    }

    const result = this.computeTarget({
      componentName: base,
      issuer,
    });
    // 只缓存正解：这里没有任何失效路径，存过负结论就把「现在有了」永久钉死
    // （dev/watch 下不可恢复）；负结论每次现算，代价只是字符串比较 + 有限次 exists。
    const resolved =
      result && tail ? { ...result, target: result.target + tail } : result;
    if (resolved && this.resolutionCache.size < this.resolutionCacheMax)
      this.resolutionCache.set(cacheKey, resolved);
    return resolved;
  }

  computeTarget({
    componentName,
    issuer,
  }: {
    componentName: string;
    issuer: string;
  }): ResolvedThemeTarget | null {
    const { layers } = this;
    const issuerIndex = findIssuerLayerIndex(layers, issuer, this.realpathOf);
    // 导入者不在任何已知层里 → 保持官方行为（最常见的误用与两条真实退化路径的共同出口）。
    if (issuerIndex < 0) {
      // 按类别限流，而不是按完整消息：消息里带 issuer 路径，一个 pnpm 布局差异就能产生上千个
      // 不同的 issuer → 上千条「新消息」→ 去重失效、日志被刷满。三种成因同一条告警列全，
      // 判据与文案的理由见 README「告警」第 3 条。
      this.warnSample(
        'issuer-not-in-any-layer',
        `[plugin-prev-layer-resolver] ${requestLabel(componentName)} 的导入者不在任何主题层内：${issuer}。` +
          '该请求保持官方解析 —— 官方不认识这个 specifier，所以这里必定报 Module not found。' +
          '最常见的原因是把它写在了主题层目录**之外**的文件里（站点 pages / components、' +
          '自定义插件的运行时模块、公共工具模块都不在层内）：这些 specifier 只在发起导入的文件' +
          '物理位于某个主题层目录内时才有意义，请把包裹组件放进 `theme/` 目录。' +
          '另外两种可能：issuer 是软链路径（把真实目录也登记为层）、或层栈漏了层（查 `layersFromPlugins` 推导出的层栈）。',
        // 写「截至这里」而不是「一共」：resolve 是流式的，不知道批次何时结束，
        // 这个数只能是快照。
        (suppressed) =>
          `[plugin-prev-layer-resolver] 截至这里，另有 ${suppressed} 条「导入者不属于任何已知层」的告警已被折叠` +
          '（首批已列出，见上；继续增长时按量级补报）。整条 @theme-prev/* 对这些导入者都保持官方解析。',
      );
      return null;
    }

    const targetIndex = this.findTargetLayerIndex(issuerIndex, componentName);
    // 落点必须在导入者下方：`>=` 之外的一切都是同一条不变量违规，这里是它**唯一**的判据
    // （为什么取 `>=` 见 README「告警」第 2 条）。{@link findTargetLayerIndex} 的扫描
    // 条件本就保证成立，所以这条只由替换了它的子类触达。
    if (targetIndex >= issuerIndex) {
      this.reportInvariantViolation(componentName, issuerIndex, targetIndex);
      return null;
    }

    // `targetIndex < 0` = 导入者下方没有任何层提供该组件 → 交回官方解析。不回落 `@theme`：
    // 语义正好相反，理由见类文档。
    if (targetIndex < 0) return null;
    const targetLayer = layers[targetIndex]!;
    const target = resolveComponentInLayer(targetLayer, componentName);
    // 解析不到文件 → 交回官方解析（表现为真实的 Module not found，不静默产出坏产物）
    if (!target) return null;

    // 落到了 stub 层：告警一次，否则使用者会以为自己拿到的是实现。
    if (targetLayer.kind === 'fallback') {
      this.warn(
        `[plugin-prev-layer-resolver] ${requestLabel(componentName)} 的落点是 ${targetLayer.name}：${FALLBACK_NOTE}。` +
          '若你要的是真实实现，请确认链上确实有层提供该组件。',
      );
    }

    return {
      target,
      via: targetLayer.name,
      issuerIndex,
      targetIndex,
    };
  }

  /**
  入口 tap `resolve`，改写成绝对路径后从 `internal-resolve` 继续 —— 两个 hook 换一个就坏，
  各自的成因见 `./docs/internals.md`「两个 hook 的选择」。
  */
  apply(resolver: ResolverLike): void {
    // 能力自检 + 取出口 hook 是同一次调用：`ensureHook` 幂等，自检拿到的那份就是每次改写
    // 要用的那份，不必每条 request 再走一遍 Tapable。为什么要自检，见 README
    // 「告警」第 4 条。
    let target: ReturnType<ResolverLike['ensureHook']>;
    try {
      target = resolver.ensureHook('internal-resolve');
    } catch (error) {
      this.warn(
        '[plugin-prev-layer-resolver] 当前 resolver 没有 `internal-resolve` hook，`@theme-prev/*` 已整体禁用（保持官方解析）。' +
          '这通常意味着 enhanced-resolve / webpack 版本变了，请升级 plugin-prev-layer-resolver。',
      );
      // 不 tap：整条 `@theme-prev/*` 交回官方解析（表现为真实的 Module not found）
      this.logger?.warn?.(error);
      return;
    }

    resolver.getHook('resolve').tapAsync('PrevLayerResolverPlugin', ((
      request,
      resolveContext,
      callback: ResolveCallback,
    ) => {
      try {
        const resolved = this.resolveTarget({
          request: request.request,
          issuer: resolveIssuer(request),
        });
        if (!resolved) return callback();

        const nextRequest = {
          ...request,
          request: resolved.target,
          fullySpecified: false,
        };

        // 改写后 entry 不能与栈上已有 entry 判等，否则 `doResolve` 直接抛
        // `Recursion in resolving`。判等走上游口径（见 `stackHasEntry`），而改写只换
        // `request`；`ensureHook` 返回的 hook 带名字（与 `label` 同一个前提）。
        if (stackHasEntry(resolveContext?.stack, target.name!, resolved.target))
          return callback();

        const label = `${request.request} -> ${resolved.via}`;
        return resolver.doResolve(
          target,
          nextRequest,
          label,
          resolveContext,
          // 改写失败（例如目标文件其实不可解析）时交回官方解析，但必须告警：
          // 静默 `callback()` 会让「解析真的坏了」看起来和「本来就不该我管」一样。
          (
            error: Error | null | undefined,
            result: ResolveRequestLike | null | undefined,
          ) => {
            if (error || !result) {
              // 两半都有用例：`:` 由 doResolve 无 error 也无 result，`?` 由目标文件不可解析。
              this.warn(
                `[plugin-prev-layer-resolver] 改写后的请求解析失败，已交回官方解析：${request.request} -> ${resolved.target}${
                  error ? `（${error.message}）` : '（doResolve 未返回结果）'
                }`,
              );
              return callback();
            }
            return callback(null, result);
          },
        );
      } catch (error) {
        // 兜底：改写逻辑自己抛了异常（理论上不该发生）。同样不能静默 ——
        // 静默等于「链悄悄不生效」。
        this.warn(
          `[plugin-prev-layer-resolver] 改写 ${request.request ?? '<unknown>'} 时抛错，已交回官方解析：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return callback();
      }
    }) as ResolveHookHandler);
  }

  /** 当前层栈的指纹：层目录串（realpath 口径，与层栈推导一致） */
  private fingerprint(): string {
    if (this.layers !== this.fingerprintedLayers) {
      this.fingerprintedLayers = this.layers;
      this.layersFingerprint = this.layers
        .map((layer) => layer.owner)
        .join('\0');
    }
    return this.layersFingerprint;
  }

  /**
  登记并告警一次「不变量违规」：`targetIndex >= issuerIndex`。判据按**层**判而不按文件路径：
  层不等 ⇒ 文件必不等，判得更强，而路径比较两个方向都会错。理由与后果见 README
  「告警」第 2 条。
  */
  private reportInvariantViolation(
    componentName: string,
    issuerIndex: number,
    targetIndex: number,
  ): void {
    const { layers } = this;
    const where = layers[issuerIndex]?.name ?? `theme layer #${issuerIndex}`;
    const violation =
      `[plugin-prev-layer-resolver] 层栈不变量违规：\`${componentName}\`（${requestLabel(componentName)}）在层 ${where} 的落点` +
      `下标 ${targetIndex} 不小于导入者下标 ${issuerIndex}（正常情况下必须严格小于）。` +
      '这说明层栈推导有误，链路已停止改写，请查 `layersFromPlugins` 推导出的层栈。';
    // 单独登记：不变量违规是**真 bug 信号**，不与该构建里的普通告警混在一个集合里
    this.violations.add(violation);
    this.warn(violation);
  }
}

/** 告警里对 specifier 的可读称呼。 */
function requestLabel(componentName: string): string {
  return `@theme-prev/${componentName}`;
}
