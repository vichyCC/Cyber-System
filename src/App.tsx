import { useEffect, useMemo, useState } from 'react';
import { Select } from '@arco-design/web-react';
import * as XLSX from 'xlsx';
import type {
  AlertHandlingOrder,
  AppState,
  Category,
  ExportTask,
  ReportFilters,
  HandlingMethod,
  InventorySalesDetail,
  ProductStatus,
  ReplenishmentApplicationRecord,
  ReplenishmentHandlingMethod,
  ReplenishmentImportRow,
  ReplenishmentImportWarehouse,
  ReplenishmentWarningLevel,
  RiskLevel,
  SkuItem,
  Store,
  Warehouse,
} from './types';
import { getLast7DaysRange, formatDataRange, inventoryFileName } from './utils/date';
import { loadState, saveState } from './utils/storage';
import { InventoryDateRangePicker } from './components/InventoryDateRangePicker';
import { ShippingRiskModule } from './modules/shipping-risk/ShippingRiskModule';
import yindaoLogo from './assets/yindao-logo.png';

type PageKey =
  | 'home'
  | 'dashboard'
  | 'report'
  | 'export'
  | 'alert'
  | 'replenishment'
  | 'records'
  | 'shipping-risk'
  | 'after-sales-center'
  | 'data-center';

interface MenuItem {
  key: PageKey;
  label: string;
  description: string;
}

interface MenuGroup {
  key: string;
  label: string;
  children: MenuItem[];
}

const pageMeta: Record<PageKey, MenuItem & { breadcrumb?: string }> = {
  home: { key: 'home', label: '首页', description: '业务中心功能导航' },
  dashboard: { key: 'dashboard', label: '首页看板', description: '库存概览与预警摘要', breadcrumb: 'SKU库存预警 / 首页看板' },
  alert: { key: 'alert', label: 'SKU库存预警', description: '处理缺货、偏低与积压风险', breadcrumb: 'SKU库存预警 / 预警处理' },
  report: { key: 'report', label: '库存销售明细', description: 'SKU 库存与销售数据查询', breadcrumb: 'SKU库存预警 / 库存销售明细' },
  export: { key: 'export', label: '导出任务', description: '查看报表导出进度', breadcrumb: 'SKU库存预警 / 导出任务' },
  replenishment: { key: 'replenishment', label: '补货申请', description: '创建补货单与导入文件', breadcrumb: 'SKU库存预警 / 补货申请' },
  records: { key: 'records', label: '提交记录', description: '查看业务操作提交历史', breadcrumb: 'SKU库存预警 / 提交记录' },
  'shipping-risk': { key: 'shipping-risk', label: '订单管理', description: '查询订单履约原始数据', breadcrumb: '发货风险监控 / 订单管理' },
  'after-sales-center': { key: 'after-sales-center', label: '售后管理', description: '售后业务功能入口' },
  'data-center': { key: 'data-center', label: '数据中心', description: '经营数据功能入口' },
};

const menuGroups: MenuGroup[] = [
  {
    key: 'sku-stock-alert',
    label: 'SKU库存预警',
    children: [pageMeta.dashboard, pageMeta.report, pageMeta.export, pageMeta.replenishment, pageMeta.records],
  },
  { key: 'shipping-risk', label: '发货风险监控', children: [pageMeta['shipping-risk']] },
];

const pageRoutes: Record<PageKey, string> = {
  home: '/',
  dashboard: '/inventory/dashboard',
  alert: '/inventory/alerts',
  report: '/inventory/report',
  export: '/inventory/exports',
  replenishment: '/inventory/replenishment',
  records: '/inventory/records',
  'shipping-risk': '/orders/shipping-risk',
  'after-sales-center': '/after-sales',
  'data-center': '/analytics',
};

const routePages: Record<string, PageKey> = Object.fromEntries(
  Object.entries(pageRoutes).map(([page, route]) => [route, page as PageKey]),
) as Record<string, PageKey>;

routePages['/shipping-risk'] = 'shipping-risk';

function getPageFromPathname(pathname: string): PageKey {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return routePages[normalizedPath] ?? 'home';
}

interface AlertFormState {
  skuCode: string;
  productName: string;
  warehouse: Warehouse | '';
  availableStock: number;
  sales7d: number;
  daysOfCover: number;
  warningLevel: RiskLevel;
  handlingMethod: HandlingMethod;
  suggestedReplenishment: number;
  remark: string;
}

interface ImportValidationFailure {
  rowNumber: number;
  errors: string[];
  raw: Record<string, unknown>;
}

interface ImportValidationResult {
  totalRows: number;
  validRows: ReplenishmentImportRow[];
  failures: ImportValidationFailure[];
}
const riskOrder: RiskLevel[] = ['紧急', '偏低', '健康', '积压'];
const stores: Array<Store | '全部店铺'> = ['全部店铺', '天猫旗舰店', '京东自营店', '抖音官方店', '拼多多专营店', '线下渠道店'];
const warehouses: Array<Warehouse | '全部仓库'> = ['全部仓库', '华东仓', '华南仓', '华北仓', '西南仓'];
const productStatuses: Array<ProductStatus | '全部状态'> = ['全部状态', '正常库存', '低库存', '高销量', '滞销', '超卖风险'];
const categories: Array<Category | '全部类目'> = ['全部类目', '手机配件', '办公耗材', '家清日化', '食品饮料', '户外用品'];
const handlingMethods: HandlingMethod[] = ['申请补货', '仓间调拨', '暂停推广', '设置缺货', '暂不处理'];
const replenishmentTemplateHeaders = ['仓库', 'SKU编码', '商品名称', '预警等级', '处理方式', '建议补货量', '备注'];
const validImportWarehouses: ReplenishmentImportWarehouse[] = ['华东仓', '华南仓', '华北仓', '华中仓'];
const validImportWarningLevels: ReplenishmentWarningLevel[] = ['断货', '高', '中', '低', '正常'];
const validImportHandlingMethods: ReplenishmentHandlingMethod[] = ['补货', '暂停推广', '暂不处理'];
const inventoryExportHeaders = ['店铺', '仓库', 'SKU编码', '商品名称', '规格', '类目', '可售库存', '在途库存', '近7天销量', '安全库存', '供应商', '商品负责人', '单价'];
const dashboardTaskHintStorageKey = 'sku-stock-alert-dashboard-task-hint-hidden';

function createDefaultReportFilters(): ReportFilters {
  return {
    store: '全部店铺',
    warehouse: '全部仓库',
    productStatus: '全部状态',
    category: '全部类目',
    ...getLast7DaysRange(),
    skuCode: '',
  };
}

const emptyAlertForm: AlertFormState = {
  skuCode: '',
  productName: '',
  warehouse: '',
  availableStock: 0,
  sales7d: 0,
  daysOfCover: 0,
  warningLevel: '健康',
  handlingMethod: '申请补货',
  suggestedReplenishment: 0,
  remark: '',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}

function nowText() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(/\//g, '-');
}

function getDaysOfCover(sku: SkuItem) {
  if (sku.dailySales <= 0) {
    return 999;
  }

  return (sku.stock + sku.inTransit) / sku.dailySales;
}

