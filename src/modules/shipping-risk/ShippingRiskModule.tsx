import { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker, Pagination, Select } from '@arco-design/web-react';
import { createShippingOrders } from './data';
import type { AfterSaleStatus, LogisticsStatus, OrderQuery, OrderStatus, ShippingOrder } from './types';

const RangePicker = DatePicker.RangePicker;
const defaultPageSize = 10;
const pageSizeOptions = [10, 20, 50];
type OrderSort = 'default' | 'delivery-asc' | 'create-desc';
type QuickFilter = '' | 'pending' | 'urge-delivery' | 'out-of-stock' | 'logistics-exception';

const defaultOrderSort: OrderSort = 'delivery-asc';
const statusTabs: Array<'全部订单' | OrderStatus> = ['全部订单', '待发货', '已发货', '配送中', '售后中', '已完成', '已关闭'];
const tabIds: Record<(typeof statusTabs)[number], string> = {
  全部订单: 'all',
  待发货: 'pending',
  已发货: 'shipped',
  配送中: 'delivering',
  售后中: 'after-sales',
  已完成: 'completed',
  已关闭: 'closed',
};
const quickFilters: Array<{ key: Exclude<QuickFilter, ''>; label: string }> = [
  { key: 'pending', label: '待发货' },
  { key: 'urge-delivery', label: '催发货' },
  { key: 'out-of-stock', label: '缺货订单' },
  { key: 'logistics-exception', label: '物流异常' },
];

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultQuery(): OrderQuery {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7);

  return {
    orderId: '',
    productName: '',
    orderStatus: '',
    afterSaleStatus: '',
    logisticsStatus: '',
    startDate: formatDateValue(startDate),
    endDate: formatDateValue(endDate),
  };
}

function matchesQuickFilter(order: ShippingOrder, filter: QuickFilter) {
  if (!filter) return true;
  if (filter === 'pending') return order.orderStatus === '待发货';
  if (filter === 'logistics-exception') return order.logisticsStatus === '物流异常';

  // 催发货与缺货是后台业务标记，这里用订单编号做稳定映射，不生成风险字段。
  const orderSequence = Number(order.orderId.replace(/\D/g, ''));
  if (filter === 'urge-delivery') return order.orderStatus === '待发货' && orderSequence % 7 === 0;
  return order.orderStatus === '待发货' && orderSequence % 11 === 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(value);
}

const refreshCycleStorageKey = 'shipping-risk-refresh-cycle';

