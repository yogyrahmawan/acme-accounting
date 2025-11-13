import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { createInterface } from 'readline';

@Injectable()
export class ReportsService {
  private states = {
    accounts: 'idle',
    yearly: 'idle',
    fs: 'idle',
  };

  state(scope: string) {
    return this.states[scope];
  }

  async accounts() {
    this.states.accounts = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/accounts.csv';
    const accountBalances: Record<string, number> = {};
    try {
      const files = await fs.promises.readdir(tmpDir);
      for (const file of files) {
        if (!file.endsWith('.csv')) {
          continue;
        }

        const filePath = path.join(tmpDir, file);
        for await (const [, account, , debit, credit] of this.iterateCsvRows(filePath)) {
          if (!accountBalances[account]) {
            accountBalances[account] = 0;
          }
          accountBalances[account] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      }
      const rows: string[][] = [['Account', 'Balance']];
      for (const [account, balance] of Object.entries(accountBalances)) {
        rows.push([account, balance.toFixed(2)]);
      }
      await this.writeCsv(outputFile, rows);
      this.states.accounts = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.accounts = `failed: ${(error as Error).message}`;
      throw error;
    }
  }

  async yearly() {
    this.states.yearly = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/yearly.csv';
    const cashByYear: Record<string, number> = {};
    try {
      const files = await fs.promises.readdir(tmpDir);
      for (const file of files) {
        if (!file.endsWith('.csv') || file === 'yearly.csv') {
          continue;
        }
        const filePath = path.join(tmpDir, file);
        for await (const [date, account, , debit, credit] of this.iterateCsvRows(filePath)) {
          if (account !== 'Cash') {
            continue;
          }
          const year = new Date(date).getFullYear();
          if (!cashByYear[year]) {
            cashByYear[year] = 0;
          }
          cashByYear[year] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      }
      const rows: string[][] = [['Financial Year', 'Cash Balance']];
      Object.keys(cashByYear)
        .sort()
        .forEach((year) => {
          rows.push([year, cashByYear[year].toFixed(2)]);
        });
      await this.writeCsv(outputFile, rows);
      this.states.yearly = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.yearly = `failed: ${(error as Error).message}`;
      throw error;
    }
  }

  async fs() {
    this.states.fs = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/fs.csv';
    const categories = {
      'Income Statement': {
        Revenues: ['Sales Revenue'],
        Expenses: [
          'Cost of Goods Sold',
          'Salaries Expense',
          'Rent Expense',
          'Utilities Expense',
          'Interest Expense',
          'Tax Expense',
        ],
      },
      'Balance Sheet': {
        Assets: [
          'Cash',
          'Accounts Receivable',
          'Inventory',
          'Fixed Assets',
          'Prepaid Expenses',
        ],
        Liabilities: [
          'Accounts Payable',
          'Loan Payable',
          'Sales Tax Payable',
          'Accrued Liabilities',
          'Unearned Revenue',
          'Dividends Payable',
        ],
        Equity: ['Common Stock', 'Retained Earnings'],
      },
    };
    const balances: Record<string, number> = {};
    for (const section of Object.values(categories)) {
      for (const group of Object.values(section)) {
        for (const account of group) {
          balances[account] = 0;
        }
      }
    }
    try {
      const files = await fs.promises.readdir(tmpDir);
      for (const file of files) {
        if (!file.endsWith('.csv') || file === 'fs.csv') {
          continue;
        }
        const filePath = path.join(tmpDir, file);
        for await (const [, account, , debit, credit] of this.iterateCsvRows(filePath)) {
          if (!balances.hasOwnProperty(account)) {
            continue;
          }
          balances[account] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      }

      const rows: string[][] = [['Basic Financial Statement']];
      rows.push(['']);
      rows.push(['Income Statement']);
      let totalRevenue = 0;
      let totalExpenses = 0;
      for (const account of categories['Income Statement']['Revenues']) {
        const value = balances[account] || 0;
        rows.push([account, value.toFixed(2)]);
        totalRevenue += value;
      }
      for (const account of categories['Income Statement']['Expenses']) {
        const value = balances[account] || 0;
        rows.push([account, value.toFixed(2)]);
        totalExpenses += value;
      }
      rows.push(['Net Income', (totalRevenue - totalExpenses).toFixed(2)]);
      rows.push(['']);
      rows.push(['Balance Sheet']);
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      rows.push(['Assets']);
      for (const account of categories['Balance Sheet']['Assets']) {
        const value = balances[account] || 0;
        rows.push([account, value.toFixed(2)]);
        totalAssets += value;
      }
      rows.push(['Total Assets', totalAssets.toFixed(2)]);
      rows.push(['']);
      rows.push(['Liabilities']);
      for (const account of categories['Balance Sheet']['Liabilities']) {
        const value = balances[account] || 0;
        rows.push([account, value.toFixed(2)]);
        totalLiabilities += value;
      }
      rows.push(['Total Liabilities', totalLiabilities.toFixed(2)]);
      rows.push(['']);
      rows.push(['Equity']);
      for (const account of categories['Balance Sheet']['Equity']) {
        const value = balances[account] || 0;
        rows.push([account, value.toFixed(2)]);
        totalEquity += value;
      }
      rows.push([
        'Retained Earnings (Net Income)',
        (totalRevenue - totalExpenses).toFixed(2),
      ]);
      totalEquity += totalRevenue - totalExpenses;
      rows.push(['Total Equity', totalEquity.toFixed(2)]);
      rows.push(['']);
      rows.push([
        'Assets = Liabilities + Equity',
        `${totalAssets.toFixed(2)} = ${(totalLiabilities + totalEquity).toFixed(2)}`,
      ]);
      await this.writeCsv(outputFile, rows);
      this.states.fs = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    } catch (error) {
      this.states.fs = `failed: ${(error as Error).message}`;
      throw error;
    }
  }

  private async *iterateCsvRows(filePath: string): AsyncGenerator<string[]> {
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        yield trimmed.split(',');
      }
    } finally {
      rl.close();
      stream.destroy();
    }
  }

  private async writeCsv(filePath: string, rows: string[][]) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
    try {
      rows.forEach((row, index) => {
        const [first, ...rest] = row;
        const serialized = [
          first,
          ...rest.map((cell) => {
            if (cell.includes(',')) {
              return `"${cell}"`;
            }
            return cell;
          }),
        ].join(',');
        if (index > 0) {
          stream.write('\n');
        }
        stream.write(serialized);
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.end(() => resolve());
        stream.on('error', reject);
      });
    }
  }
}
