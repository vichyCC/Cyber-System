import { useEffect, useMemo } from 'react';
import { DatePicker } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';

const RangePicker = DatePicker.RangePicker;

type InventoryDateRangePickerProps = {
  startDate?: string;
  endDate?: string;
  onChange: (range: { startDate?: string; endDate?: string }) => void;
};

type ArcoDateLike = {
  format: (template: string) => string;
};

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const today = todayText();

  return value > today ? today : value;
}

export function InventoryDateRangePicker({ startDate, endDate, onChange }: InventoryDateRangePickerProps) {
  const safeStartDate = normalizeDate(startDate);
  const safeEndDate = normalizeDate(endDate);
  const value = useMemo<[string, string] | undefined>(() => {
    return safeStartDate && safeEndDate ? [safeStartDate, safeEndDate] : undefined;
  }, [safeEndDate, safeStartDate]);

  useEffect(() => {
    if (safeStartDate !== (startDate || undefined) || safeEndDate !== (endDate || undefined)) {
      onChange({ startDate: safeStartDate, endDate: safeEndDate });
    }
  }, [endDate, onChange, safeEndDate, safeStartDate, startDate]);

  return (
    <div className="inventory-arco-range-wrapper">
      <div className="mb-2 text-sm font-semibold text-slate-700">时间范围</div>
      <RangePicker
        allowClear
        className="inventory-arco-range-picker"
        disabledDate={(current) => Boolean(current && (current as ArcoDateLike).format('YYYY-MM-DD') > todayText())}
        format="YYYY-MM-DD"
        onChange={(valueString) => {
          if (!valueString || !valueString[0] || !valueString[1]) {
            onChange({ startDate: undefined, endDate: undefined });
            return;
          }

          onChange({
            startDate: normalizeDate(valueString[0]),
            endDate: normalizeDate(valueString[1]),
          });
        }}
        placeholder={['开始日期', '结束日期']}
        separator="~"
        triggerProps={{
          className: 'inventory-arco-range-popup',
          position: 'bl',
        }}
        value={value}
      />
    </div>
  );
}
