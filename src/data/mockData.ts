import type { AlertRule, AppState, Category, ExportTask, InventorySalesDetail, ProductStatus, SkuItem, Store, Warehouse } from '../types';

export const defaultRule: AlertRule = {
  minDaysOfCover: 14,
  urgentDaysOfCover: 7,
  overstockDaysOfCover: 60,
};

export const mockSkus: SkuItem[] = [
  {
    id: 'SKU-10086',
    name: 'Type-C 快充数据线 1m',
    category: '手机配件',
    warehouse: '华东仓',
    stock: 186,
    safetyStock: 320,
    dailySales: 42,
    inTransit: 120,
    leadTimeDays: 5,
    unitCost: 9.8,
    owner: '林佳',
    updatedAt: '2026-07-05 16:20',
  },
  {
    id: 'SKU-10118',
    name: 'A4 复印纸 70g 五包装',
    category: '办公耗材',
    warehouse: '华北仓',
    stock: 920,
    safetyStock: 600,
    dailySales: 31,
    inTransit: 0,
    leadTimeDays: 4,
    unitCost: 23.5,
    owner: '周晨',
    updatedAt: '2026-07-05 11:45',
  },
  {
    id: 'SKU-10224',
    name: '厨房重油污清洁剂',
    category: '家清日化',
    warehouse: '华南仓',
    stock: 74,
    safetyStock: 180,
    dailySales: 18,
    inTransit: 40,
    leadTimeDays: 6,
    unitCost: 12.9,
    owner: '唐雨',
    updatedAt: '2026-07-04 18:02',
  },
  {
    id: 'SKU-10331',
    name: '即饮黑咖啡 24瓶装',
    category: '食品饮料',
    warehouse: '西南仓',
    stock: 1450,
    safetyStock: 420,
    dailySales: 19,
    inTransit: 260,
    leadTimeDays: 7,
    unitCost: 42,
    owner: '许诺',
    updatedAt: '2026-07-05 09:18',
  },
  {
    id: 'SKU-10409',
    name: '便携露营折叠椅',
    category: '户外用品',
    warehouse: '华东仓',
    stock: 38,
    safetyStock: 95,
    dailySales: 11,
    inTransit: 0,
    leadTimeDays: 10,
    unitCost: 68,
    owner: '邵宁',
    updatedAt: '2026-07-03 14:34',
  },
  {
    id: 'SKU-10567',
    name: '无线蓝牙耳机基础款',
    category: '手机配件',
    warehouse: '华南仓',
    stock: 260,
    safetyStock: 240,
    dailySales: 26,
    inTransit: 60,
    leadTimeDays: 8,
    unitCost: 59,
    owner: '罗晴',
    updatedAt: '2026-07-06 08:22',
  },
  {
    id: 'SKU-10602',
    name: '中性笔黑色 12支装',
    category: '办公耗材',
    warehouse: '华北仓',
    stock: 128,
    safetyStock: 300,
    dailySales: 35,
    inTransit: 80,
    leadTimeDays: 3,
    unitCost: 6.8,
    owner: '陈一',
    updatedAt: '2026-07-06 10:12',
  },
  {
    id: 'SKU-10773',
    name: '洗衣凝珠 52颗',
    category: '家清日化',
    warehouse: '西南仓',
    stock: 510,
    safetyStock: 260,
    dailySales: 9,
    inTransit: 0,
    leadTimeDays: 5,
    unitCost: 31,
    owner: '顾南',
    updatedAt: '2026-07-02 17:51',
  },
];

const stores: Store[] = ['天猫旗舰店', '京东自营店', '抖音官方店', '拼多多专营店', '线下渠道店'];
const detailWarehouses: Warehouse[] = ['华东仓', '华南仓', '华北仓', '西南仓'];
const categories: Category[] = ['手机配件', '办公耗材', '家清日化', '食品饮料', '户外用品'];
const statuses: ProductStatus[] = ['正常库存', '低库存', '高销量', '滞销', '超卖风险'];
const suppliers = ['启明供应链', '云仓优选', '海川商贸', '星河制造', '联采供应链', '北辰实业', '嘉禾工厂', '盛源批发'];
const owners = ['林佳', '周晨', '唐雨', '许诺', '邵宁', '罗晴', '陈一', '顾南', '沈知', '何予'];
const specs = ['单件装', '2件套', '标准款', '升级款', '家庭装', '企业装', '轻量款', '大容量'];
const productNames: Record<Category, string[]> = {
  手机配件: ['Type-C 快充数据线', '无线蓝牙耳机', '磁吸手机支架', '透明手机壳', '快充充电头'],
  办公耗材: ['A4 复印纸', '中性笔黑色', '文件收纳盒', '便利贴套装', '硒鼓标准版'],
  家清日化: ['厨房重油污清洁剂', '洗衣凝珠', '除菌湿巾', '洗手液补充装', '地板清洁片'],
  食品饮料: ['即饮黑咖啡', '低糖苏打水', '坚果混合装', '燕麦能量棒', '无糖茶饮'],
  户外用品: ['便携露营折叠椅', '户外保温杯', '防晒冰袖', '登山收纳包', '野餐防潮垫'],
};

