import { useCallback, useEffect, useState } from "react";
import {
  bankAccountsRepo, transactionsRepo, receivablesRepo, payablesRepo,
  type BankAccount, type FinanceTransaction, type Receivable, type Payable, type TxType,
} from "@/services/finance.service";

export function useBankAccounts() {
  const [data, setData] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setData(await bankAccountsRepo.list());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

export function useTransactions(filters: { type?: TxType; from?: string; to?: string } = {}) {
  const [data, setData] = useState<FinanceTransaction[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, net: 0 });
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(filters);
  const refresh = useCallback(async () => {
    setLoading(true);
    const [list, sm] = await Promise.all([transactionsRepo.list(filters), transactionsRepo.summary()]);
    setData(list);
    setSummary(sm);
    setLoading(false);
  }, [key]); // eslint-disable-line
  useEffect(() => { refresh(); }, [refresh]);
  return { data, summary, loading, refresh };
}

export function useReceivables(status?: string) {
  const [data, setData] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setData(await receivablesRepo.list(status));
    setLoading(false);
  }, [status]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

export function usePayables(status?: string) {
  const [data, setData] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setData(await payablesRepo.list(status));
    setLoading(false);
  }, [status]);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}
