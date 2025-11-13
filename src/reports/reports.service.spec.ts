import fs from 'fs';
import os from 'os';
import path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);

    originalCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reports-service-'));
    process.chdir(tmpRoot);
    fs.mkdirSync(path.join(tmpRoot, 'tmp'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'out'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('generates aggregated account balances', async () => {
    const journalPath = path.join('tmp', 'journal.csv');
    fs.writeFileSync(
      journalPath,
      [
        '2024-01-01,Cash,,150.50,0',
        '2024-01-02,Revenue,,0,50',
        '2024-01-03,Cash,,25,0',
      ].join('\n'),
    );

    await service.accounts();

    const csv = fs.readFileSync(path.join('out', 'accounts.csv'), 'utf-8').trim();
    expect(csv.split('\n')).toEqual([
      'Account,Balance',
      'Cash,175.50',
      'Revenue,-50.00',
    ]);
    expect(service.state('accounts')).toMatch(/^finished in/);
  });

  it('aggregates yearly cash balances', async () => {
    const journalPath = path.join('tmp', 'cash.csv');
    fs.writeFileSync(
      journalPath,
      [
        '2023-12-31,Cash,,100,0',
        '2024-01-01,Cash,,50,0',
        '2024-06-01,Cash,,0,25',
        '2024-07-04,Revenue,,10,0',
      ].join('\n'),
    );

    await service.yearly();

    const csv = fs.readFileSync(path.join('out', 'yearly.csv'), 'utf-8').trim();
    expect(csv.split('\n')).toEqual([
      'Financial Year,Cash Balance',
      '2023,100.00',
      '2024,25.00',
    ]);
    expect(service.state('yearly')).toMatch(/^finished in/);
  });

  it('produces a financial statement report', async () => {
    fs.writeFileSync(
      path.join('tmp', 'statement.csv'),
      [
        '2024-01-01,Sales Revenue,,0,100',
        '2024-01-02,Cost of Goods Sold,,60,0',
        '2024-01-03,Cash,,150,0',
        '2024-01-04,Accounts Receivable,,40,0',
        '2024-01-05,Accounts Payable,,0,80',
        '2024-01-06,Common Stock,,200,0',
      ].join('\n'),
    );

    await service.fs();

    const csv = fs.readFileSync(path.join('out', 'fs.csv'), 'utf-8').split('\n');
    expect(csv).toEqual([
      'Basic Financial Statement',
      '',
      'Income Statement',
      'Sales Revenue,-100.00',
      'Cost of Goods Sold,60.00',
      'Salaries Expense,0.00',
      'Rent Expense,0.00',
      'Utilities Expense,0.00',
      'Interest Expense,0.00',
      'Tax Expense,0.00',
      'Net Income,-160.00',
      '',
      'Balance Sheet',
      'Assets',
      'Cash,150.00',
      'Accounts Receivable,40.00',
      'Inventory,0.00',
      'Fixed Assets,0.00',
      'Prepaid Expenses,0.00',
      'Total Assets,190.00',
      '',
      'Liabilities',
      'Accounts Payable,-80.00',
      'Loan Payable,0.00',
      'Sales Tax Payable,0.00',
      'Accrued Liabilities,0.00',
      'Unearned Revenue,0.00',
      'Dividends Payable,0.00',
      'Total Liabilities,-80.00',
      '',
      'Equity',
      'Common Stock,200.00',
      'Retained Earnings,0.00',
      'Retained Earnings (Net Income),-160.00',
      'Total Equity,40.00',
      '',
      'Assets = Liabilities + Equity,190.00 = -40.00',
    ]);
    expect(service.state('fs')).toMatch(/^finished in/);
  });
});