function getScenarioValues(status: ProductStatus, index: number) {
  if (status === '低库存') {
    const currentStock = 18 + (index % 9) * 7;
    const lockedStock = 2 + (index % 5);
    return {
      currentStock,
      lockedStock,
      availableStock: Math.max(currentStock - lockedStock, 0),
      inTransitStock: 20 + (index % 6) * 12,
      unshippedOrders: 8 + (index % 7),
      sales7d: 24 + (index % 9) * 5,
      sales30d: 96 + (index % 11) * 18,
      safetyStock: 120 + (index % 5) * 30,
    };
  }

  if (status === '高销量') {
    const currentStock = 260 + (index % 12) * 24;
    const lockedStock = 18 + (index % 8) * 3;
    return {
      currentStock,
      lockedStock,
      availableStock: Math.max(currentStock - lockedStock, 0),
      inTransitStock: 80 + (index % 9) * 20,
      unshippedOrders: 28 + (index % 10) * 3,
      sales7d: 95 + (index % 13) * 9,
      sales30d: 360 + (index % 14) * 35,
      safetyStock: 180 + (index % 6) * 35,
    };
  }

  if (status === '滞销') {
    const currentStock = 820 + (index % 15) * 55;
    const lockedStock = 6 + (index % 6);
    return {
      currentStock,
      lockedStock,
      availableStock: Math.max(currentStock - lockedStock, 0),
      inTransitStock: index % 4 === 0 ? 120 : 0,
      unshippedOrders: index % 5,
      sales7d: index % 3,
      sales30d: 4 + (index % 7),
      safetyStock: 160 + (index % 6) * 20,
    };
  }

  if (status === '超卖风险') {
    const currentStock = 0 + (index % 4) * 3;
    const lockedStock = 6 + (index % 8);
    return {
      currentStock,
      lockedStock,
      availableStock: Math.min(currentStock - lockedStock, -1),
      inTransitStock: 0,
      unshippedOrders: 18 + (index % 12) * 4,
      sales7d: 40 + (index % 10) * 6,
      sales30d: 150 + (index % 9) * 20,
      safetyStock: 90 + (index % 5) * 25,
    };
  }

  const currentStock = 240 + (index % 16) * 28;
  const lockedStock = 8 + (index % 7) * 2;
  return {
    currentStock,
    lockedStock,
    availableStock: Math.max(currentStock - lockedStock, 0),
    inTransitStock: 30 + (index % 8) * 15,
    unshippedOrders: 4 + (index % 6),
    sales7d: 18 + (index % 8) * 4,
    sales30d: 90 + (index % 10) * 12,
    safetyStock: 120 + (index % 6) * 25,
  };
}

export const mockInventorySalesDetails: InventorySalesDetail[] = Array.from({ length: 100 }, (_, index) => {
  const category = categories[index % categories.length];
  const status = statuses[index % statuses.length];
  const values = getScenarioValues(status, index);
  const productName = productNames[category][Math.floor(index / categories.length) % productNames[category].length];
  const day = String((index % 30) + 1).padStart(2, '0');

  return {
    id: `INV-${String(index + 1).padStart(4, '0')}`,
    store: stores[index % stores.length],
    warehouse: detailWarehouses[(index + 1) % detailWarehouses.length],
    skuCode: `SKU-${String(20000 + index).padStart(5, '0')}`,
    productName,
    spec: specs[index % specs.length],
    specification: specs[index % specs.length],
    category,
    productStatus: status,
    currentStock: values.currentStock,
    lockedStock: values.lockedStock,
    sellableStock: Math.max(values.availableStock, 0),
    availableStock: values.availableStock,
    inTransitStock: values.inTransitStock,
    sales7Days: values.sales7d,
    unshippedOrders: values.unshippedOrders,
    sales7d: values.sales7d,
    sales30d: values.sales30d,
    safetyStock: values.safetyStock,
    supplier: suppliers[index % suppliers.length],
    owner: owners[index % owners.length],
    unitPrice: Number((8.8 + (index % 23) * 3.7).toFixed(2)),
    statDate: `2026-07-${day}`,
  };
});

export const mockExportTasks: ExportTask[] = [
  {
    id: 'EXPORT-001',
    name: '库存销售明细导出',
    status: '已完成',
    createdAt: '2026-07-06 09:30',
    creator: '实训学员',
    dataRange: '近7天',
    fileType: 'xlsx',
    rowCount: 12,
    fileName: 'SKU库存销售明细_近7天.xlsx',
    rows: mockInventorySalesDetails.slice(0, 12),
  },
  {
    id: 'EXPORT-002',
    name: '库存预警处理清单',
    status: '处理中',
    createdAt: '2026-07-06 10:12',
    creator: '实训学员',
    dataRange: '近7天',
    fileType: 'xlsx',
    rowCount: 8,
    fileName: 'SKU库存销售明细_近7天.xlsx',
    rows: mockInventorySalesDetails.filter((row) => row.productStatus !== '正常库存').slice(0, 8),
  },
];

export const defaultState: AppState = {
  skus: mockSkus,
  inventorySalesDetails: mockInventorySalesDetails,
  exportTasks: mockExportTasks,
  alertHandlingOrders: [],
  replenishmentApplications: [],
  rule: defaultRule,
  logs: [
    {
      id: 'LOG-001',
      time: '2026-07-06 09:05',
      skuId: 'SKU-10086',
      skuName: 'Type-C 快充数据线 1m',
      action: '创建补货建议',
      quantity: 420,
      operator: '系统演练',
    },
    {
      id: 'LOG-002',
      time: '2026-07-06 09:32',
      skuId: 'SKU-10409',
      skuName: '便携露营折叠椅',
      action: '紧急调拨入库',
      quantity: 60,
      operator: '实训学员',
    },
  ],
};
