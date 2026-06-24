import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

export default function HomePage() {
  const { user, profile } = useAuth();

  const getButtonProps = () => {
    if (!user) {
      return {
        to: "/login",
        text: "Авторизоваться"
      };
    }
    
    if (profile?.role === 'player') {
      return {
        to: "/search",
        text: "Найти команду"
      };
    }
    
    return {
      to: "/search",
      text: "Найти игрока"
    };
  };

  const buttonProps = getButtonProps();

  return (
    <div className="space-y-6">
      {/* Hero Bento Card */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden bento-glass p-8 md:p-16 flex flex-col justify-center min-h-[50vh]"
      >
        <div className="relative z-10 max-w-2xl space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black leading-tight bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-green-600 drop-shadow-sm"
          >
            Найди свою команду <br/>или идеального игрока
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-[var(--color-text-secondary)] font-medium"
          >
            Football Stock — крупнейшая биржа футбольных контактов. 
            Регистрируйся, фильтруй по параметрам и начинай играть.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-4 pt-4"
          >
            <Link 
              to={buttonProps.to} 
              className="bg-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-primary-hover transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
            >
              {buttonProps.text} <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
        
        {/* Abstract Background Element */}
        <div className="absolute -right-20 -bottom-20 opacity-10 pointer-events-none drop-shadow-2xl">
          <Trophy className="w-96 h-96 text-primary" />
        </div>
      </motion.section>
    </div>
  );
}
