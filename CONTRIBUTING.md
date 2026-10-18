# Contributing / 贡献指南

Read the [capability boundaries](CAPABILITIES.md) and [verification record](docs/verification.md) first. Keep the English and Chinese READMEs in sync when changing user-facing behavior.

先阅读[能力边界](CAPABILITIES.md)与[验证记录](docs/verification.md)。修改用户可见行为时，请同步维护中英文 README。

```sh
npm ci --ignore-scripts
npm run test:all
```

Commit regenerated `companion/code.js` with its sources. Add focused regression tests for behavior changes. Distinguish simulated Figma tests from real-editor evidence. Do not commit tokens, `.npmrc`, private designs or local account/profile data.

生成后的 `companion/code.js` 应与源文件一起提交。行为变更请补充针对性的回归测试，明确区分模拟测试与实机证据，不要提交密钥、`.npmrc`、私人设计或本地账号与 profile 数据。

For bug reports, include host version, backend, steps, expected/actual results and sanitized error text. Do not automatically retry uncertain canvas mutations.

报告问题时，请提供宿主版本、后端、复现步骤、预期与实际结果，以及脱敏后的错误文本。结果未知的画布写入不应自动重试。
