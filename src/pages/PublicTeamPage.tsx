import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Team, UserProfile } from '../types';
import { Trophy, ChevronLeft, MapPin, Users, Info, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

export default function PublicTeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [team, setTeam] = useState<{ team: Team, manager?: UserProfile } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (teamId) {
      getDoc(doc(db, 'teams', teamId)).then(async snap => {
        if (snap.exists()) {
          const t = snap.data() as Team;
          const mgrSnap = await getDoc(doc(db, 'users', t.managerUid));
          setTeam({ team: t, manager: mgrSnap.exists() ? mgrSnap.data() as UserProfile : undefined });
        }
        setLoading(false);
      });
    }
  }, [teamId]);

  if (loading) return <div className="p-8 text-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></div>;
  if (!team) return <div className="p-8 text-center text-red-500">Команда не найдена</div>;

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
                src={team.team.logoURL || `https://ui-avatars.com/api/?name=${team.team.name}&background=166534&color=fff`} 
                className="w-40 h-40 rounded-[2rem] object-cover shadow-2xl border-4 border-white/10"
                alt=""
              />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white">{team.team.name}</h1>
            <p className="text-primary font-bold mt-1 uppercase tracking-widest">{team.team.gameFormat || 'Формат не указан'}</p>
          </div>
          
          <div className="bento-glass p-6 text-center">
            <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Менеджер</h3>
            <div className="flex items-center justify-center gap-3">
              <img 
                src={team.manager?.photoURL || `https://ui-avatars.com/api/?name=${team.manager?.displayName}`} 
                className="w-10 h-10 rounded-full bg-white/10"
                alt=""
              />
              <span className="font-bold text-white">{team.manager?.displayName || 'Неизвестно'}</span>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 space-y-6">
          <div className="bento-glass p-8">
            <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
              <Info className="w-5 h-5 text-primary" /> Информация о команде
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Участие в турнирах</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" />
                  {team.team.tournaments?.length ? team.team.tournaments[0] : 'Нет активных'}
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-1">Искомые позиции</p>
                <div className="text-white font-medium flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  {team.team.reinforcementPositions?.length ? team.team.reinforcementPositions.join(', ') : 'Не ищем'}
                </div>
              </div>
            </div>

            {team.team.description && (
              <div className="mt-8 pt-6 border-t border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">О команде</p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{team.team.description}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
