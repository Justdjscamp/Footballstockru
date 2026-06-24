import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { MapPin, Users, Trophy, ChevronLeft, Calendar, Info, Clock, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

export default function PublicPlayerPage() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [player, setPlayer] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (uid) {
      getDoc(doc(db, 'users', uid)).then(snap => {
        if (snap.exists()) {
          setPlayer(snap.data() as UserProfile);
        }
        setLoading(false);
      });
    }
  }, [uid]);

  if (loading) return <div className="p-8 text-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></div>;
  if (!player) return <div className="p-8 text-center text-red-500">Игрок не найден</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 md:pb-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
        <ChevronLeft className="w-5 h-5" /> Назад
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-1 space-y-6">
          <div className="bento-glass p-8 flex flex-col items-center text-center">
            <div className="relative mb-6">
              <img 
                src={player.photoURL || `https://ui-avatars.com/api/?name=${player.displayName}&background=166534&color=fff`} 
                className="w-40 h-40 rounded-[2rem] object-cover shadow-2xl border-4 border-white/10"
                alt=""
              />
              <div className="absolute -bottom-3 -right-3 bg-primary text-white p-2.5 rounded-2xl shadow-lg border-2 border-green-900 border-opacity-50">
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white">{player.displayName}</h1>
            <p className="text-primary font-bold mt-1 uppercase tracking-widest">{player.playerProfile?.position || 'Позиция не указана'}</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 space-y-6">
          <div className="bento-glass p-8">
            <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
              <Info className="w-5 h-5 text-primary" /> Профиль игрока
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Опыт игры</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  {player.playerProfile?.experience || 'Не указан'}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Формат игры</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  {player.playerProfile?.gameFormat || 'Любой'}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Возраст</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  {(player.playerProfile as any)?.age ? `${(player.playerProfile as any).age} лет` : 'Не указан'}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Ст. Метро (Локации)</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary shadow-sm" />
                  <span className="truncate">{player.playerProfile?.metroStations?.join(', ') || 'Не указано'}</span>
                </div>
              </div>
            </div>

            {(player.playerProfile as any)?.about && (
              <div className="mt-8 pt-6 border-t border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">О себе</p>
                <p className="text-gray-300 text-sm leading-relaxed">{(player.playerProfile as any)?.about}</p>
              </div>
            )}
            {(player.playerProfile as any)?.achievements && (
              <div className="mt-6 pt-6 border-t border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Достижения</p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{(player.playerProfile as any)?.achievements}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