export function ShippingRiskModule() {
  const [referenceTime] = useState(Date.now);
  const [baseOrders] = useState(() => createShippingOrders(referenceTime));
  const [initialQuery] = useState(createDefaultQuery);
  const [activeTab, setActiveTab] = useState<(typeof statusTabs)[number]>('全部订单');
  const [draftQuery, setDraftQuery] = useState<OrderQuery>(() => ({ ...initialQuery }));
  const [appliedQuery, setAppliedQuery] = useState<OrderQuery>(() => ({ ...initialQuery }));
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('');
  const [refreshCycle] = useState(() => {
    const previousCycle = Number(window.sessionStorage.getItem(refreshCycleStorageKey) ?? '-1');
    const nextCycle = (Number.isFinite(previousCycle) ? previousCycle + 1 : 0) % 3;
    window.sessionStorage.setItem(refreshCycleStorageKey, String(nextCycle));
    return nextCycle;
  });
  const [orderSort, setOrderSort] = useState<OrderSort>(defaultOrderSort);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => setLoading(false), 1200);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const orders = useMemo(() => {
    const transitionCount = refreshCycle * 2;
    if (transitionCount === 0) return baseOrders;

    const transitionedOrderIds = new Set(
      baseOrders.filter((order) => order.orderStatus === '待发货').slice(0, transitionCount).map((order) => order.orderId),
    );

    return baseOrders.map((order) =>
      transitionedOrderIds.has(order.orderId)
        ? { ...order, orderStatus: '已发货' as const, promisedDeliveryTime: null, logisticsStatus: '未揽收' as const }
        : order,
    );
  }, [baseOrders, refreshCycle]);

  const statusCounts = useMemo(() => {
    const count = (status: OrderStatus) => orders.filter((order) => order.orderStatus === status).length;
    return {
      全部订单: orders.length,
      待发货: count('待发货'),
      已发货: count('已发货'),
      配送中: count('配送中'),
      售后中: count('售后中'),
      已完成: count('已完成'),
      已关闭: count('已关闭'),
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const orderKeyword = appliedQuery.orderId.trim().toLowerCase();
    const productKeyword = appliedQuery.productName.trim().toLowerCase();
    const rows = orders.filter((order) => {
      if (activeTab !== '全部订单' && order.orderStatus !== activeTab) return false;
      if (orderKeyword && !order.orderId.toLowerCase().includes(orderKeyword)) return false;
      if (productKeyword && !order.product.name.toLowerCase().includes(productKeyword)) return false;
      if (appliedQuery.orderStatus && order.orderStatus !== appliedQuery.orderStatus) return false;
      if (appliedQuery.afterSaleStatus && order.afterSaleStatus !== appliedQuery.afterSaleStatus) return false;
      if (appliedQuery.logisticsStatus && order.logisticsStatus !== appliedQuery.logisticsStatus) return false;
      if (appliedQuery.startDate && order.createTime.slice(0, 10) < appliedQuery.startDate) return false;
      if (appliedQuery.endDate && order.createTime.slice(0, 10) > appliedQuery.endDate) return false;
      if (!matchesQuickFilter(order, quickFilter)) return false;
      return true;
    });

    return [...rows].sort((first, second) => {
      if (orderSort === 'create-desc') return second.createTime.localeCompare(first.createTime);
      if (orderSort === 'default') return 0;
      if (first.promisedDeliveryTime === null && second.promisedDeliveryTime === null) return 0;
      if (first.promisedDeliveryTime === null) return 1;
      if (second.promisedDeliveryTime === null) return -1;
      return first.promisedDeliveryTime.localeCompare(second.promisedDeliveryTime);
    });
  }, [activeTab, appliedQuery, orderSort, orders, quickFilter]);

  const totalPages = Math.max(Math.ceil(filteredOrders.length / pageSize), 1);
  const visibleOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function loadOrderList() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = window.setTimeout(
      () => {
        setLoading(false);
        timerRef.current = null;
      },
      500 + Math.floor(Math.random() * 1001),
    );
  }

  function updateQuery<K extends keyof OrderQuery>(key: K, value: OrderQuery[K]) {
    setDraftQuery((current) => ({ ...current, [key]: value }));
  }

  function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    setAppliedQuery(draftQuery);
    setCurrentPage(1);
    loadOrderList();
  }

  function resetQuery() {
    const defaultQuery = createDefaultQuery();
    setDraftQuery(defaultQuery);
    setAppliedQuery(defaultQuery);
    setOrderSort(defaultOrderSort);
    setQuickFilter('');
    setCurrentPage(1);
    loadOrderList();
  }

  function changeTab(tab: (typeof statusTabs)[number]) {
    setActiveTab(tab);
    setCurrentPage(1);
    loadOrderList();
  }

  function changeQuickFilter(filter: Exclude<QuickFilter, ''>) {
    setQuickFilter((current) => (current === filter ? '' : filter));
    setCurrentPage(1);
    loadOrderList();
  }

  function changePagination(page: number, nextPageSize: number) {
    setCurrentPage(page);
    setPageSize(nextPageSize);
    loadOrderList();
  }

  return (
    <section className="min-h-[780px] rounded-xl border border-slate-200 bg-[#f5f7fa] p-5 shadow-sm" data-rpa-page="merchant-order-center">
      <div className="space-y-5">
        <OrderManagement
          activeTab={activeTab}
          draftQuery={draftQuery}
          filteredCount={filteredOrders.length}
          loading={loading}
          onChangeTab={changeTab}
          onChangeQuickFilter={changeQuickFilter}
          onOrderSortChange={(value) => { setOrderSort(value); setCurrentPage(1); }}
          onQueryChange={updateQuery}
          onReset={resetQuery}
          onSelectOrder={setSelectedOrder}
          onSubmit={submitQuery}
          orders={visibleOrders}
          orderSort={orderSort}
          quickFilter={quickFilter}
          statusCounts={statusCounts}
        />
        {!loading && (
          <div id="order-pagination" className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <Pagination
              current={currentPage}
              onChange={changePagination}
              pageSize={pageSize}
              pageSizeChangeResetCurrent
              showJumper
              showTotal={(total, range) => `共 ${total} 条，第 ${range[0]}-${range[1]} 条`}
              sizeCanChange
              sizeOptions={pageSizeOptions}
              total={filteredOrders.length}
            />
          </div>
        )}
      </div>
      {selectedOrder && <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </section>
  );
}

