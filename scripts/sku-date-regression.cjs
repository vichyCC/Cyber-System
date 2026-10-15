// 验证 SKU 日期边界、任务快照与工作簿结构，不修改浏览器中的用户数据。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let saved;
let clockOffset = 0;
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [Date.now() + clockOffset])); }
  static now() { return Date.now() + clockOffset; }
}
const localStorage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full);
  const module = { exports: {} };
  cache.set(full, module.exports);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, Date: TestDate, window: { localStorage }, require: (name) => load(path.relative(root, path.resolve(path.dirname(full), name + '.ts'))) });
  return module.exports;
}
const date = load('src/utils/date.ts');
for (const [base, start, end] of [
  [new Date(2026, 9, 12, 0, 5), '2026-10-05', '2026-10-11'],
  [new Date(2027, 0, 1, 23, 55), '2026-12-25', '2026-12-31'],
  [new Date(2028, 2, 1), '2028-02-23', '2028-02-29'],
  [new Date(2026, 2, 10), '2026-03-03', '2026-03-09'],
]) {
  assert.equal(date.getLast7DaysStart(base), start);
  assert.equal(date.getYesterday(base), end);
  assert.equal(date.getLast7DaysEnd(base), end);
}
const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['createDefaultReportFilters', 'filterInventoryRows', 'createInventoryExportTask', 'nowText', 'downloadExcel', 'prepareWorksheet', 'setAutoFilter', 'ReportPage'];
const snippets = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) snippets.push(node.getText(ast));
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'inventoryExportHeaders')) snippets.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const componentNames = new Set();
function collectComponents(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    const name = node.tagName.getText(ast);
    if (/^[A-Z]\w*$/.test(name)) componentNames.add(name);
  }
  ts.forEachChild(node, collectComponents);
}
collectComponents(ast);
let hooks = [], hookIndex = 0;
const renderRuntime = {
  h: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
  useState: (initial) => {
    const index = hookIndex++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
  },
  useMemo: fn => fn(),
  ...Object.fromEntries([...componentNames].map(name => [name, name])),
};
let captured, fileName;
let state = { exportTasks: [] };
const context = vm.createContext({ ...date, ...renderRuntime, Date, Intl, Math, XLSX: { ...XLSX, writeFile: (book, name) => { captured = book; fileName = name; } }, setState: (update) => { state = update(state); }, navigateToPage: () => {} });
vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' } }).outputText, context);
const mocks = load('src/data/mockData.ts');
const defaults = context.createDefaultReportFilters();
assert.equal(defaults.startDate, date.getLast7DaysStart());
assert.equal(defaults.endDate, date.getYesterday());
assert.equal(context.filterInventoryRows(mocks.mockInventorySalesDetails, defaults).length, 28);
assert.equal(new Set(mocks.mockInventorySalesDetails.map(row => row.statDate)).size, 30);
const selected = { ...defaults, startDate: date.daysAgo(3), endDate: date.daysAgo(2) };
const rows = context.filterInventoryRows(mocks.mockInventorySalesDetails, selected);
assert(rows.length > 0 && rows.length < 100);
assert(rows.every(row => row.statDate >= selected.startDate && row.statDate <= selected.endDate));
const before = Date.now();
context.createInventoryExportTask(rows, selected);
const task = state.exportTasks[0];
assert.equal(task.status, '导出中');
assert(task.createdAtTimestamp >= before && task.createdAtTimestamp <= Date.now());
assert(task.estimatedFinishAtTimestamp - task.createdAtTimestamp >= 5000);
assert(task.estimatedFinishAtTimestamp - task.createdAtTimestamp <= 10000);
assert.equal(task.dataRange, `${selected.startDate} 至 ${selected.endDate}`);
selected.startDate = date.daysAgo(6);
context.downloadExcel(task);
assert.equal(fileName, `SKU库存销售明细_${task.dataRange.replace(/ /g, '')}.xlsx`);
assert(!/[<>:"/\\|?*]/.test(fileName));
const workbook = XLSX.read(XLSX.write(captured, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
assert.deepEqual(workbook.SheetNames, ['库存销售明细', '字段说明', '公式说明']);
const main = workbook.Sheets['库存销售明细'];
assert.equal(XLSX.utils.decode_range(main['!ref']).e.c, 12);
assert(!Object.values(main).some(cell => cell?.f));
assert.equal(workbook.Sheets['公式说明'].C2.v, '=ROUND(I2/7,2)');
assert.equal(workbook.Sheets['公式说明'].B8.v, 'T');
assert.equal(workbook.Props.Subject, `数据范围：${task.dataRange}`);
const storage = load('src/utils/storage.ts');
saved = JSON.stringify({ ...mocks.defaultState, inventorySalesDetails: mocks.mockInventorySalesDetails.map(row => ({ ...row, statDate: '2000-01-01' })), exportTasks: [task] });
const restored = storage.loadState();
assert.equal(restored.inventorySalesDetails[0].statDate, '2000-01-01');
assert.equal(restored.exportTasks[0].dataRange, task.dataRange);
assert.equal(restored.exportTasks[0].rows[0].statDate, task.rows[0].statDate);
saved = JSON.stringify({ ...restored, exportTasks: [{ ...task, estimatedFinishAtTimestamp: Date.now() - 1 }] });
assert.equal(storage.loadState().exportTasks[0].status, '已完成');
// 用轻量状态桩执行真实页面回调，属于逻辑测试，不代替浏览器验收。
Object.assign(context, { stores: [], warehouses: [], productStatuses: [], categories: [] });
function render() {
  hookIndex = 0;
  return context.ReportPage({ rows: mocks.mockInventorySalesDetails, onCreateExportTask: context.createInventoryExportTask });
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  for (const child of node.children || []) { const match = find(child, predicate); if (match) return match; }
}
const button = (tree, text) => find(tree, node => node.type === 'button' && node.children.includes(text));
const table = tree => find(tree, node => node.type === 'InventorySalesTable');
const picker = tree => find(tree, node => node.type === 'InventoryDateRangePicker');
function exportAndCompare(tree) {
  button(tree, '导出Excel').props.onClick();
  const task = state.exportTasks[0];
  assert.equal(task.rowCount, table(tree).props.total);
  assert.equal(task.rows.length, task.rowCount);
  return task;
}
let tree = render();
assert.equal(table(tree).props.total, 28);
assert.equal(exportAndCompare(tree).rowCount, 28);
picker(tree).props.onChange({});
tree = render();
button(tree, '查询').props.onClick();
tree = render();
assert.equal(table(tree).props.total, 100);
const allTask = exportAndCompare(tree);
assert.equal(allTask.startDate, '');
assert.equal(allTask.endDate, '');
assert.equal(allTask.dataRange, '全部日期');
assert.equal(allTask.fileName, 'SKU库存销售明细_全部日期.xlsx');
context.downloadExcel(allTask);
assert.equal(fileName, allTask.fileName);
assert.equal(XLSX.utils.sheet_to_json(captured.Sheets['库存销售明细']).length, 100);
assert.equal(table(tree).props.rows.length, 10);
// 输入日期与店铺但不查询，仍导出原来的全日期、全部店铺快照。
picker(tree).props.onChange({ startDate: date.daysAgo(25), endDate: date.daysAgo(15) });
find(tree, node => node.type === 'SelectField' && node.props.label === '店铺').props.onChange('天猫旗舰店');
tree = render();
assert.equal(exportAndCompare(tree).dataRange, '全部日期');
assert.equal(state.exportTasks[0].queryFilters.store, '全部店铺');
button(tree, '查询').props.onClick();
tree = render();
const historyTask = exportAndCompare(tree);
assert(historyTask.rowCount > 0 && historyTask.rowCount < 100);
assert.equal(historyTask.startDate, date.daysAgo(25));
assert(historyTask.rows.every(row => row.statDate >= historyTask.startDate && row.statDate <= historyTask.endDate && row.store === '天猫旗舰店'));
const frozen = JSON.stringify(historyTask);
picker(tree).props.onChange({});
button(render(), '重置').props.onClick();
tree = render();
assert.equal(picker(tree).props.startDate, date.getLast7DaysStart());
assert.equal(picker(tree).props.endDate, date.getYesterday());
assert.equal(table(tree).props.total, 28);
assert.equal(JSON.stringify(historyTask), frozen);
// 新任务的条件与行数据都是副本。
const mutableRows = [{ ...mocks.mockInventorySalesDetails[0] }];
const mutableFilters = { ...defaults };
context.createInventoryExportTask(mutableRows, mutableFilters);
const copiedTask = state.exportTasks[0];
const copied = JSON.stringify(copiedTask);
mutableFilters.startDate = '1900-01-01';
mutableRows[0].statDate = '1900-01-01';
mutableRows[0].sellableStock = -999;
assert.equal(JSON.stringify(copiedTask), copied);
// 不从行日期推断范围，也不覆盖旧文件名。涵盖空数据和缺失字段。
const oldTasks = [
  { ...task, id: '明确范围', dataRange: '2020-01-01 至 2020-01-07', startDate: '2020-01-01', endDate: '2020-01-07', fileName: '历史自定义.xlsx', rows: [] },
  { ...task, id: '相对范围', dataRange: '近7天', fileName: '原始近7天.xlsx', rows: [mocks.mockInventorySalesDetails[0]] },
  { ...task, id: '相对空数据', dataRange: '近7天', fileName: '原始空表.xlsx', rows: [] },
  { id: '未知范围', createdAt: '2020-01-15 10:00', status: '已完成', fileName: '无范围.xlsx', rows: [mocks.mockInventorySalesDetails[0]] },
  { id: '未知空数据', createdAt: '2020-01-15 10:00', status: '已完成', rows: [] },
  { id: '明确字段', startDate: '2020-01-01', endDate: '2020-01-07', status: '已完成', rows: [] },
  copiedTask, allTask,
];
const businessState = {
  ...mocks.defaultState,
  inventorySalesDetails: mocks.mockInventorySalesDetails.map(row => ({ ...row, statDate: '2000-01-01' })),
  exportTasks: oldTasks,
  alertHandlingOrders: [{ id: '订单', createdAt: '2020-01-15 09:00', status: '待审核' }],
  replenishmentApplications: [{ id: '补货', createdAt: '2020-01-15 09:30', status: '待审核', submittedRows: [] }],
};
saved = JSON.stringify(businessState);
const rawSaved = saved;
const firstRead = storage.loadState();
assert.equal(saved, rawSaved);
for (let index = 0; index < 3; index++) {
  assert.equal(firstRead.exportTasks[index].dataRange, oldTasks[index].dataRange);
  assert.equal(firstRead.exportTasks[index].fileName, oldTasks[index].fileName);
}
assert.equal(firstRead.exportTasks[3].dataRange, '历史范围未知');
assert.equal(firstRead.exportTasks[4].dataRange, '历史范围未知');
assert.equal(firstRead.exportTasks[5].dataRange, '2020-01-01 至 2020-01-07');
context.downloadExcel(firstRead.exportTasks[0]);
assert.equal(fileName, '历史自定义.xlsx');
storage.saveState(firstRead);
clockOffset = 40 * 86400000;
cache.clear();
const futureStorage = load('src/utils/storage.ts');
const futureMocks = load('src/data/mockData.ts');
const secondRead = futureStorage.loadState();
const normalize = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(normalize(secondRead.exportTasks.map(({ status, ...rest }) => rest)), normalize(firstRead.exportTasks.map(({ status, ...rest }) => rest)));
for (const key of ['inventorySalesDetails', 'alertHandlingOrders', 'replenishmentApplications', 'logs', 'skus']) {
  assert.deepEqual(normalize(secondRead[key]), normalize(firstRead[key]));
}
assert.notEqual(futureMocks.mockInventorySalesDetails[0].statDate, mocks.mockInventorySalesDetails[0].statDate);
assert.equal(secondRead.inventorySalesDetails[0].statDate, '2000-01-01');
console.log('通过：日期边界、默认/清空/重置、历史范围、查询导出一致、未查询输入、全分页导出、条件与数据副本、历史任务兼容、跨日期刷新稳定、Excel结构。时区：' + Intl.DateTimeFormat().resolvedOptions().timeZone);
