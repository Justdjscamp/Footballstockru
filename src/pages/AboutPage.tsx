import React from 'react';
import { Trophy, Users, ShieldCheck, MapPin } from 'lucide-react';
import { motion } from 'motion/react';

export default function AboutPage() {
  return (
    <div className="space-y-12 pb-12 mt-6">
      <section className="text-center space-y-4 pt-8">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-black text-[var(--color-text-primary)] tracking-tight drop-shadow-sm"
        >
          О проекте Football Stock
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-[var(--color-text-secondary)] max-w-2xl mx-auto font-medium text-lg leading-relaxed"
        >
          Мы создаем платформу, которая объединяет футбольное сообщество, 
          делая поиск игроков и команд простым и эффективным.
        </motion.p>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-3 gap-6">
        {[
          {
            icon: Users,
            title: "Для футболистов",
            desc: "Укажи позицию, формат игры и метро. Найди команду, которая ищет именно тебя."
          },
          {
            icon: ShieldCheck,
            title: "Для менеджеров",
            desc: "Создай профиль команды, укажи турниры и позиции для усиления. Выбирай лучших."
          },
          {
            icon: MapPin,
            title: "Удобная логистика",
            desc: "Фильтрация по станциям метро позволяет находить игры рядом с домом или работой."
          }
        ].map((feature, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bento-glass p-8 bento-hover"
          >
            <div className="bg-primary/20 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-primary/20">
              <feature.icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-xl font-black text-[var(--color-text-primary)] mb-3">{feature.title}</h3>
            <p className="text-[var(--color-text-secondary)] font-medium leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </section>

      {/* Stats/Trust */}
      <section className="bento-glass p-8 md:p-12 text-center space-y-12">
        <h2 className="text-3xl font-black text-[var(--color-text-primary)] tracking-tight">Почему выбирают Football Stock?</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Игроков", value: "10,000+" },
            { label: "Команд", value: "500+" },
            { label: "Контактов", value: "25,000+" },
            { label: "Городов", value: "15" }
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl border border-white/10 dark:border-white/5 backdrop-blur-md"
            >
              <div className="text-3xl md:text-4xl font-black text-primary mb-2 drop-shadow-sm">{stat.value}</div>
              <div className="text-xs text-[var(--color-text-secondary)] font-bold uppercase tracking-widest">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
