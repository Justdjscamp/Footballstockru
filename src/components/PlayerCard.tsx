import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Users, CheckCircle, Search, Eye, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { UserProfile } from '../types';

interface PlayerCardProps {
  player: UserProfile;
  onContact: (uid: string) => void;
  isSent: boolean;
  isRejected?: boolean;
  isAccepted?: boolean;
  acceptedChatId?: string;
}

export default function PlayerCard({ player, onContact, isSent, isRejected, isAccepted, acceptedChatId }: PlayerCardProps) {
  const navigate = useNavigate();

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      onClick={() => navigate(`/player/${player.uid}`)}
      className="bento-glass p-3 sm:p-4 rounded-3xl flex flex-col group cursor-pointer relative overflow-hidden bento-hover border border-black/5 dark:border-white/5"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex flex-col items-center text-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <img 
          src={player.photoURL || `https://ui-avatars.com/api/?name=${player.displayName}&background=166534&color=fff`} 
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl object-cover shadow-sm group-hover:shadow-md transition-shadow ring-2 ring-black/5 dark:ring-white/10"
          alt={player.displayName}
        />
        
        <div className="w-full min-w-0 px-1">
          <h3 className="font-black text-sm sm:text-base text-[var(--color-text-primary)] truncate">{player.displayName}</h3>
          <p className="text-primary font-black text-[9px] sm:text-[10px] uppercase tracking-widest mt-0.5 truncate">{player.playerProfile?.position || 'Игрок'}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:gap-2 mb-3 sm:mb-4 text-[11px] sm:text-xs font-medium bg-black/5 dark:bg-white/5 p-2 sm:p-3 rounded-2xl w-full">
        <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--color-text-secondary)]">
          <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70 shrink-0" />
          <span className="truncate">{player.playerProfile?.gameFormat || 'Любой'}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--color-text-secondary)]">
          <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70 shrink-0" />
          <span className="truncate">{player.playerProfile?.metroStations?.[0] || 'Любая'}</span>
        </div>
      </div>

      <div className="mt-auto w-full">
        {isAccepted ? (
          <button 
            onClick={(e) => { e.stopPropagation(); if(acceptedChatId) navigate(`/chat/${acceptedChatId}`); }}
            className="w-full py-2.5 px-3 font-bold rounded-xl transition-all flex justify-center items-center gap-1.5 text-xs sm:text-sm bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
          >
            Перейти в чат
          </button>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); onContact(player.uid); }}
            disabled={isSent || isRejected}
            className={`w-full py-2.5 px-3 font-bold rounded-xl transition-all flex justify-center items-center gap-1.5 text-xs sm:text-sm ${
              isRejected
                ? 'bg-red-500/10 text-red-500 cursor-not-allowed opacity-70'
                : isSent 
                  ? 'bg-primary/10 text-primary' 
                  : 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20'
            }`}
          >
            {isRejected ? 'Отклонено' : isSent ? <><Clock className="w-4 h-4"/> В ожидании</> : 'Пригласить'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
