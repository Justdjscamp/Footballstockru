import React from 'react';
import { ShieldCheck, FileText, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 pt-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-primary transition-colors font-bold uppercase tracking-widest text-xs"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-glass p-8 md:p-12 space-y-8"
      >
        <div className="flex items-center gap-4 border-b border-black/5 dark:border-white/5 pb-6">
          <div className="bg-primary/20 p-3 rounded-2xl">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">Пользовательское соглашение</h1>
            <p className="text-[var(--color-text-secondary)] text-sm font-bold uppercase tracking-widest mt-1">Редакция от 23 июня 2026 г.</p>
          </div>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-[var(--color-text-primary)] font-medium leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">1.</span> Общие положения
            </h2>
            <p>
              Настоящее Соглашение определяет условия использования сервиса Football Stock (далее — «Сервис»).
              Используя Сервис, вы подтверждаете свое полное и безоговорочное согласие с условиями настоящего Соглашения.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">2.</span> Описание услуг
            </h2>
            <p>
              Football Stock предоставляет платформу для поиска футбольных контактов. Сервис позволяет игрокам размещать анкеты, а менеджерам команд находить игроков.
              Сервис взимает плату за открытие контактных данных пользователей.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">3.</span> Финансовые условия
            </h2>
            <p>
              Пополнение баланса осуществляется через платежную систему CloudPayments.
              Средства холдируются (замораживаются) в момент отправки запроса на контакт и списываются только после подтверждения запроса принимающей стороной.
              В случае отклонения запроса средства возвращаются на баланс пользователя внутри Сервиса.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">4.</span> Ответственность
            </h2>
            <p>
              Сервис не является стороной соглашений между игроками и командами и не гарантирует достоверность данных, размещаемых пользователями.
              Мы не несем ответственности за любые конфликты или ущерб, возникшие в результате личного взаимодействия пользователей вне Сервиса.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">5.</span> Интеллектуальная собственность
            </h2>
            <p>
              Все элементы дизайна, логотипы и программный код являются собственностью Football Stock. Копирование или использование материалов без разрешения запрещено.
            </p>
          </section>
        </div>
      </motion.section>
    </div>
  );
}