function OrderManagement({
  activeTab,
  draftQuery,
  filteredCount,
  loading,
  orders,
  orderSort,
  quickFilter,
  statusCounts,
  onChangeTab,
  onChangeQuickFilter,
  onOrderSortChange,
  onQueryChange,
  onReset,
  onSelectOrder,
  onSubmit,
}: {
  activeTab: (typeof statusTabs)[number];
  draftQuery: OrderQuery;
  filteredCount: number;
  loading: boolean;
  orders: ShippingOrder[];
  orderSort: OrderSort;
  quickFilter: QuickFilter;
  statusCounts: Record<(typeof statusTabs)[number], number>;
  onChangeTab: (tab: (typeof statusTabs)[number]) => void;
  onChangeQuickFilter: (filter: Exclude<QuickFilter, ''>) => void;
  onOrderSortChange: (value: OrderSort) => void;
  onQueryChange: <K extends keyof OrderQuery>(key: K, value: OrderQuery[K]) => void;
  onReset: () => void;
  onSelectOrder: (order: ShippingOrder) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <main className="min-w-0 space-y-4" data-page="order-management">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex overflow-x-auto border-b border-slate-200 px-3" role="tablist" aria-label="订单状态">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              id={`order-tab-${tabIds[tab]}`}
              className={`relative h-12 flex-none px-4 text-sm transition ${activeTab === tab ? 'font-bold text-blue-600' : 'font-medium text-slate-600 hover:text-slate-950'}`}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onChangeTab(tab)}
            >
              {tab}<span className="ml-1 text-xs text-slate-400">{statusCounts[tab]}</span>
              {activeTab === tab && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-blue-600" />}
            </button>
          ))}
        </div>

        <div id="order-quick-filters" className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3" aria-label="快捷筛选">
          <span className="mr-1 text-xs font-semibold text-slate-500">快捷筛选</span>
          {quickFilters.map((filter) => {
            const active = quickFilter === filter.key;
            return (
              <button
                key={filter.key}
                id={`quick-filter-${filter.key}`}
                aria-pressed={active}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                }`}
                onClick={() => onChangeQuickFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <form id="order-query-form" className="border-b border-slate-100 p-4" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <QueryInput id="query-order-id" label="订单编号" placeholder="请输入订单编号" value={draftQuery.orderId} onChange={(value) => onQueryChange('orderId', value)} />
            <QueryInput id="query-product-name" label="商品名称" placeholder="请输入商品名称" value={draftQuery.productName} onChange={(value) => onQueryChange('productName', value)} />
            <QuerySelect id="query-order-status" label="订单状态" options={['待发货', '已发货', '配送中', '售后中', '已完成', '已关闭']} value={draftQuery.orderStatus} onChange={(value) => onQueryChange('orderStatus', value as OrderStatus | '')} />
            <QuerySelect id="query-after-sale-status" label="售后状态" options={['无售后', '售后处理中', '退款完成']} value={draftQuery.afterSaleStatus} onChange={(value) => onQueryChange('afterSaleStatus', value as AfterSaleStatus | '')} />
            <QuerySelect id="query-logistics-status" label="物流状态" options={['暂无物流信息', '未揽收', '已揽收', '运输中', '派送中', '已签收']} value={draftQuery.logisticsStatus} onChange={(value) => onQueryChange('logisticsStatus', value as LogisticsStatus | '')} />
            <QueryDateRange
              endDate={draftQuery.endDate}
              onChange={(startDate, endDate) => {
                onQueryChange('startDate', startDate);
                onQueryChange('endDate', endDate);
              }}
              startDate={draftQuery.startDate}
            />
          </div>
          <div className="mt-4 flex gap-2"><button id="query-orders" className="h-9 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700" type="submit">查询</button><button id="reset-order-query" className="h-9 rounded-md border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={onReset}>重置</button></div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs text-slate-500">共 <strong id="filtered-order-count" className="text-slate-900">{filteredCount}</strong> 条订单</div>
          <Select
            className="w-52"
            id="delivery-time-sort"
            onChange={(value) => onOrderSortChange(value as OrderSort)}
            options={[
              { label: '默认排序', value: 'default' },
              { label: '预计发货时间升序', value: 'delivery-asc' },
              { label: '下单时间倒序', value: 'create-desc' },
            ]}
            size="small"
            value={orderSort}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div id="order-list-header" className="hidden min-w-[1220px] grid-cols-[minmax(250px,1.5fr)_110px_110px_minmax(170px,0.9fr)_130px_minmax(210px,1.1fr)_120px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 lg:grid">
          <div>商品信息</div>
          <div>单价/数量</div>
          <div>售后状态</div>
          <div>订单状态</div>
          <div>商家收入金额</div>
          <div>收货信息</div>
          <div className="text-right">操作</div>
        </div>
        {loading ? <OrderLoading /> : (
          <div id="order-card-list" className="divide-y divide-slate-100" aria-live="polite">
            {orders.map((order) => <OrderCard key={order.orderId} onView={() => onSelectOrder(order)} order={order} />)}
            {orders.length === 0 && <div className="py-16 text-center text-sm text-slate-400">未找到符合条件的订单</div>}
          </div>
        )}
      </div>
    </main>
  );
}

function OrderCard({ order, onView }: { order: ShippingOrder; onView: () => void }) {
  return (
    <article className="min-w-[1220px] bg-white p-4 transition hover:bg-slate-50/70" data-order-card data-order-id={order.orderId} data-order-status={order.orderStatus}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2 text-xs text-slate-500">
        <div className="flex flex-wrap gap-x-5 gap-y-1"><span>订单编号：<strong className="text-slate-800" data-field="order-id">{order.orderId}</strong></span><span>下单时间：<span data-field="create-time">{order.createTime}</span></span></div>
        <button className="text-xs font-medium text-blue-600 hover:text-blue-700" data-action="add-note" type="button">添加备注</button>
      </div>
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(250px,1.5fr)_110px_110px_minmax(170px,0.9fr)_130px_minmax(210px,1.1fr)_120px]">
        <div className="flex min-w-0 items-center gap-3"><ProductThumbnail image={order.product.image} productName={order.product.name} /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900" data-field="product-name">{order.product.name}</h3><div className="mt-1 text-xs text-slate-500" data-field="product-spec">{order.product.specification}</div><div className="mt-1 text-xs text-slate-400">{order.shopName}</div></div></div>
        <div className="text-sm text-slate-700"><div data-field="unit-price">{formatCurrency(order.product.price)}</div><div className="mt-1 text-xs text-slate-400" data-field="quantity">×{order.product.quantity}</div></div>
        <div className="text-sm text-slate-700" data-field="after-sale-status">{order.afterSaleStatus}</div>
        <div className="space-y-1.5">
          <OrderStatusBadge status={order.orderStatus} />
          {order.orderStatus === '待发货' && order.promisedDeliveryTime && <div className="text-xs text-slate-500">承诺发货：<span data-field="promised-delivery-time">{order.promisedDeliveryTime}</span></div>}
          {order.orderStatus === '已完成' && <div className="text-xs text-slate-500">完成时间：<span data-field="completed-time">{order.completedTime}</span></div>}
          {!['待发货', '已完成', '已关闭'].includes(order.orderStatus) && <div className="text-xs text-slate-400" data-field="logistics-status">{order.logisticsStatus}</div>}
        </div>
        <div className="text-sm font-semibold text-slate-900" data-field="merchant-income">{formatCurrency(order.merchantIncome)}</div>
        <div className="text-xs leading-5 text-slate-600" data-field="receiver-info"><div>{order.receiver.name} {order.receiver.phone}</div><div className="line-clamp-2 text-slate-400">{order.receiver.address}</div></div>
        <div className="flex flex-col items-end gap-1.5 text-right" data-field="operation">
          {order.orderStatus === '待发货' && <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" data-action="ship-order" type="button">发货</button>}
          <button className="view-order-detail text-xs font-semibold text-blue-600 hover:text-blue-700" data-action="view-order" onClick={onView} type="button">订单详情</button>
          {order.orderStatus === '待发货' && <button className="text-xs font-medium text-blue-600 hover:text-blue-700" data-action="change-address" type="button">修改收货地址</button>}
        </div>
      </div>
    </article>
  );
}

function QueryInput({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input id={id} className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function QuerySelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const allOptionValue = '__all__';

  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <Select
        allowClear
        className="w-full"
        id={id}
        onChange={(nextValue) => onChange(nextValue && nextValue !== allOptionValue ? String(nextValue) : '')}
        options={[
          { label: '全部', value: allOptionValue },
          ...options.map((option) => ({ label: option, value: option })),
        ]}
        placeholder="全部"
        value={value || allOptionValue}
      />
    </div>
  );
}

function QueryDateRange({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const value: [string, string] | undefined = startDate && endDate ? [startDate, endDate] : undefined;

  return (
    <div className="block" id="query-create-time-range" data-rpa-field="create-time-range">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">下单时间范围</span>
      <RangePicker
        allowClear
        className="w-full"
        disabledDate={(current) => {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          return current.valueOf() > today.getTime();
        }}
        format="YYYY-MM-DD"
        onChange={(dateStrings) => onChange(dateStrings?.[0] ?? '', dateStrings?.[1] ?? '')}
        placeholder={['开始日期', '结束日期']}
        separator="至"
        value={value}
      />
    </div>
  );
}

function ProductThumbnail({ productName, image }: { productName: string; image: string }) {
  return <img className="h-16 w-16 flex-none rounded-lg border border-slate-100 bg-slate-50 object-cover" src={image} alt={`${productName}商品图片`} data-field="product-image" />;
}

function OrderDetail({ order, onClose }: { order: ShippingOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-5" role="dialog" aria-modal="true" aria-label="订单详情">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="text-base font-bold text-slate-950">订单详情</h2><p className="mt-1 text-xs text-slate-400">{order.orderId}</p></div>
          <button className="text-xl text-slate-400 hover:text-slate-700" aria-label="关闭订单详情" onClick={onClose} type="button">×</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <DetailField label="商品信息" value={`${order.product.name}｜${order.product.specification}`} />
          <DetailField label="单价/数量" value={`${formatCurrency(order.product.price)} × ${order.product.quantity}`} />
          <DetailField label="订单状态" value={order.orderStatus} />
          <DetailField label="售后状态" value={order.afterSaleStatus} />
          <DetailField label="下单时间" value={order.createTime} />
          {order.orderStatus === '待发货' && order.promisedDeliveryTime && <DetailField label="承诺发货时间" value={order.promisedDeliveryTime} />}
          {order.orderStatus === '已完成' && order.completedTime && <DetailField label="完成时间" value={order.completedTime} />}
          <DetailField label="物流状态" value={order.logisticsStatus} />
          <DetailField label="商家收入金额" value={formatCurrency(order.merchantIncome)} />
          <DetailField label="收货信息" value={`${order.receiver.name} ${order.receiver.phone}｜${order.receiver.address}`} />
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button className="rounded-md border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">关闭</button>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold leading-6 text-slate-800">{value}</div></div>;
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    待发货: 'bg-blue-50 text-blue-700',
    已发货: 'bg-indigo-50 text-indigo-700',
    配送中: 'bg-cyan-50 text-cyan-700',
    售后中: 'bg-amber-50 text-amber-700',
    已完成: 'bg-emerald-50 text-emerald-700',
    已关闭: 'bg-slate-100 text-slate-600',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`} data-field="order-status">{status}</span>;
}

function OrderLoading() {
  return (
    <div id="orders-loading" className="space-y-3 p-4" aria-label="订单加载中" role="status">
      <div className="text-center text-xs font-medium text-blue-600">订单加载中...</div>
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="animate-pulse rounded-lg border border-slate-100 p-4"><div className="h-3 w-48 rounded bg-slate-100" /><div className="mt-4 flex gap-3"><div className="h-16 w-16 rounded-lg bg-slate-100" /><div className="flex-1 space-y-2 pt-2"><div className="h-4 w-1/3 rounded bg-slate-100" /><div className="h-3 w-1/5 rounded bg-slate-100" /></div></div></div>)}
    </div>
  );
}

