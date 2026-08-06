export type OrderStatus = '待发货' | '已发货' | '配送中' | '售后中' | '已完成' | '已关闭';

export type AfterSaleStatus = '无售后' | '售后处理中' | '退款完成';

export type LogisticsStatus = '暂无物流信息' | '未揽收' | '已揽收' | '运输中' | '派送中' | '已签收' | '物流异常';

export interface OrderProduct {
  name: string;
  specification: string;
  image: string;
  price: number;
  quantity: number;
}

export interface OrderReceiver {
  name: string;
  phone: string;
  address: string;
}

/** 完整订单对象仅保存后台原始业务数据，不包含任何风险判断结果。 */
export interface ShippingOrder {
  orderId: string;
  shopName: string;
  product: OrderProduct;
  afterSaleStatus: AfterSaleStatus;
  orderStatus: OrderStatus;
  createTime: string;
  promisedDeliveryTime: string | null;
  completedTime: string | null;
  merchantIncome: number;
  receiver: OrderReceiver;
  logisticsStatus: LogisticsStatus;
}

export interface OrderQuery {
  orderId: string;
  productName: string;
  orderStatus: '' | OrderStatus;
  afterSaleStatus: '' | AfterSaleStatus;
  logisticsStatus: '' | LogisticsStatus;
  startDate: string;
  endDate: string;
}
