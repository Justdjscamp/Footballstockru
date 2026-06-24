import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc } from 'firebase/firestore';
import { Transaction } from '../types';
import { useAuth } from '../hooks/useAuth';
import { addTestBalance, handleFirestoreError, OperationType } from '../services/firebaseService';
import { toast } from 'sonner';
import { Wallet, CreditCard, ArrowUpRight, ArrowDownLeft, History, Plus, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Navigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function WalletPage() {
  const { user, profile, loading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTopup, setShowTopup] = useState(false);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    const handleBackButton = (e: any) => {
      if (showTopup) {
        e.preventDefault();
        setShowTopup(false);
      }
    };

    window.addEventListener('capacitorBackButton', handleBackButton);
    return () => window.removeEventListener('capacitorBackButton', handleBackButton);
  }, [showTopup]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'transactions'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });
    return () => unsubscribe();
  }, [user]);

  const handleTopup = async () => {
    if (!user || !amount) return;
    
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    const cp = (window as any).cp;
    if (!cp) {
      toast.error('Ошибка платежной системы. Пожалуйста, обновите страницу.');
      return;
    }

    const widget = new cp.CloudPayments();
    
    widget.pay('charge', {
      publicId: 'pk_a242a15cdbb38d49c5eda172c9cd5',
      description: `Пополнение баланса Football Stock: ${user.uid}`,
      amount: amountNum,
      currency: 'RUB',
      accountId: user.uid,
      email: user.email || undefined,
      data: {
        uid: user.uid,
        type: 'topup'
      }
    }, {
      onSuccess: (options: any) => {
        toast.success('Платеж успешно выполнен! Баланс обновится в течение минуты.');
        setShowTopup(false);
        setAmount('');
      },
      onFail: (reason: string, options: any) => {
        toast.error(`Ошибка оплаты: ${reason}`);
      },
      onComplete: (paymentResult: any, options: any) => {
        // Any cleanup if needed
      }
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Загрузка кошелька...</div>;

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 md:pb-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-primary to-green-800 rounded-[2.5rem] p-8 text-white shadow-xl shadow-primary/30 relative overflow-hidden bento-hover transition-all">
        <div className="relative z-10 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/80 text-sm font-bold uppercase tracking-widest">Ваш баланс</p>
              <h2 className="text-5xl font-black mt-2 drop-shadow-md">{profile.balance || 0} ₽</h2>
              {profile.heldBalance ? (
                <p className="mt-2 text-white/80 font-bold text-sm tracking-widest uppercase bg-white/20 inline-block px-3 py-1 rounded-xl backdrop-blur-md">
                  Заморожено в заявках: {profile.heldBalance} ₽
                </p>
              ) : null}
            </div>
            <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
              <Wallet className="w-8 h-8" />
            </div>
          </div>
          
          <button 
            onClick={() => setShowTopup(true)}
            className="w-full bg-white text-primary py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-green-50 transition-all active:scale-95 shadow-lg shadow-black/10"
          >
            <Plus className="w-5 h-5" /> Пополнить баланс
          </button>
        </div>
        
        {/* Abstract shapes */}
        <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-primary/40 rounded-full blur-3xl pointer-events-none" />
      </div>

      {showTopup && (
        <div className="bento-glass p-8 space-y-6 animate-in zoom-in-95 bento-hover">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tighter text-[var(--color-text-primary)]">Пополнение счета</h3>
            <button onClick={() => setShowTopup(false)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
              <CreditCard className="w-6 h-6" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] font-black text-xl">₽</span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Сумма пополнения"
                className="bento-input text-xl font-bold font-mono"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[500, 1000, 5000].map(val => (
                <button 
                  key={val}
                  onClick={() => setAmount(val.toString())}
                  className="py-4 bg-black/5 dark:bg-white/5 rounded-2xl font-black hover:bg-black/10 dark:hover:bg-white/10 text-[var(--color-text-primary)] transition-all border border-black/5 dark:border-white/5 active:scale-95"
                >
                  +{val}
                </button>
              ))}
            </div>
            <button 
              onClick={handleTopup}
              className="bento-button mt-4"
            >
              Оплатить через CloudPayments
            </button>
          </div>
        </div>
      )}

      {/* Transactions History */}
      <div className="space-y-4 bento-glass p-6">
        <h3 className="text-lg font-black uppercase tracking-tighter text-[var(--color-text-primary)] flex items-center gap-2 mb-6">
          <History className="w-5 h-5 text-[var(--color-text-secondary)]" />
          История операций
        </h3>
        <div className="space-y-3">
          {transactions.length > 0 ? transactions.map(t => (
            <div key={t.id} className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/10 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-xl shadow-inner", t.type === 'topup' ? (t.description?.toLowerCase().includes('бонус') ? 'bg-primary/20 text-primary' : 'bg-primary/20 text-primary') : 'bg-accent/20 text-accent')}>
                  {t.type === 'topup' ? (t.description?.toLowerCase().includes('бонус') ? <Gift className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />) : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-bold text-[var(--color-text-primary)]">{t.description}</div>
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium mt-1">{format(new Date(t.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}</div>
                </div>
              </div>
              <div className={cn("font-black text-lg", t.type === 'topup' ? 'text-primary' : 'text-[var(--color-text-primary)]')}>
                {t.type === 'topup' ? '+' : '-'}{t.amount} ₽
              </div>
            </div>
          )) : (
            <div className="text-center py-12 border-2 border-dashed border-white/20 dark:border-white/5 rounded-3xl opacity-60">
              <p className="text-[var(--color-text-secondary)] font-bold tracking-widest uppercase">История операций пуста</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