function getRiskLevel(sku: SkuItem, state: AppState): RiskLevel {
  const daysOfCover = getDaysOfCover(sku);

  if (daysOfCover <= state.rule.urgentDaysOfCover || sku.stock < sku.safetyStock * 0.5) {
    return '紧急';
  }

  if (daysOfCover < state.rule.minDaysOfCover || sku.stock < sku.safetyStock) {
    return '偏低';
  }

  if (daysOfCover >= state.rule.overstockDaysOfCover) {
    return '积压';
  }

  return '健康';
}

function getSuggestedReplenishment(sku: SkuItem, state: AppState) {
  const targetStock = Math.ceil(sku.dailySales * (state.rule.minDaysOfCover + sku.leadTimeDays));
  return Math.max(targetStock - sku.stock - sku.inTransit, 0);
}

function getRiskClass(level: RiskLevel) {
  const classes: Record<RiskLevel, string> = {
    紧急: 'bg-red-50 text-red-700 ring-red-200',
    偏低: 'bg-amber-50 text-amber-700 ring-amber-200',
    健康: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    积压: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  };

  return classes[level];
}

function getStatusClass(status: ProductStatus) {
  const classes: Record<ProductStatus, string> = {
    正常库存: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    低库存: 'bg-amber-50 text-amber-700 ring-amber-200',
    高销量: 'bg-blue-50 text-blue-700 ring-blue-200',
    滞销: 'bg-slate-100 text-slate-700 ring-slate-200',
    超卖风险: 'bg-red-50 text-red-700 ring-red-200',
  };

  return classes[status];
}

function filterInventoryRows(rows: InventorySalesDetail[], filters: ReportFilters) {
  const skuKeyword = filters.skuCode.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesStore = filters.store === '全部店铺' || row.store === filters.store;
    const matchesWarehouse = filters.warehouse === '全部仓库' || row.warehouse === filters.warehouse;
    const matchesStatus = filters.productStatus === '全部状态' || row.productStatus === filters.productStatus;
    const matchesCategory = filters.category === '全部类目' || row.category === filters.category;
    const matchesSku = !skuKeyword || row.skuCode.toLowerCase().includes(skuKeyword);
    const matchesStart = !filters.startDate || row.statDate >= filters.startDate;
    const matchesEnd = !filters.endDate || row.statDate <= filters.endDate;

    return matchesStore && matchesWarehouse && matchesStatus && matchesCategory && matchesSku && matchesStart && matchesEnd;
  });
}

function getInventoryWarningLevel(row: InventorySalesDetail): RiskLevel {
  const dailySales = row.sales7d / 7;
  const daysOfCover = dailySales > 0 ? row.availableStock / dailySales : 999;

  if (row.availableStock < 0 || row.productStatus === '超卖风险' || daysOfCover <= 3) {
    return '紧急';
  }

  if (row.productStatus === '低库存' || daysOfCover <= 7) {
    return '偏低';
  }

  if (row.productStatus === '滞销') {
    return '积压';
  }

  return '健康';
}

function getInventoryDaysOfCover(row: InventorySalesDetail) {
  const dailySales = row.sales7d / 7;

  if (dailySales <= 0) {
    return 999;
  }

  return Math.max(row.availableStock / dailySales, 0);
}

function getInventorySuggestedReplenishment(row: InventorySalesDetail) {
  return Math.max(row.safetyStock + row.sales7d * 2 - row.availableStock - row.inTransitStock, 0);
}

function normalizeCell(value: unknown) {
  return String(value ?? '').trim();
}

function downloadReplenishmentTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    replenishmentTemplateHeaders,
    ['华东仓', 'SKU-20000', 'Type-C 快充数据线', '高', '补货', 120, '模板示例，请按需修改或删除'],
  ]);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = replenishmentTemplateHeaders.map((header) => ({ wch: Math.max(header.length + 6, 14) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, '补货申请导入模板');
  XLSX.writeFile(workbook, '补货申请导入模板.xlsx');
}

function validateReplenishmentRows(rawRows: Record<string, unknown>[], systemRows: InventorySalesDetail[]): ImportValidationResult {
  const systemSkuCodes = new Set(systemRows.map((row) => row.skuCode));
  const validRows: ReplenishmentImportRow[] = [];
  const failures: ImportValidationFailure[] = [];

  rawRows.forEach((raw, index) => {
    const warehouse = normalizeCell(raw['仓库']);
    const skuCode = normalizeCell(raw['SKU编码']);
    const productName = normalizeCell(raw['商品名称']);
    const warningLevel = normalizeCell(raw['预警等级']);
    const handlingMethod = normalizeCell(raw['处理方式']);
    const suggestedReplenishmentText = normalizeCell(raw['建议补货量']);
    const suggestedReplenishment = Number(suggestedReplenishmentText);
    const remark = normalizeCell(raw['备注']);
    const errors: string[] = [];

    if (!skuCode) {
      errors.push('SKU编码不能为空');
    } else if (!systemSkuCodes.has(skuCode)) {
      errors.push('SKU编码必须存在于系统SKU数据中');
    }

    if (!warehouse) {
      errors.push('仓库不能为空');
    } else if (!validImportWarehouses.includes(warehouse as ReplenishmentImportWarehouse)) {
      errors.push('仓库必须是：华东仓、华南仓、华北仓、华中仓');
    }

    if (!validImportWarningLevels.includes(warningLevel as ReplenishmentWarningLevel)) {
      errors.push('预警等级必须是：断货、高、中、低、正常');
    }

    if (!validImportHandlingMethods.includes(handlingMethod as ReplenishmentHandlingMethod)) {
      errors.push('处理方式必须是：补货、暂停推广、暂不处理');
    }

    if (!suggestedReplenishmentText) {
      errors.push('建议补货量不能为空');
    } else if (!Number.isFinite(suggestedReplenishment) || suggestedReplenishment < 0) {
      errors.push('建议补货量必须为数字，且不能小于0');
    } else if (handlingMethod === '补货' && suggestedReplenishment <= 0) {
      errors.push('处理方式为补货时，建议补货量必须大于0');
    }

    if (errors.length > 0) {
      failures.push({
        rowNumber: index + 2,
        errors,
        raw,
      });
      return;
    }

    validRows.push({
      warehouse: warehouse as ReplenishmentImportWarehouse,
      skuCode,
      productName,
      warningLevel: warningLevel as ReplenishmentWarningLevel,
      handlingMethod: handlingMethod as ReplenishmentHandlingMethod,
      suggestedReplenishment,
      remark,
    });
  });

  return {
    totalRows: rawRows.length,
    validRows,
    failures,
  };
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activePage, setActivePage] = useState<PageKey>(() => getPageFromPathname(window.location.pathname));

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    function handlePopState() {
      setActivePage(getPageFromPathname(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const exportingTasks = state.exportTasks.filter((task) => task.status === '导出中');

    if (exportingTasks.length === 0) {
      return;
    }

    const now = Date.now();
    const expiredTaskIds = exportingTasks
      .filter((task) => task.estimatedFinishAtTimestamp && task.estimatedFinishAtTimestamp <= now)
      .map((task) => task.id);

    if (expiredTaskIds.length > 0) {
      setState((current) => ({
        ...current,
        exportTasks: current.exportTasks.map((task) => (expiredTaskIds.includes(task.id) ? { ...task, status: '已完成' } : task)),
      }));
    }

    const timers = exportingTasks
      .filter((task) => task.estimatedFinishAtTimestamp && task.estimatedFinishAtTimestamp > now)
      .map((task) =>
        window.setTimeout(() => {
          setState((current) => ({
            ...current,
            exportTasks: current.exportTasks.map((currentTask) => (currentTask.id === task.id ? { ...currentTask, status: '已完成' } : currentTask)),
          }));
        }, Math.max((task.estimatedFinishAtTimestamp ?? now) - now, 0)),
      );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.exportTasks]);

  const activeMenu = pageMeta[activePage];

  const skuRows = useMemo(() => {
    return state.skus
      .map((sku) => ({
        ...sku,
        risk: getRiskLevel(sku, state),
        daysOfCover: getDaysOfCover(sku),
        suggested: getSuggestedReplenishment(sku, state),
        inventoryValue: sku.stock * sku.unitCost,
      }))
      .sort((a, b) => riskOrder.indexOf(a.risk) - riskOrder.indexOf(b.risk));
  }, [state]);

  const stats = useMemo(() => {
    const alertCount = skuRows.filter((sku) => sku.risk === '紧急' || sku.risk === '偏低').length;
    const totalValue = skuRows.reduce((sum, sku) => sum + sku.inventoryValue, 0);
    const totalStock = skuRows.reduce((sum, sku) => sum + sku.stock, 0);
    const replenishment = skuRows.reduce((sum, sku) => sum + sku.suggested, 0);

    return { alertCount, totalValue, totalStock, replenishment };
  }, [skuRows]);

  function navigateToPage(page: PageKey) {
    const nextPath = pageRoutes[page];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setActivePage(page);
  }

  function createInventoryExportTask(rows: InventorySalesDetail[], filters: ReportFilters) {
    const dataRange = formatDataRange(filters.startDate, filters.endDate);
    const createdAtTimestamp = Date.now();
    const estimatedFinishAtTimestamp = createdAtTimestamp + 5000 + Math.floor(Math.random() * 5001);
    const createdAt = nowText();
    const task: ExportTask = {
      id: `EXPORT-${Date.now()}`,
      name: '库存销售明细导出',
      status: '导出中',
      createdAt,
      createdAtTimestamp,
      estimatedFinishAtTimestamp,
      creator: '实训学员',
      dataRange,
      startDate: filters.startDate,
      endDate: filters.endDate,
      queryFilters: { ...filters },
      fileType: 'xlsx',
      rowCount: rows.length,
      fileName: inventoryFileName(dataRange),
      rows: rows.map((row) => ({ ...row })),
    };

    setState((current) => ({
      ...current,
      exportTasks: [task, ...current.exportTasks],
    }));
    navigateToPage('export');
  }

  function createAlertHandlingOrder(order: Omit<AlertHandlingOrder, 'id' | 'createdAt' | 'creator' | 'status'>) {
    const createdAt = nowText();
    const newOrder: AlertHandlingOrder = {
      ...order,
      id: `ALERT-${Date.now()}`,
      createdAt,
      creator: '实训学员',
      status: '待审核',
    };

    setState((current) => ({
      ...current,
      alertHandlingOrders: [newOrder, ...current.alertHandlingOrders],
      logs: [
        {
          id: `LOG-${Date.now()}`,
          time: createdAt,
          skuId: newOrder.skuCode,
          skuName: newOrder.productName,
          action: '提交库存预警处理单',
          quantity: newOrder.suggestedReplenishment,
          operator: '实训学员',
        },
        ...current.logs,
      ].slice(0, 12),
    }));
  }

  function createReplenishmentApplication(rows: ReplenishmentImportRow[], totalRows: number) {
    const createdAt = nowText();
    const record: ReplenishmentApplicationRecord = {
      id: `REPLENISH-${Date.now()}`,
      createdAt,
      creator: '实训学员',
      source: '批量导入',
      status: '待审核',
      totalRows,
      submittedRows: rows,
    };

    setState((current) => ({
      ...current,
      replenishmentApplications: [record, ...current.replenishmentApplications],
      logs: [
        {
          id: `LOG-${Date.now()}`,
          time: createdAt,
          skuId: '批量导入',
          skuName: '补货申请',
          action: '提交补货申请导入',
          quantity: rows.length,
          operator: '实训学员',
        },
        ...current.logs,
      ].slice(0, 12),
    }));
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 w-72 border-r border-slate-200 bg-gradient-to-b from-white via-slate-50 to-blue-50/70 text-slate-900">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <div className="flex items-center gap-3">
            <img className="h-9 w-9 flex-none rounded-full object-cover shadow-sm ring-1 ring-slate-200" src={yindaoLogo} alt="影刀" />
            <div>
              <div className="text-lg font-bold text-slate-950">业务中心</div>
              <div className="text-xs text-slate-500">业务后台导航</div>
            </div>
          </div>
        </div>

        <nav className="space-y-3 p-4">
          {menuGroups.map((group) => {
            const groupActive = group.children.some((item) => item.key === activePage);

            return (
              <div key={group.key}>
                {group.label && (
                  <div className={`mb-1 px-3 text-xs font-bold ${groupActive ? 'text-blue-700' : 'text-slate-500'}`}>{group.label}</div>
                )}
                <div className="space-y-1">
                  {group.children.map((item) => {
                    const isActive = item.key === activePage;
                    const isChild = Boolean(group.label);

                    return (
                      <button
                        key={item.key}
                        className={`relative w-full rounded-lg py-2.5 text-left transition ${
                          isActive ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-white hover:text-blue-700 hover:shadow-sm'
                        } ${isChild ? 'pl-7 pr-3' : 'px-3'}`}
                        onClick={() => navigateToPage(item.key)}
                      >
                        {isActive && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-blue-600" />}
                        <div className={`text-sm ${isChild ? 'font-medium' : 'font-semibold'}`}>{item.label}</div>
                        {!isChild && <div className="mt-0.5 text-xs text-slate-400">{item.description}</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
          页面状态：前端本地维护
        </div>
      </aside>

      <div className="pl-72">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-8 shadow-sm">
          <div>
            <h1 className="text-lg font-bold text-slate-950">{activeMenu.label}</h1>
            {activeMenu.breadcrumb && <div className="text-xs text-slate-500">{activeMenu.breadcrumb}</div>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">实训学员</div>
              <div className="text-xs text-slate-500">当前用户</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">学</div>
          </div>
        </header>

        <main className="space-y-5 p-6">
          {activePage === 'home' && <BusinessCenterHomePage onNavigate={navigateToPage} />}
          {activePage === 'dashboard' && <DashboardPage skuRows={skuRows} stats={stats} />}
          {activePage === 'report' && <ReportPage rows={state.inventorySalesDetails} onCreateExportTask={createInventoryExportTask} />}
          {activePage === 'export' && <ExportTaskPage tasks={state.exportTasks} />}
          {activePage === 'alert' && <AlertPage rows={state.inventorySalesDetails} onSubmitOrder={createAlertHandlingOrder} />}
          {activePage === 'replenishment' && (
            <ReplenishmentPage rows={state.inventorySalesDetails} records={state.replenishmentApplications} onSubmitApplication={createReplenishmentApplication} />
          )}
          {activePage === 'records' && <RecordsPage logs={state.logs} orders={state.alertHandlingOrders} replenishmentApplications={state.replenishmentApplications} />}
          {activePage === 'shipping-risk' && <ShippingRiskModule />}
          {activePage === 'after-sales-center' && (
            <BusinessEntryPage title="售后管理" description="售后业务功能正在逐步接入，当前保留统一业务入口。" />
          )}
          {activePage === 'data-center' && <BusinessEntryPage title="数据中心" description="经营数据功能正在逐步接入，当前保留统一业务入口。" />}
        </main>
      </div>
    </div>
  );
}

function BusinessCenterHomePage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">业务中心</h2>
        <p className="mt-2 text-sm text-slate-500">选择自动化案例，进入对应的业务后台页面。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <button
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
          onClick={() => onNavigate('dashboard')}
        >
          <div className="text-base font-bold text-slate-950">SKU库存预警</div>
          <div className="mt-2 text-sm text-slate-500">查看库存看板、销售明细、导出任务、补货申请及提交记录。</div>
        </button>
        <button
          className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
          onClick={() => onNavigate('shipping-risk')}
        >
          <div className="text-base font-bold text-slate-950">发货风险监控</div>
          <div className="mt-2 text-sm text-slate-500">进入订单管理，查询订单状态与履约原始数据。</div>
        </button>
      </div>
    </section>
  );
}

function BusinessEntryPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <p className="mt-3 text-sm text-slate-500">{description}</p>
    </section>
  );
}

function DashboardPage({ skuRows, stats }: { skuRows: SkuRow[]; stats: DashboardStats }) {
  const [showTaskHint, setShowTaskHint] = useState(() => window.localStorage.getItem(dashboardTaskHintStorageKey) !== 'true');

  function handleCloseTaskHint() {
    window.localStorage.setItem(dashboardTaskHintStorageKey, 'true');
    setShowTaskHint(false);
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="预警SKU" value={`${stats.alertCount} 个`} hint="紧急与偏低库存" tone="red" />
        <MetricCard label="库存总件数" value={`${stats.totalStock} 件`} hint="当前可用库存汇总" tone="blue" />
        <MetricCard label="库存金额" value={formatCurrency(stats.totalValue)} hint="按库存成本估算" tone="emerald" />
        <MetricCard label="建议补货量" value={`${stats.replenishment} 件`} hint="按当前规则计算" tone="amber" />
      </section>

      <section>
        <SkuTable title="重点库存概览" skuRows={skuRows.slice(0, 10)} />
      </section>

      {showTaskHint && <FloatingTaskHint onClose={handleCloseTaskHint} />}
    </>
  );
}

function ReportPage({ rows, onCreateExportTask }: { rows: InventorySalesDetail[]; onCreateExportTask: (rows: InventorySalesDetail[], filters: ReportFilters) => void }) {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(createDefaultReportFilters);
  const [showTrainingNotice, setShowTrainingNotice] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredRows = useMemo(() => filterInventoryRows(rows, appliedFilters), [appliedFilters, rows]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const pagedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;

    return filteredRows.slice(start, start + pageSize);
  }, [currentPage, filteredRows, pageSize, totalPages]);
  const summary = useMemo(() => {
    return {
      total: filteredRows.length,
      availableStock: filteredRows.reduce((sum, row) => sum + row.sellableStock, 0),
      sales7d: filteredRows.reduce((sum, row) => sum + row.sales7Days, 0),
      riskCount: filteredRows.filter((row) => row.productStatus === '低库存' || row.productStatus === '超卖风险').length,
    };
  }, [filteredRows]);

  function updateFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    setCurrentPage(1);
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetFilters() {
    const defaults = createDefaultReportFilters();
    setFilters(defaults);
    setAppliedFilters(defaults);
    setCurrentPage(1);
  }

  return (
    <div className="space-y-4">
      {showTrainingNotice && <TrainingNoticeModal onClose={() => setShowTrainingNotice(false)} />}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="查询结果" value={`${summary.total} 条`} hint="当前筛选范围内 SKU" tone="blue" />
        <MetricCard label="可售库存" value={`${summary.availableStock} 件`} hint="当前库存扣除锁定库存" tone="emerald" />
        <MetricCard label="近7天销量" value={`${summary.sales7d} 件`} hint="用于识别高销量商品" tone="amber" />
        <MetricCard label="风险SKU" value={`${summary.riskCount} 个`} hint="低库存与超卖风险" tone="red" />
      </section>

      <div className="panel p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField label="店铺" value={filters.store} options={stores} onChange={(value) => updateFilter('store', value as ReportFilters['store'])} />
          <SelectField label="仓库" value={filters.warehouse} options={warehouses} onChange={(value) => updateFilter('warehouse', value as ReportFilters['warehouse'])} />
          <SelectField
            label="商品状态"
            value={filters.productStatus}
            options={productStatuses}
            onChange={(value) => updateFilter('productStatus', value as ReportFilters['productStatus'])}
          />
          <SelectField label="商品类目" value={filters.category} options={categories} onChange={(value) => updateFilter('category', value as ReportFilters['category'])} />
          <InventoryDateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={({ startDate, endDate }) => {
              setCurrentPage(1);
              setFilters((current) => ({
                ...current,
                startDate: startDate ?? '',
                endDate: endDate ?? '',
              }));
            }}
          />
          <InputField label="SKU编码" value={filters.skuCode} placeholder="请输入 SKU 编码" onChange={(value) => updateFilter('skuCode', value)} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="btn-secondary" onClick={resetFilters}>
            重置
          </button>
          <button className="btn-secondary" onClick={() => onCreateExportTask(filteredRows, appliedFilters)}>
            导出Excel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setAppliedFilters({ ...filters });
              setCurrentPage(1);
            }}
          >
            查询
          </button>
        </div>
      </div>

      <InventorySalesTable
        rows={pagedRows}
        total={filteredRows.length}
        currentPage={Math.min(currentPage, totalPages)}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setCurrentPage(1);
        }}
      />
    </div>
  );
}

function ExportTaskPage({ tasks }: { tasks: ExportTask[] }) {
  return (
    <div className="panel overflow-hidden">
      <TableTitle title="导出任务列表" description="导出任务在前端生成，点击下载后使用 xlsx 库生成 Excel 文件。" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-5 py-3">任务名称</th>
              <th className="px-5 py-3">创建时间</th>
              <th className="px-5 py-3">数据范围</th>
              <th className="px-5 py-3">文件类型</th>
              <th className="px-5 py-3">状态</th>
              <th className="px-5 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => {
              const isCompleted = task.status !== '导出中';

              return (
                <tr key={task.id}>
                  <td className="px-5 py-4 font-semibold text-slate-950">{task.name}</td>
                  <td className="px-5 py-4 text-slate-600">{task.createdAt}</td>
                  <td className="px-5 py-4 text-slate-600">
                    {task.dataRange}
                    <span className="ml-2 text-xs text-slate-400">共 {task.rowCount} 条</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{task.fileType.toUpperCase()}</td>
                  <td className="px-5 py-4">
                    {isCompleted ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">已完成</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                        <span className="h-2 w-2 animate-spin rounded-full border border-blue-300 border-t-blue-700" />
                        导出中
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <button className="btn-secondary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50" disabled={!isCompleted} onClick={() => downloadExcel(task)}>
                      {isCompleted ? '下载' : '生成中'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainingNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-950">实训提示</h3>
        </div>
        <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
          <p>本页面用于模拟电商后台库存销售明细查询与导出。请先选择查询条件并导出Excel，下载后的表格将作为影刀批量填充公式、筛选重点SKU、生成补货处理清单的练习数据。</p>
          <div className="space-y-2 rounded-md bg-blue-50 p-4 text-blue-800">
            <div>1. 【库存销售明细】导出的是原始业务数据，不预置公式；</div>
            <div>2. 学员需要用影刀在Excel中批量写入并填充公式；</div>
            <div>3. 处理完成后，可将结果整理为补货申请导入模板并回填系统。</div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200 px-6 py-4">
          <button className="btn-primary" onClick={onClose}>
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertPage({
  rows,
  onSubmitOrder,
}: {
  rows: InventorySalesDetail[];
  onSubmitOrder: (order: Omit<AlertHandlingOrder, 'id' | 'createdAt' | 'creator' | 'status'>) => void;
}) {
  const [form, setForm] = useState<AlertFormState>(emptyAlertForm);
  const [skuMessage, setSkuMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const alertRows = rows.filter((row) => row.productStatus === '低库存' || row.productStatus === '超卖风险' || row.productStatus === '滞销').slice(0, 8);

  function fillBySkuCode(value: string) {
    const skuCode = value.trim();
    const matchedSku = rows.find((row) => row.skuCode.toLowerCase() === skuCode.toLowerCase());

    setSuccessMessage('');

    if (!skuCode) {
      setSkuMessage('');
      setForm(emptyAlertForm);
      return;
    }

    if (!matchedSku) {
      setSkuMessage('未找到该 SKU，请确认编码是否正确。');
      setForm((current) => ({
        ...emptyAlertForm,
        skuCode,
        handlingMethod: current.handlingMethod,
      }));
      return;
    }

    setSkuMessage('已自动带出 SKU 库存与销量信息。');
    setForm((current) => ({
      ...current,
      skuCode,
      productName: matchedSku.productName,
      warehouse: matchedSku.warehouse,
      availableStock: matchedSku.availableStock,
      sales7d: matchedSku.sales7d,
      daysOfCover: getInventoryDaysOfCover(matchedSku),
      warningLevel: getInventoryWarningLevel(matchedSku),
      suggestedReplenishment: getInventorySuggestedReplenishment(matchedSku),
    }));
  }

  function submitOrder() {
    if (!form.skuCode || !form.productName || !form.warehouse) {
      setSuccessMessage('');
      setSkuMessage('请先输入有效的 SKU 编码。');
      return;
    }

    onSubmitOrder({
      skuCode: form.skuCode,
      productName: form.productName,
      warehouse: form.warehouse,
      availableStock: form.availableStock,
      sales7d: form.sales7d,
      daysOfCover: form.daysOfCover,
      warningLevel: form.warningLevel,
      handlingMethod: form.handlingMethod,
      suggestedReplenishment: form.suggestedReplenishment,
      remark: form.remark,
    });
    setSuccessMessage('提交成功，已生成库存预警处理单。');
  }

  return (
    <div className="space-y-4">
      {successMessage && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{successMessage}</div>}
      <div className="panel p-5">
        <div className="mb-5">
          <h3 className="text-base font-bold text-slate-950">新建处理单</h3>
          <p className="mt-1 text-sm text-slate-500">输入 SKU 编码后，系统会自动带出商品、仓库、库存和销量信息。</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">SKU编码</div>
            <input
              className="field w-full"
              value={form.skuCode}
              placeholder="例如 SKU-20001"
              onChange={(event) => {
                const skuCode = event.target.value;
                setForm((current) => ({ ...current, skuCode }));
                fillBySkuCode(skuCode);
              }}
            />
            {skuMessage && <div className={`mt-1 text-xs ${form.productName ? 'text-emerald-600' : 'text-red-600'}`}>{skuMessage}</div>}
          </label>
          <ReadonlyField label="商品名称" value={form.productName} />
          <ReadonlyField label="仓库" value={form.warehouse} />
          <ReadonlyField label="当前可售库存" value={form.productName ? String(form.availableStock) : ''} />
          <ReadonlyField label="近7天销量" value={form.productName ? String(form.sales7d) : ''} />
          <ReadonlyField label="可售天数" value={form.productName ? `${form.daysOfCover.toFixed(1)} 天` : ''} />
          <ReadonlyField label="预警等级" value={form.productName ? form.warningLevel : ''} />
          <SelectField
            label="建议处理方式"
            value={form.handlingMethod}
            options={handlingMethods}
            onChange={(value) => setForm((current) => ({ ...current, handlingMethod: value as HandlingMethod }))}
          />
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">建议补货量</div>
            <input
              className="field w-full"
              type="number"
              min={0}
              value={form.suggestedReplenishment}
              onChange={(event) => setForm((current) => ({ ...current, suggestedReplenishment: Math.max(Number(event.target.value) || 0, 0) }))}
            />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <div className="mb-2 text-sm font-semibold text-slate-700">备注</div>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              value={form.remark}
              placeholder="请输入处理说明，例如补货原因、调拨来源或暂不处理理由。"
              onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              setForm(emptyAlertForm);
              setSkuMessage('');
              setSuccessMessage('');
            }}
          >
            重置
          </button>
          <button className="btn-primary" onClick={submitOrder}>
            提交处理单
          </button>
        </div>
      </div>

      <InventoryAlertReferenceTable rows={alertRows} />
    </div>
  );
}

function ReplenishmentPage({
  rows,
  records,
  onSubmitApplication,
}: {
  rows: InventorySalesDetail[];
  records: ReplenishmentApplicationRecord[];
  onSubmitApplication: (rows: ReplenishmentImportRow[], totalRows: number) => void;
}) {
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [submitValidOnly, setSubmitValidOnly] = useState(false);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const canSubmit = Boolean(validation && validation.totalRows > 0 && (validation.failures.length === 0 || (submitValidOnly && validation.validRows.length > 0)));

  function handleFileUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    setFileName(file.name);
    setMessage('');
    setSubmitValidOnly(false);

    reader.onload = (event) => {
      const data = event.target?.result;

      if (!data) {
        setMessage('文件读取失败，请重新上传。');
        return;
      }

      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      const result = validateReplenishmentRows(rawRows, rows);

      setValidation(result);
      setMessage('Excel 已解析，请查看校验结果。');
    };

    reader.onerror = () => {
      setMessage('文件读取失败，请重新上传。');
    };

    reader.readAsArrayBuffer(file);
  }

  function submitApplication() {
    if (!validation || !canSubmit) {
      return;
    }

    onSubmitApplication(validation.validRows, validation.totalRows);
    setMessage('提交成功，已生成补货申请记录。');
  }

  return (
    <div className="space-y-6">
      {message && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">{message}</div>}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-950">批量导入补货申请</h3>
            <p className="mt-1 text-sm text-slate-500">请先下载模板，按字段填写后上传 Excel，系统会进行逐行校验。</p>
          </div>
          <button className="btn-secondary" onClick={downloadReplenishmentTemplate}>
            下载导入模板
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700">上传Excel</div>
              <div className="mt-1 text-xs text-slate-500">支持 `.xlsx` 文件，表头需包含：{replenishmentTemplateHeaders.join('、')}</div>
              {fileName && <div className="mt-2 text-xs font-semibold text-blue-700">当前文件：{fileName}</div>}
            </div>
            <label className="btn-primary cursor-pointer">
              选择文件
              <input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => handleFileUpload(event.target.files?.[0])} />
            </label>
          </div>
        </div>
      </div>

      {validation && (
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="总行数" value={`${validation.totalRows} 行`} hint="上传文件中的数据行" tone="blue" />
          <MetricCard label="通过行数" value={`${validation.validRows.length} 行`} hint="可提交的数据" tone="emerald" />
          <MetricCard label="失败行数" value={`${validation.failures.length} 行`} hint="需修正后重新上传" tone="red" />
        </div>
      )}

      {validation && validation.failures.length > 0 && (
        <div className="panel overflow-hidden">
          <TableTitle title="失败数据明细" description="以下行未通过校验，请根据错误原因修正模板内容。" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">行号</th>
                  <th className="px-5 py-3">SKU编码</th>
                  <th className="px-5 py-3">仓库</th>
                  <th className="px-5 py-3">错误原因</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validation.failures.map((failure) => (
                  <tr key={failure.rowNumber}>
                    <td className="px-5 py-4 font-semibold text-slate-950">{failure.rowNumber}</td>
                    <td className="px-5 py-4 text-slate-600">{normalizeCell(failure.raw['SKU编码']) || '-'}</td>
                    <td className="px-5 py-4 text-slate-600">{normalizeCell(failure.raw['仓库']) || '-'}</td>
                    <td className="px-5 py-4 text-red-700">{failure.errors.join('；')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {validation && (
        <div className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                type="checkbox"
                checked={submitValidOnly}
                disabled={validation.failures.length === 0 || validation.validRows.length === 0}
                onChange={(event) => setSubmitValidOnly(event.target.checked)}
              />
              仅提交通过数据
            </label>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setValidation(null);
                  setSubmitValidOnly(false);
                  setMessage('');
                  setFileName('');
                }}
              >
                清空结果
              </button>
              <button className="btn-primary disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canSubmit} onClick={submitApplication}>
                提交补货申请
              </button>
            </div>
          </div>
          {validation.failures.length > 0 && !submitValidOnly && (
            <div className="mt-3 text-sm text-amber-700">存在失败数据时，需要勾选“仅提交通过数据”后才允许提交。</div>
          )}
        </div>
      )}

      <div className="panel overflow-hidden">
        <TableTitle title="补货申请记录" description="提交后生成的补货申请记录会保存到 localStorage。" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3">提交时间</th>
                <th className="px-5 py-3">来源</th>
                <th className="px-5 py-3">导入总行数</th>
                <th className="px-5 py-3">提交行数</th>
                <th className="px-5 py-3">创建人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-5 py-4 text-slate-600">{record.createdAt}</td>
                  <td className="px-5 py-4 text-slate-600">{record.source}</td>
                  <td className="px-5 py-4 text-slate-600">{record.totalRows}</td>
                  <td className="px-5 py-4 font-semibold text-blue-700">{record.submittedRows.length}</td>
                  <td className="px-5 py-4 text-slate-600">{record.creator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">暂无补货申请记录。</div>}
      </div>
    </div>
  );
}

function RecordsPage({ logs, orders, replenishmentApplications }: { logs: AppState['logs']; orders: AlertHandlingOrder[]; replenishmentApplications: ReplenishmentApplicationRecord[] }) {
  const records = useMemo(() => {
    const manualRecords = orders.map((order) => ({
      id: order.id,
      applicationNo: order.id,
      submittedAt: order.createdAt,
      submitter: order.creator,
      source: '手动回填',
      skuCount: 1,
      handlingMethod: order.handlingMethod,
      status: order.status ?? '待审核',
      details: [
        {
          skuCode: order.skuCode,
          productName: order.productName,
          warehouse: order.warehouse,
          warningLevel: order.warningLevel,
          handlingMethod: order.handlingMethod,
          suggestedReplenishment: order.suggestedReplenishment,
          remark: order.remark,
        },
      ],
    }));
    const batchRecords = replenishmentApplications.map((record) => {
      const methods = Array.from(new Set(record.submittedRows.map((row) => row.handlingMethod)));

      return {
        id: record.id,
        applicationNo: record.id,
        submittedAt: record.createdAt,
        submitter: record.creator,
        source: '批量导入',
        skuCount: record.submittedRows.length,
        handlingMethod: methods.length > 1 ? '多种方式' : (methods[0] ?? '-'),
        status: record.status ?? '待审核',
        details: record.submittedRows.map((row) => ({
          skuCode: row.skuCode,
          productName: row.productName,
          warehouse: row.warehouse,
          warningLevel: row.warningLevel,
          handlingMethod: row.handlingMethod,
          suggestedReplenishment: row.suggestedReplenishment,
          remark: row.remark,
        })),
      };
    });

    return [...manualRecords, ...batchRecords].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [orders, replenishmentApplications]);
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '');
  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0];

  return (
    <div className="space-y-6">
      <div className="panel overflow-hidden">
        <TableTitle title="提交记录" description="统一展示手动回填和批量导入生成的处理记录，状态默认待审核。" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3">申请单号</th>
                <th className="px-5 py-3">提交时间</th>
                <th className="px-5 py-3">提交人</th>
                <th className="px-5 py-3">来源方式</th>
                <th className="px-5 py-3">SKU数量</th>
                <th className="px-5 py-3">处理方式</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-blue-50/40">
                  <td className="px-5 py-4 font-semibold text-slate-950">{record.applicationNo}</td>
                  <td className="px-5 py-4 text-slate-600">{record.submittedAt}</td>
                  <td className="px-5 py-4 text-slate-600">{record.submitter}</td>
                  <td className="px-5 py-4 text-slate-600">{record.source}</td>
                  <td className="px-5 py-4 font-semibold text-blue-700">{record.skuCount}</td>
                  <td className="px-5 py-4 text-slate-600">{record.handlingMethod}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">{record.status}</span>
                  </td>
                  <td className="px-5 py-4">
                    <button className="btn-secondary h-8 px-3" onClick={() => setSelectedId(record.id)}>
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {records.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">暂无提交记录。</div>}
      </div>

      {selectedRecord && (
        <div className="panel overflow-hidden">
          <TableTitle title="SKU明细" description={`申请单号：${selectedRecord.applicationNo}，来源方式：${selectedRecord.source}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">SKU编码</th>
                  <th className="px-5 py-3">商品名称</th>
                  <th className="px-5 py-3">仓库</th>
                  <th className="px-5 py-3">预警等级</th>
                  <th className="px-5 py-3">处理方式</th>
                  <th className="px-5 py-3">建议补货量</th>
                  <th className="px-5 py-3">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedRecord.details.map((detail) => (
                  <tr key={`${selectedRecord.id}-${detail.skuCode}`}>
                    <td className="px-5 py-4 font-semibold text-slate-950">{detail.skuCode}</td>
                    <td className="px-5 py-4 text-slate-700">{detail.productName || '-'}</td>
                    <td className="px-5 py-4 text-slate-600">{detail.warehouse}</td>
                    <td className="px-5 py-4 text-slate-600">{detail.warningLevel}</td>
                    <td className="px-5 py-4 text-slate-600">{detail.handlingMethod}</td>
                    <td className="px-5 py-4 font-semibold text-blue-700">{detail.suggestedReplenishment}</td>
                    <td className="px-5 py-4 text-slate-600">{detail.remark || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <TableTitle title="操作日志" description="记录当前实训过程中的关键操作。" />
        <div className="divide-y divide-slate-100">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <div className="font-semibold text-slate-950">{log.action}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {log.skuName} · 数量 {log.quantity} · {log.operator}
                </div>
              </div>
              <div className="text-sm text-slate-500">{log.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type SkuRow = SkuItem & {
  risk: RiskLevel;
  daysOfCover: number;
  suggested: number;
  inventoryValue: number;
};

type DashboardStats = {
  alertCount: number;
  totalValue: number;
  totalStock: number;
  replenishment: number;
};

function InventorySalesTable({
  rows,
  total,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  rows: InventorySalesDetail[];
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < totalPages;

  return (
    <div className="panel overflow-hidden">
      <TableTitle title="库存销售明细" description="主数据仅展示影刀自动化处理需要的 13 个原始业务字段，不预置公式结果。" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1450px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">店铺</th>
              <th className="px-4 py-3">仓库</th>
              <th className="px-4 py-3">SKU编码</th>
              <th className="px-4 py-3">商品名称</th>
              <th className="px-4 py-3">规格</th>
              <th className="px-4 py-3">类目</th>
              <th className="px-4 py-3">可售库存</th>
              <th className="px-4 py-3">在途库存</th>
              <th className="px-4 py-3">近7天销量</th>
              <th className="px-4 py-3">安全库存</th>
              <th className="px-4 py-3">供应商</th>
              <th className="px-4 py-3">商品负责人</th>
              <th className="px-4 py-3">单价</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40">
                <td className="px-4 py-3 text-slate-700">{row.store}</td>
                <td className="px-4 py-3 text-slate-700">{row.warehouse}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">{row.skuCode}</td>
                <td className="px-4 py-3 text-slate-700">{row.productName}</td>
                <td className="px-4 py-3 text-slate-600">{row.spec}</td>
                <td className="px-4 py-3 text-slate-600">{row.category}</td>
                <td className={`px-4 py-3 font-semibold ${row.sellableStock <= 0 ? 'text-red-700' : 'text-slate-950'}`}>{row.sellableStock}</td>
                <td className="px-4 py-3 text-slate-600">{row.inTransitStock}</td>
                <td className="px-4 py-3 text-slate-600">{row.sales7Days}</td>
                <td className="px-4 py-3 text-slate-600">{row.safetyStock}</td>
                <td className="px-4 py-3 text-slate-600">{row.supplier}</td>
                <td className="px-4 py-3 text-slate-600">{row.owner}</td>
                <td className="px-4 py-3 text-slate-600">{row.unitPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600">
        <div>共 {total} 条</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field h-9 w-28 py-1" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <button className="btn-secondary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canGoPrevious} onClick={() => onPageChange(1)}>
            首页
          </button>
          <button className="btn-secondary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canGoPrevious} onClick={() => onPageChange(safePage - 1)}>
            上一页
          </button>
          <span className="px-2 font-semibold text-slate-700">
            {safePage} / {totalPages}
          </span>
          <button className="btn-secondary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canGoNext} onClick={() => onPageChange(safePage + 1)}>
            下一页
          </button>
          <button className="btn-secondary h-8 px-3 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canGoNext} onClick={() => onPageChange(totalPages)}>
            末页
          </button>
        </div>
      </div>
      {rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">暂无符合条件的数据，请调整筛选条件。</div>}
    </div>
  );
}

function SkuTable({ title, skuRows, showAction = false }: { title: string; skuRows: SkuRow[]; showAction?: boolean }) {
  return (
    <div className="panel overflow-hidden">
      <TableTitle title={title} description="当前页面使用本地 mock 数据渲染，后续可替换为接口数据。" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-5 py-3">SKU / 商品</th>
              <th className="px-5 py-3">仓库</th>
              <th className="px-5 py-3">库存</th>
              <th className="px-5 py-3">安全库存</th>
              <th className="px-5 py-3">日销</th>
              <th className="px-5 py-3">可售天数</th>
              <th className="px-5 py-3">风险</th>
              <th className="px-5 py-3">建议补货</th>
              {showAction && <th className="px-5 py-3">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {skuRows.map((sku) => (
              <tr key={sku.id} className="hover:bg-blue-50/40">
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-950">{sku.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {sku.id} · {sku.category} · {sku.owner}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">{sku.warehouse}</td>
                <td className="px-5 py-4 font-semibold text-slate-950">{sku.stock}</td>
                <td className="px-5 py-4 text-slate-600">{sku.safetyStock}</td>
                <td className="px-5 py-4 text-slate-600">{sku.dailySales}</td>
                <td className="px-5 py-4 text-slate-600">{sku.daysOfCover.toFixed(1)} 天</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getRiskClass(sku.risk)}`}>{sku.risk}</span>
                </td>
                <td className="px-5 py-4 font-semibold text-blue-700">{sku.suggested}</td>
                {showAction && (
                  <td className="px-5 py-4">
                    <button className="btn-secondary h-8 px-3">处理</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      <Select
        className="inventory-arco-select"
        options={options.map((option) => ({ label: option, value: option }))}
        triggerProps={{
          className: 'inventory-arco-select-popup',
          getPopupContainer: () => document.body,
          popupStyle: { zIndex: 70 },
          position: 'bl',
        }}
        value={value}
        onChange={(nextValue: string | number) => onChange(String(nextValue))}
      />
    </div>
  );
}

function InputField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      <input className="field w-full" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      <input className="field w-full bg-slate-50 text-slate-500" value={value} readOnly />
    </label>
  );
}

function InventoryAlertReferenceTable({ rows }: { rows: InventorySalesDetail[] }) {
  return (
    <div className="panel overflow-hidden">
      <TableTitle title="预警 SKU 参考" description="可复制下方 SKU 编码到新建处理单中，系统会自动带出库存与销量信息。" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-5 py-3">SKU编码</th>
              <th className="px-5 py-3">商品名称</th>
              <th className="px-5 py-3">仓库</th>
              <th className="px-5 py-3">可售库存</th>
              <th className="px-5 py-3">近7天销量</th>
              <th className="px-5 py-3">可售天数</th>
              <th className="px-5 py-3">预警等级</th>
              <th className="px-5 py-3">建议补货量</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const warningLevel = getInventoryWarningLevel(row);

              return (
                <tr key={row.id} className="hover:bg-blue-50/40">
                  <td className="px-5 py-4 font-semibold text-slate-950">{row.skuCode}</td>
                  <td className="px-5 py-4 text-slate-700">{row.productName}</td>
                  <td className="px-5 py-4 text-slate-600">{row.warehouse}</td>
                  <td className={`px-5 py-4 font-semibold ${row.availableStock < 0 ? 'text-red-700' : 'text-slate-950'}`}>{row.availableStock}</td>
                  <td className="px-5 py-4 text-slate-600">{row.sales7d}</td>
                  <td className="px-5 py-4 text-slate-600">{getInventoryDaysOfCover(row).toFixed(1)} 天</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getRiskClass(warningLevel)}`}>{warningLevel}</span>
                  </td>
                  <td className="px-5 py-4 font-semibold text-blue-700">{getInventorySuggestedReplenishment(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'red' | 'blue' | 'emerald' | 'amber' }) {
  const toneClasses = {
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        <div className={`rounded-md px-2 py-1 text-xs font-bold ${toneClasses[tone]}`}>实时</div>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </div>
  );
}

function TableTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function TaskHint({ index, text }: { index: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-slate-50 p-3">
      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index}</div>
      <div>{text}</div>
    </div>
  );
}

function FloatingTaskHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-30 w-[340px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">实训任务提示</h3>
          <p className="mt-1 text-xs text-slate-500">完成以下步骤，熟悉库存预警处理流程。</p>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={onClose}
          aria-label="关闭实训任务提示"
        >
          ×
        </button>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <TaskHint index="1" text="查看首页看板，识别需要优先处理的预警 SKU。" />
        <TaskHint index="2" text="进入库存预警处理页，确认紧急与偏低库存原因。" />
        <TaskHint index="3" text="在库存销售明细页筛选数据，并创建导出任务。" />
      </div>
    </div>
  );
}

function FormField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-700">{label}</div>
      <input className="field w-full" defaultValue={value} />
    </label>
  );
}

function downloadExcel(task: ExportTask) {
  const workbook = XLSX.utils.book_new();
  const mainRows = task.rows.map((row) => [
    row.store,
    row.warehouse,
    row.skuCode,
    row.productName,
    row.spec,
    row.category,
    row.sellableStock,
    row.inTransitStock,
    row.sales7Days,
    row.safetyStock,
    row.supplier,
    row.owner,
    row.unitPrice,
  ]);
  const mainSheet = XLSX.utils.aoa_to_sheet([inventoryExportHeaders, ...mainRows]);
  const fieldSheet = XLSX.utils.aoa_to_sheet([
    ['字段名', '所在列', '字段类型', '是否原始字段', '业务说明', '示例值'],
    ['店铺', 'A', '文本', '是', '商品所属的电商店铺，用于区分不同销售渠道。', '抖音旗舰店'],
    ['仓库', 'B', '文本', '是', 'SKU当前所属仓库，用于后续按仓库拆分处理清单。', '华东仓'],
    ['SKU编码', 'C', '文本', '是', '商品规格编码，是网页回填和批量导入时的关键字段。', 'SKU-10001'],
    ['商品名称', 'D', '文本', '是', '用于识别商品。', '洁面乳100ml'],
    ['规格', 'E', '文本', '是', '用于区分颜色、容量、尺码、口味等规格。', '100ml'],
    ['类目', 'F', '文本', '是', '商品所属类别，可用于后续汇总分析。', '美妆'],
    ['可售库存', 'G', '数字', '是', '系统当前显示可用于销售的库存，是判断库存风险的核心字段。', 36],
    ['在途库存', 'H', '数字', '是', '已经采购或调拨但尚未入仓的库存，计算建议补货量时需要扣除。', 20],
    ['近7天销量', 'I', '数字', '是', '最近7天的销售数量，用于计算日均销量。', 70],
    ['安全库存', 'J', '数字', '是', '系统设置的最低库存警戒线。', 30],
    ['供应商', 'K', '文本', '是', 'SKU对应供应商，可用于补货汇总。', 'A供应商'],
    ['商品负责人', 'L', '文本', '是', '负责该商品的运营人员。', '张三'],
    ['单价', 'M', '数字', '是', '商品单价，用于计算建议补货金额。', 29.9],
  ]);
  const formulaRows = [
    ['计算字段', '目标列', '公式', '业务说明'],
    ['日均销量', 'N', '=ROUND(I2/7,2)', '近7天销量除以7，用于判断每天平均消耗多少库存。'],
    ['可售天数', 'O', '=IF(N2=0,999,ROUND(G2/N2,1))', '可售库存除以日均销量，用于判断库存还能卖多少天。若日均销量为0，则用999表示近期无销量，暂不按缺货处理。'],
    ['预警等级', 'P', '=IF(G2<=0,"断货",IF(O2<3,"高",IF(O2<7,"中",IF(G2<J2,"低","正常"))))', '先判断是否断货，再判断3天内高风险、7天内中风险，最后判断是否低于安全库存。'],
    ['建议补货量', 'Q', '=MAX(0,ROUNDUP(N2*14-G2-H2,0))', '按14天目标备货量计算建议补货数量，并扣除当前可售库存和在途库存。'],
    ['处理方式', 'R', '=IF(P2="断货","暂停推广",IF(OR(P2="高",P2="中"),"补货","暂不处理"))', '断货SKU建议暂停推广，高/中风险SKU建议补货，低风险和正常SKU暂不处理。'],
    ['处理备注', 'S', '=IF(R2="补货","可售天数"&O2&"天，建议补货"&Q2&"件",IF(R2="暂停推广","当前可售库存不足，建议暂停推广","无需处理"))', '自动生成可回填到网页系统的处理说明。'],
    ['建议补货金额', 'T', '=Q2*M2', '建议补货量乘以单价，用于后续管理汇总。'],
  ];
  const formulaSheet = XLSX.utils.aoa_to_sheet(formulaRows);

  prepareWorksheet(mainSheet, [14, 12, 16, 24, 12, 12, 12, 12, 12, 12, 18, 14, 12]);
  prepareWorksheet(fieldSheet, [14, 10, 12, 14, 48, 18]);
  prepareWorksheet(formulaSheet, [16, 10, 58, 56]);
  setAutoFilter(mainSheet);

  for (let index = 0; index < task.rows.length; index += 1) {
    const skuCell = mainSheet[`C${index + 2}`];

    if (skuCell) {
      skuCell.t = 's';
      skuCell.z = '@';
    }
  }
  for (let rowIndex = 2; rowIndex <= formulaRows.length; rowIndex += 1) {
    const formulaCell = formulaSheet[`C${rowIndex}`];

    if (formulaCell) {
      formulaCell.t = 's';
    }
  }

  XLSX.utils.book_append_sheet(workbook, mainSheet, '库存销售明细');
  XLSX.utils.book_append_sheet(workbook, fieldSheet, '字段说明');
  XLSX.utils.book_append_sheet(workbook, formulaSheet, '公式说明');
  workbook.Props = { Subject: `数据范围：${task.dataRange}` };
  XLSX.writeFile(workbook, task.fileName || inventoryFileName(task.dataRange));
}

function prepareWorksheet(worksheet: XLSX.WorkSheet, widths: number[]) {
  worksheet['!cols'] = widths.map((width) => ({ wch: width }));
  (worksheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = { xSplit: 0, ySplit: 1 };

  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1');
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];

    if (cell) {
      cell.s = {
        font: {
          bold: true,
        },
      };
    }
  }
}

function setAutoFilter(worksheet: XLSX.WorkSheet) {
  if (!worksheet['!ref']) {
    return;
  }

  worksheet['!autofilter'] = {
    ref: worksheet['!ref'],
  };
}
