# Hello 示例插件

MemFlow 插件市场的最小示例（com.memflow.examples.hello @ 1.0.0）。

## 快速开始

```bash
# 1. 打包
node out/cli/memflow-plugin.cjs pack examples/hello-plugin

# 2. 提交到市场（需创作者 JWT；开发环境 --api http://localhost:8080）
node out/cli/memflow-plugin.cjs submit examples/hello-plugin \
  --token <JWT> --api http://localhost:8080

# 3. 管理端审核 approve 后，客户端插件市场一键安装
```

## 本地调试

拷贝本目录到 MemFlow 数据目录 `plugins/` 下，重启应用（开发模式未签名放行）。
