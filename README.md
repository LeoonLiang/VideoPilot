# VideoPilot · 视频随心控

一个轻量的 Chrome / Edge 视频控制插件。设置播放倍速，用 Z、X、S、D、R 控制网页视频，摆脱不好用的播放器控件。无需账号、后台服务或构建步骤。

[下载最新版本](https://github.com/LeoonLiang/VideoPilot/releases/latest) · [更新日志](CHANGELOG.md) · [发布流程运行记录](https://github.com/LeoonLiang/VideoPilot/actions/workflows/release.yml)

## 安装

1. 从 [GitHub Releases](https://github.com/LeoonLiang/VideoPilot/releases) 下载附件 **`VideoPilot.zip`**，解压到一个固定目录。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择解压后包含 **`manifest.json`** 的文件夹。使用源码时直接选择 `extension/`；本地打包后可以选择 `dist/VideoPilot/`。
4. 把 VideoPilot 固定到浏览器工具栏，刷新已经打开的视频页面。
5. 点击插件图标调整设置；关闭 popup、回到网页视频后使用快捷键。

下载时请选择 Release 附件 `VideoPilot.zip`；GitHub 自动生成的 `Source code` 是项目源码。更新插件时，将新版解压到原安装目录，在扩展管理页点击「重新加载」，再刷新视频页面。

## 键位

| 键 | 操作 | 默认值 |
| --- | --- | --- |
| Z | 后退 | 5 秒 |
| 短按 X | 松开时前进一次 | 5 秒 |
| 长按 X | 临时加速，松开恢复 | 按住 200 毫秒后切到 3× |
| S | 当前视频减速 | 每次 −0.1× |
| D | 当前视频加速 | 每次 +0.1× |
| R | 当前视频倍速重置 | 恢复为 1× |

Z 按下时后退一次；X 在短按松开时前进，长按加速期间及松开时都不会跳转。网页失焦、切换标签页、关闭插件或修改 popup 设置会取消本次 X 操作，恢复加速前的倍速，也不会补触发快进。不接管方向键或鼠标右键。

S / D / R 只改变当前选中的视频，不写入 popup 的全局默认倍速，也不改变播放 / 暂停状态。S / D 轻按调整 0.1×，按住则按照系统键盘重复节奏持续减速 / 加速，松开即停，范围为 0.25–4×。网页失焦或修改 popup 设置后，需重新按下才能继续调速。按住 X 时使用 S / D / R，会先结束本次 X 操作，再应用调速，随后松开 X 不会覆盖新的倍速。R 固定重置为 1×；popup 的「恢复默认」则恢复全部插件设置。

## popup 设置

- **日常播放速度**：1× / 1.25× / 1.5× / 2× 预设，或输入 0.25–4×。
- **长按加速**：0.25–8×，松开 X 后恢复加速前的实际倍速。
- **前进 / 后退**：分别设置 1–120 秒。
- **视频操作提示**：开关视频上方的短暂提示。
- **总开关**：停用快捷键，并恢复各视频在插件接管前的倍速。
- **恢复默认**：恢复全部设置，重新启用插件。

预设按钮立即保存；自定义数值在按 Tab 或离开输入框后保存。设置只保存在本机，在已打开的页面上实时生效。新出现的视频也会应用设置。

输入框、可编辑区域、中文输入法组合输入及带 Ctrl / ⌘ / Alt / Shift 的组合键不会触发控制。

## 多个视频与 iframe

快捷键每次控制当前页面或当前获得键盘焦点的 iframe 中的一个视频，优先级如下：

1. 全屏视频。
2. 最近点击或开始播放、且仍然可见的视频。
3. 可见且正在播放的视频；多个候选时选择画面最大的。
4. 可见的暂停视频中画面最大的。

想切换目标，先点击对应视频。日常倍速设置会应用到所有检测到的视频；跳转、快捷键调速和长按加速只影响选中的视频。X 从按下到松开始终使用按下时选中的视频，避免途中切换目标时误操作另一个视频。

iframe 中的视频同样支持，包括浏览器允许注入的跨域 iframe。先点击 iframe 里的播放器，让键盘焦点进入它。各 iframe 共用 popup 设置；外层页面收到的按键不会自动转发给 iframe。

## 适用范围

支持网页中的标准 HTML5 `<video>`，包括动态添加的视频、iframe 和已发现的开放 Shadow DOM。浏览器内部页面、扩展商店、封闭 Shadow DOM 或非 HTML5 播放器不支持。个别站点主动锁定倍速或较早拦截键盘时可能无法接管；直播只有在播放器提供可跳转区间时才能前进后退。原播放器的控件仍然可用。

本地文件视频需要在浏览器扩展详情里开启「允许访问文件网址」；无痕窗口也需要单独开启权限。

## 开发与验证

插件本身无运行依赖，修改 `extension/` 后在扩展管理页重新加载，并刷新视频页。

本地脚本需要 Node.js 22 或更新版本。打包和发布相关测试需要系统 `zip`、`unzip` 命令（macOS 和 GitHub 的 Ubuntu runner 已提供）。

```sh
npm test                # 核心行为、发布校验和真实打包测试，无需 npm install
npm run check           # 插件及发布脚本的 JavaScript 语法检查
npm install             # 安装浏览器测试依赖
npx playwright install chromium
npm run test:browser    # 真实视频、popup、实际 MV3 加载集成测试
npm run package         # 同时生成 dist/VideoPilot/ 和 dist/VideoPilot.zip
npm run release:prepare -- v1.0.1  # 校验版本并生成 dist/release-notes.md
```

可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定现有的 Chromium / Chrome for Testing。浏览器测试使用临时配置和本地生成的 30 秒测试视频，不读取个人浏览器数据。测试截图在 `artifacts/popup.png`。

## 自动发布到 GitHub

[release.yml](.github/workflows/release.yml) 在 **`v*` tag 被推送到 GitHub** 后运行；只在本地创建 tag 不会触发。支持稳定版 `vMAJOR.MINOR.PATCH`，例如 `v1.0.0`，暂不支持 `beta`、`rc` 等预发布后缀。

流程依次执行测试、语法检查、版本校验、提取更新说明、打包，然后创建 GitHub Release 并上传 `VideoPilot.zip`。它使用 GitHub 自动提供的 `GITHUB_TOKEN`，无需添加个人 token；仓库需要启用 Actions 并允许此工作流申请 `contents: write` 权限。

仓库地址为 `https://github.com/LeoonLiang/VideoPilot.git`。每次发布新版本，例如 `1.1.0`：

1. 将 `extension/manifest.json` 和 `package.json` 的 `version` 都改为 `1.1.0`。
2. 在 `CHANGELOG.md` 的 `Unreleased` 下新增版本条目，把此次修改写入其中：

   ```markdown
   ## [1.1.0] - 2026-10-01

   ### 新增

   - 支持新的快捷操作。

   ### 修复

   - 修复特定播放器的控制问题。
   ```

3. 运行本地检查并提交、推送：

   ```sh
   npm test
   npm run check
   npm run release:prepare -- v1.1.0
   npm run package
   git add extension/manifest.json package.json CHANGELOG.md
   git commit -m "chore: release 1.1.0"
   git push origin main
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```

   其他功能修改也需要先提交，tag 应指向包含本次全部修改的提交。

Release 正文只使用对应版本标题与下一个二级标题之间的 Markdown，保留「新增」「修复」等三级标题。`Unreleased`、其他版本和 Git 提交记录不会混入。版本不一致，或日志条目缺失、重复、为空时，工作流会失败并停止发布。

附件上传成功后才公开 Release。若上传失败，草稿会保留，修复运行环境后可在 Actions 中重新运行该次任务；已经公开的 Release 不会被重新运行覆盖。源码或 CHANGELOG 本身有误时，应修复后使用新的版本 tag。

如果 tag 已推送但没有产生运行，可使用 GitHub CLI 手动触发同一个 tag 的发布（先完成 `gh auth login`）：

```sh
gh workflow run release.yml --repo LeoonLiang/VideoPilot --ref v1.0.1
```

必须指定要发布的版本 tag；选择 `main` 分支会被版本校验拒绝。

本流程只发布到 GitHub Releases；浏览器扩展商店的上架需要另行操作。

## 文件

- `extension/shared.js`：设置校验、跳转边界、键盘长按控制。
- `extension/content.js`：视频发现、目标选择、网页设置同步与提示。
- `extension/popup.*`：设置界面。
- `tests/`：核心与真实浏览器测试。
- `scripts/package.cjs`：生成未压缩插件与 ZIP。
- `scripts/release-notes.cjs`：校验 tag、版本并提取更新说明。
- `.github/workflows/release.yml`：tag 触发的 GitHub Release 工作流。
- `CHANGELOG.md`：版本更新记录和 Release 正文来源。

唯一额外 API 权限是 `storage`。内容脚本需要在网页中运行以发现视频和接收快捷键；没有统计、网络上传或远程脚本。
