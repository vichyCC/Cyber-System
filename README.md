# 影刀练功房

这是一个 Vite + React + TypeScript + Tailwind CSS 项目，用于模拟后台管理风格的 SKU 库存预警实训系统。当前阶段为纯前端项目，数据来自本地 mock 数据和 localStorage，适合部署到 Netlify 静态站点。

## 功能

- 首页看板：库存指标、重点库存概览、实训任务提示
- 库存销售明细：筛选、分页、创建 Excel 导出任务
- 导出任务：模拟导出中/已完成状态，并下载 Excel
- 库存预警处理：按 SKU 自动带出库存信息并提交处理单
- 补货申请 / 批量导入：下载模板、上传 Excel、校验并生成记录
- 提交记录：查看手动提交和批量导入记录

## 本地运行

```bash
npm install
npm run dev
```

如果 Windows 终端提示 `pnpm` 不是内部或外部命令，可以使用 npm 命令运行。本项目也保留了 `pnpm-lock.yaml`，团队如统一使用 pnpm，也可以执行：

```bash
pnpm install
pnpm dev
```

## 生产构建

```bash
npm run build
```

构建产物输出目录：

```txt
dist
```

本地预览生产构建：

```bash
npm run preview
```

## Netlify 部署

当前项目已经提供 [netlify.toml](./netlify.toml)，Netlify 可直接读取部署配置：

```txt
Build command: npm run build
Publish directory: dist
Node version: 22
```

如果在 Netlify 控制台手动填写，请使用：

- Build command：`npm run build`
- Publish directory：`dist`
- Environment variables：按需配置 `VITE_API_BASE_URL`

项目已在 [public/_redirects](./public/_redirects) 中加入 SPA 回退规则：

```txt
/* /index.html 200
```

当前页面切换主要由前端状态完成，暂未使用 React Router。保留该规则是为了后续接入 history 路由时，刷新二级页面不会出现 Netlify 404。

## 环境变量

环境变量示例见 [.env.example](./.env.example)：

```env
VITE_API_BASE_URL=/api
```

当前没有真实后端，`VITE_API_BASE_URL` 可以保持 `/api` 或留空使用默认值。不要把密钥、数据库密码、服务端 token 等敏感信息放进前端环境变量或源码中。

## API 配置

未来接入后端 API 时，请统一从 [src/config/api.ts](./src/config/api.ts) 读取 API base URL，不要在组件里硬编码 `localhost`、IP 地址或测试域名。

示例：

```ts
import { buildApiUrl } from './config/api';

const url = buildApiUrl('/inventory');
```

建议后端统一挂载到 `/api`，便于后续使用 Netlify Functions、独立 API 服务或反向代理。

## Excel 导出文件说明

库存销售明细导出的文件名为 `SKU库存销售明细_近7天.xlsx`，工作簿包含 3 个 Sheet：

- `库存销售明细`
- `字段说明`
- `公式说明`

`库存销售明细` Sheet 是原始数据页，供学员和影刀操作，只包含 A:M 原始业务字段，不预置公式，不提前生成 N:T 列计算结果。学员需要用影刀在 N:T 列批量写入并填充公式。

`字段说明` Sheet 用于解释原始数据字段含义，帮助学员理解 A:M 每一列的业务含义。

`公式说明` Sheet 提供影刀需要写入的计算字段、目标列和公式，包括日均销量、可售天数、预警等级、建议补货量、处理方式、处理备注、建议补货金额。

训练流程建议：先用影刀打开导出的 Excel，获取数据总行数，写入 N1:T1 表头和 N2:T2 公式，再批量填充到最后一行。随后根据处理方式筛选“补货”和“暂停推广”的 SKU，生成导入模板后回到网页端批量上传。
