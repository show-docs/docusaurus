# 命中 frontmatter 的 `stoplight: true` 后（渲染哪份文档由 `oas3:` 给），这一层整页换成**一个
# iframe**：`@stoplight/elements`
# 跑在本包自己那条插件路由（`/stoplight-view`）上的一份独立文档里。它与 `theme-redoc` 的差别在
# 样式表：Redoc 的样式是运行期插进自己那份文档的 `<head>`，Elements 的是一份静态文件 ——
# 站点只有**一份**全站 css，每个页面都 `<link>` 同一个文件，iframe 拦不住它。所以这一层多做了
# 一步构建期处理：把 Elements 那份 css 从「打进全站 bundle」改成「单独一个产物」，只由框内那份
# 文档挂一条 `<link>`（口径见包 `docs/internals.md` 的「样式」一节）。
Feature: theme-stoplight

  Scenario: 命中页整页交给 iframe，Elements 在框里渲染
    Given 我打开 stoplight 示例页
    Then 这一页放的是一个 iframe，指向 stoplight 那条独立页面
    And Elements 在框里接管了这一屏，读的是本站那份 yaml
    When 我点开 Elements 左栏里的 orders 分组
    Then 三个接口都在 Elements 的左栏里
    When 我点开 Elements 左栏里的新建订单那条接口
    Then Elements 的详情面板换成那条接口，外层地址也跟着换
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 框的无障碍标题用的是页面自己的标题 "API 文档示例"
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And 框里那一屏不留下自己的滚动条
    And Elements 那条署名不出现
    And 「Try it」面板里那颗发送按钮不出现
    And 外层文档里没有 Elements 的痕迹
    And Elements 那份样式表只挂在框里
    And 站点自己的那几处样式不被 Elements 改写
    And 浏览器里没有运行期错误

  # 能发给别人的是**外层**那条地址：`/theme-stoplight/docs/stoplight-demo#/operations/createOrder`。hash 段不参与
  # 取文件，浏览器请求的还是这一页自己的那份 html，所以整页加载它回 200；页面起来之后那一段由
  # 框里那句 ready 换进框内那份文档（为什么不能靠外层在 iframe 的 load 事件上推，见
  # packages/theme-iframe/docs/iframe-protocol.md 的「对齐是两侧各推一次的」一节）。Elements 认 `operationId` 原样（大小写不变），与 Redoc 那段小写不同。
  Scenario: 那条接口的地址在静态产物里也打得开
    Given 我直达 stoplight 那条接口的地址
    Then Elements 在框里接管了这一屏，读的是本站那份 yaml
    And Elements 框里摆的是地址里那条接口
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And 浏览器里没有运行期错误

  # Elements 用的那套配色（`@stoplight/mosaic`）自己也有亮暗模式，判据是它存在 localStorage 里
  # 那份存档（`mosaic-theme`），并把 `data-theme` 写进 `<html>` —— 和站点那条属性**同名**。
  # 本层把站点这一头的亮暗随消息送进框内、写在那条属性上（见包 `docs/internals.md` 的「亮暗模式」一节）。
  # 实测两件事：操作系统的偏好换不了这一页；框里 Elements 自己那份存档说「亮色」也压不过
  # 站点送进来的暗色（它写在同一个属性上，但我们的写在它之后，且没人再调它那个开关）。
  Scenario: 亮暗模式跟站点走，不跟操作系统走
    Given 我按操作系统的深色偏好打开 stoplight 示例页
    Then 站点的亮暗模式不受操作系统影响
    And Elements 的配色不跟操作系统走
    When 我在框里那份文档上做个记号
    And 我把站点切成暗色
    Then 框里的配色跟着站点翻过去，那份文档没有重新加载
    And Elements 那一格也收到站点送进来的暗色
    And 暗色不是 Elements 自己那份存档选的
    And 站点自己的那几处样式在暗色下也不被 Elements 改写

  # 框内那条地址本身也是站点的一条页面：带着 `src` 就能独立打开（调试、别人点到它），
  # 缺了 `src` 就什么都不摆 —— 不能让一个人点一个空壳就跑出一个报错页。
  Scenario: 框内那条地址带着地址能独立打开，缺了就什么都不摆
    Given 我直接打开 stoplight 框内那条地址
    Then 这一页直接渲染 Elements
    And 这一页没有站点的 navbar
    When 我把 stoplight 框内那条地址里的 spec 去掉
    Then Elements 那一格不出现
    And 浏览器里没有运行期错误
