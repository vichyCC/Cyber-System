export type RiskLevel = '紧急' | '偏低' | '健康' | '积压';

export type Warehouse = '华东仓' | '华南仓' | '华北仓' | '西南仓';

export type Category = '手机配件' | '办公耗材' | '家清日化' | '食品饮料' | '户外用品';

export type Store = '天猫旗舰店' | '京东自营店' | '抖音官方店' | '拼多多专营店' | '线下渠道店';

export type ProductStatus = '正常库存' | '低库存' | '高销量' | '滞销' | '超卖风险';

export type HandlingMethod = '申请补货' | '仓间调拨' | '暂停推广' | '设置缺货' | '暂不处理';

export type ReplenishmentImportWarehouse = '华东仓' | '华南仓' | '华北仓' | '华中仓';

export type ReplenishmentWarningLevel = '断货' | '高' | '中' | '低' | '正常';

export type ReplenishmentHandlingMethod = '补货' | '调拨' | '暂停推广' | '暂不处理';

export type SubmissionStatus = '待审核';

export interface SkuItem {
  id: string;
  name: string;
  category: Category;
  warehouse: Warehouse;
  stock: number;
  safetyStock: number;
  dailySales: number;
  inTransit: number;
  leadTimeDays: number;
  unitCost: number;
  owner: string;
  updatedAt: string;
}

export interface AlertRule {
  minDaysOfCover: number;
  urgentDaysOfCover: number;
  overstockDaysOfCover: number;
}

export interface PracticeLog {
  id: string;
  time: string;
  skuId: string;
  skuName: string;
  action: string;
  quantity: number;
  operator: string;
}

export interface InventorySalesDetail {
  id: string;
  store: Store;
  warehouse: Warehouse;
  skuCode: string;
  productName: string;
  spec: string;
  specification: string;
  category: Category;
  productStatus: ProductStatus;
  currentStock: number;
  lockedStock: number;
  sellableStock: number;
  availableStock: number;
  inTransitStock: number;
  sales7Days: number;
  unshippedOrders: number;
  sales7d: number;
  sales30d: number;
  safetyStock: number;
  supplier: string;
  owner: string;
  unitPrice: number;
  statDate: string;
}

export interface ExportTask {
  id: string;
  name: string;
  status: '导出中' | '已完成' | '处理中' | '待生成';
  createdAt: string;
  createdAtTimestamp?: number;
  estimatedFinishAtTimestamp?: number;
  creator: string;
  dataRange: string;
  fileType: 'xlsx';
  rowCount: number;
  fileName: string;
  rows: InventorySalesDetail[];
}

export interface AlertHandlingOrder {
  id: string;
  skuCode: string;
  productName: string;
  warehouse: Warehouse;
  availableStock: number;
  sales7d: number;
  daysOfCover: number;
  warningLevel: RiskLevel;
  handlingMethod: HandlingMethod;
  suggestedReplenishment: number;
  remark: string;
  createdAt: string;
  creator: string;
  status: SubmissionStatus;
}

export interface ReplenishmentImportRow {
  warehouse: ReplenishmentImportWarehouse;
  skuCode: string;
  productName: string;
  warningLevel: ReplenishmentWarningLevel;
  handlingMethod: ReplenishmentHandlingMethod;
  suggestedReplenishment: number;
  remark: string;
}

export interface ReplenishmentApplicationRecord {
  id: string;
  createdAt: string;
  creator: string;
  source: '批量导入';
  status: SubmissionStatus;
  totalRows: number;
  submittedRows: ReplenishmentImportRow[];
}

export interface AppState {
  skus: SkuItem[];
  inventorySalesDetails: InventorySalesDetail[];
  exportTasks: ExportTask[];
  alertHandlingOrders: AlertHandlingOrder[];
  replenishmentApplications: ReplenishmentApplicationRecord[];
  rule: AlertRule;
  logs: PracticeLog[];
}
