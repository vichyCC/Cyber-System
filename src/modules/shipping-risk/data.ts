import type { ShippingOrder } from './types';

const HOUR = 60 * 60 * 1000;

const productCatalog = [
  { name: '无线蓝牙耳机 Pro', specification: '曜石黑｜标准版', price: 299, symbol: '🎧', color: '#dbeafe' },
  { name: 'Type-C 65W 快充套装', specification: '白色｜充电器+数据线', price: 129, symbol: '⚡', color: '#fef3c7' },
  { name: '智能运动手环 S8', specification: '深空灰｜标准腕带', price: 399, symbol: '⌚', color: '#e0e7ff' },
  { name: '便携保温杯 500ml', specification: '奶油白｜500ml', price: 89, symbol: '🥤', color: '#dcfce7' },
  { name: '城市通勤双肩包', specification: '经典黑｜20L', price: 259, symbol: '🎒', color: '#f3e8ff' },
  { name: '护眼阅读台灯', specification: '白色｜国标插头', price: 199, symbol: '💡', color: '#fef9c3' },
  { name: '桌面无线充电器', specification: '深空灰｜15W', price: 159, symbol: '🔋', color: '#e2e8f0' },
  { name: '迷你蓝牙音箱', specification: '星空蓝｜标准版', price: 229, symbol: '🔊', color: '#cffafe' },
];

const receiverNames = ['张先生', '李女士', '王先生', '赵女士', '陈先生', '刘女士'];
const receiverAddresses = [
  '上海市浦东新区张江路188号',
  '北京市朝阳区望京街道36号',
  '浙江省杭州市余杭区文一西路969号',
  '广东省深圳市南山区科技园路15号',
  '江苏省南京市建邺区江东中路88号',
  '四川省成都市高新区天府三街66号',
];

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const dateText = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const timeText = [String(date.getHours()).padStart(2, '0'), String(date.getMinutes()).padStart(2, '0')].join(':');
  return `${dateText} ${timeText}`;
}

function createProductImage(symbol: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="${color}"/><text x="48" y="59" text-anchor="middle" font-size="38">${symbol}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * 动态生成150条完整订单。待发货约60%，其中90%的承诺发货时间为
 * 当前时间后24~48小时，10%为当前时间后2~12小时，且全部晚于当前时间。
 */
export function createShippingOrders(referenceTime = Date.now()): ShippingOrder[] {
  return Array.from({ length: 150 }, (_, index) => {
    let orderStatus: ShippingOrder['orderStatus'];
    if (index < 90) orderStatus = '待发货';
    else if (index < 112) orderStatus = '已发货';
    else if (index < 126) orderStatus = '配送中';
    else if (index < 140) orderStatus = '售后中';
    else if (index < 147) orderStatus = '已完成';
    else orderStatus = '已关闭';

    let logisticsStatus: ShippingOrder['logisticsStatus'] = '暂无物流信息';
    if (orderStatus === '已发货') logisticsStatus = (['已揽收', '运输中', '派送中'] as const)[index % 3];
    if (orderStatus === '配送中') logisticsStatus = index % 13 === 0 ? '物流异常' : index % 2 === 0 ? '运输中' : '派送中';
    if (orderStatus === '售后中') logisticsStatus = index % 2 === 0 ? '运输中' : '已签收';
    if (orderStatus === '已完成') logisticsStatus = '已签收';

    const catalogItem = productCatalog[index % productCatalog.length];
    const quantity = 1 + (index % 3);
    const createTimestamp = referenceTime - (1 + (index % 72)) * HOUR - (index % 4) * 15 * 60 * 1000;
    // 增加一分钟缓冲，格式化到分钟后仍能严格满足最短承诺时长。
    const promisedDeliveryTimestamp = orderStatus === '待发货'
      ? referenceTime + (index < 81 ? 24 + (index % 24) : 2 + ((index - 81) % 11)) * HOUR + 60 * 1000
      : null;
    const completedTimestamp = orderStatus === '已完成' ? referenceTime - (1 + (index % 12)) * HOUR : null;

    return {
      orderId: `TK${String(index + 1).padStart(3, '0')}`,
      shopName: '星辰优选官方旗舰店',
      product: {
        name: catalogItem.name,
        specification: catalogItem.specification,
        image: createProductImage(catalogItem.symbol, catalogItem.color),
        price: catalogItem.price,
        quantity,
      },
      afterSaleStatus: orderStatus === '售后中' ? '售后处理中' : index % 37 === 0 && orderStatus === '已完成' ? '退款完成' : '无售后',
      orderStatus,
      createTime: formatDateTime(createTimestamp),
      promisedDeliveryTime: promisedDeliveryTimestamp === null ? null : formatDateTime(promisedDeliveryTimestamp),
      completedTime: completedTimestamp === null ? null : formatDateTime(completedTimestamp),
      merchantIncome: catalogItem.price * quantity,
      receiver: {
        name: receiverNames[index % receiverNames.length],
        phone: `138****${String(1200 + index).padStart(4, '0')}`,
        address: receiverAddresses[index % receiverAddresses.length],
      },
      logisticsStatus,
    };
  });
}
