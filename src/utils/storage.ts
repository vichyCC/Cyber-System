import { defaultState } from '../data/mockData';
import type { AlertHandlingOrder, AppState, ExportTask, InventorySalesDetail, ReplenishmentApplicationRecord } from '../types';

const STORAGE_KEY = 'sku-stock-alert-training-state';

export function loadState(): AppState {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  const now = Date.now();

  if (!saved) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(saved) as Partial<AppState>;

    const normalizeInventoryDetail = (row: InventorySalesDetail) => {
      const detail = row as Partial<InventorySalesDetail>;

      return {
        ...row,
        spec: detail.spec ?? detail.specification ?? '',
        sellableStock: detail.sellableStock ?? Math.max(detail.availableStock ?? 0, 0),
        sales7Days: detail.sales7Days ?? detail.sales7d ?? 0,
        unitPrice: detail.unitPrice ?? 19.9,
      };
    };
    const exportTasks = (parsed.exportTasks ?? defaultState.exportTasks).map((task) => {
      const taskDraft = task as Partial<ExportTask>;
      const status: ExportTask['status'] = task.status === '导出中' && taskDraft.estimatedFinishAtTimestamp && now < taskDraft.estimatedFinishAtTimestamp ? '导出中' : '已完成';

      return {
        ...task,
        status,
        dataRange: taskDraft.dataRange ?? '近7天',
        fileType: taskDraft.fileType ?? 'xlsx',
        fileName: taskDraft.fileName?.endsWith('.xlsx') ? task.fileName : 'SKU库存销售明细_近7天.xlsx',
        rows: (task.rows ?? []).map(normalizeInventoryDetail),
      };
    });
    const alertHandlingOrders = (parsed.alertHandlingOrders ?? defaultState.alertHandlingOrders).map((order) => ({
      ...order,
      status: (order as Partial<AlertHandlingOrder>).status ?? '待审核',
    }));
    const replenishmentApplications = (parsed.replenishmentApplications ?? defaultState.replenishmentApplications).map((record) => ({
      ...record,
      status: (record as Partial<ReplenishmentApplicationRecord>).status ?? '待审核',
    }));
    const inventorySalesDetails = (parsed.inventorySalesDetails ?? defaultState.inventorySalesDetails).map(normalizeInventoryDetail);

    return {
      ...defaultState,
      ...parsed,
      skus: parsed.skus ?? defaultState.skus,
      inventorySalesDetails,
      exportTasks,
      alertHandlingOrders,
      replenishmentApplications,
      rule: parsed.rule ?? defaultState.rule,
      logs: parsed.logs ?? defaultState.logs,
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  window.localStorage.removeItem(STORAGE_KEY);
}
