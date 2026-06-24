import React from 'react';
import { FileText, Lock, ArrowLeft, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function PrivacyPage() {
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
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">Политика конфиденциальности</h1>
            <p className="text-[var(--color-text-secondary)] text-sm font-bold uppercase tracking-widest mt-1">В соответствии с 152-ФЗ РФ</p>
          </div>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-[var(--color-text-primary)] font-medium leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">1.</span> Какие данные мы собираем
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-[var(--color-text-secondary)]">
              <li>ФИО и отображаемое имя;</li>
              <li>Номер телефона (для авторизации);</li>
              <li>Фотографию профиля;</li>
              <li>Информацию о спортивном опыте и предпочтениях;</li>
              <li>Технические данные (IP-адрес, тип устройства).</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">2.</span> Цели обработки
            </h2>
            <p>
              Ваши данные используются исключительно для обеспечения работы Сервиса: идентификации пользователей, обеспечения безопасности платежей и предоставления возможности связи между игроками и командами.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">3.</span> Передача третьим лицам
            </h2>
            <p>
              Мы не продаем ваши данные. Передача возможна только:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[var(--color-text-secondary)]">
              <li>Платежной системе CloudPayments для обработки транзакций;</li>
              <li>Сервису Firebase (Google) для хранения данных и авторизации;</li>
              <li>В случаях, прямо предусмотренных законодательством РФ.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">4.</span> Защита данных
            </h2>
            <p>
              Мы используем современные методы шифрования данных и защищенные протоколы передачи информации (HTTPS). Доступ к вашим персональным данным строго ограничен.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-black flex items-center gap-2">
              <span className="text-primary">5.</span> Ваши права
            </h2>
            <p>
              Вы имеете право в любой момент изменить свои данные в профиле или полностью удалить аккаунт вместе со всеми данными через настройки приложения.
            </p>
          </section>

          <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/5 mt-10">
            <div className="flex items-start gap-4">
              <Globe className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div className="text-sm">
                <p className="font-black uppercase tracking-widest text-primary mb-2">Важное примечание</p>
                <p className="text-[var(--color-text-secondary)]">
                  Пользуясь Сервисом, вы соглашаетесь с тем, что ваши персональные данные могут обрабатываться с использованием облачных сервисов, обеспечивающих высокий уровень безопасности.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
