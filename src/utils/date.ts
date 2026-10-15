// 按本地日历计算，避免 UTC 转换和夏令时造成日期偏移。
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function daysAgo(days: number, base = new Date()): string {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return formatLocalDate(date);
}

export const getToday = (base = new Date()) => daysAgo(0, base);
export const getYesterday = (base = new Date()) => daysAgo(1, base);
export const getLast7DaysStart = (base = new Date()) => daysAgo(7, base);
export const getLast7DaysEnd = getYesterday;

export function getLast7DaysRange(base = new Date()) {
  return { startDate: getLast7DaysStart(base), endDate: getLast7DaysEnd(base) };
}

export function formatDataRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) return '全部日期';
  return `${startDate || '不限'} 至 ${endDate || '不限'}`;
}

export function inventoryFileName(dataRange: string) {
  return `SKU库存销售明细_${dataRange.replace(/\s*至\s*/g, '至').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.xlsx`;
}
