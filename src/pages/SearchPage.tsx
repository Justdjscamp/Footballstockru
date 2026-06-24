import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData, orderBy } from 'firebase/firestore';
import { UserProfile, Team, ContactRequest } from '../types';
import { useAuth } from '../hooks/useAuth';
import { sendContactRequest, handleFirestoreError, OperationType } from '../services/firebaseService';
import { FOOTBALL_POSITIONS, SPB_METRO_STATIONS } from '../constants';
import { toast } from 'sonner';
import { Search, Filter, MapPin, Users, Trophy, MessageCircle, ArrowRight, X, Clock, LayoutGrid, List, Eye, Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import PlayerCard from '../components/PlayerCard';
import TeamCard from '../components/TeamCard';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function SearchPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState<'players' | 'teams'>('players');
  const [fetchedResults, setFetchedResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [filters, setFilters] = useState({
    position: '',
    gameFormat: '',
    metro: ''
  });

  const [rejectedRequests, setRejectedRequests] = useState<Set<string>>(new Set());
  const [acceptedRequests, setAcceptedRequests] = useState<Map<string, string>>(new Map());
  const [confirmModal, setConfirmModal] = useState<{uid: string, teamId?: string, name: string} | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Listen to current user's sent requests to update button states
    const q = query(
      collection(db, 'contactRequests'),
      where('fromUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingIds = new Set<string>();
      const rejectedIds = new Set<string>();
      const acceptedMap = new Map<string, string>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data() as ContactRequest;
        if (data.status === 'pending') {
          if (data.teamId) {
            pendingIds.add(data.teamId);
          } else {
            pendingIds.add(data.toUid);
          }
        } else if (data.status === 'accepted') {
          if (data.teamId) {
            acceptedMap.set(data.teamId, doc.id);
          } else {
            acceptedMap.set(data.toUid, doc.id);
          }
        } else if (data.status === 'rejected') {
          if (data.teamId) {
            rejectedIds.add(data.teamId);
          } else {
            rejectedIds.add(data.toUid);
          }
        }
      });
      setSentRequests(pendingIds);
      setRejectedRequests(rejectedIds);
      setAcceptedRequests(acceptedMap);
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    setSearchType(profile.role === 'manager' ? 'players' : 'teams');
  }, [profile]);

  const fetchResults = async (isLoadMore = false) => {
    if (!user || !profile) return;
    
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoadingResults(true);
      setFetchedResults([]);
      setHasMore(true);
      setLastVisible(null);
    }

    try {
      const collectionName = searchType === 'players' ? 'users' : 'teams';
      let q = query(collection(db, collectionName));

      if (searchType === 'players') {
        q = query(q, where('role', '==', 'player'));
        if (filters.gameFormat) q = query(q, where('playerProfile.gameFormat', '==', filters.gameFormat));
        if (filters.position) q = query(q, where('playerProfile.position', '==', filters.position));
        if (filters.metro) q = query(q, where('playerProfile.metroStations', 'array-contains', filters.metro));
      } else {
        if (filters.gameFormat) q = query(q, where('gameFormat', '==', filters.gameFormat));
        if (filters.position) q = query(q, where('reinforcementPositions', 'array-contains', filters.position));
      }

      q = query(q, orderBy('createdAt', 'desc'), limit(12));

      if (isLoadMore && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const snapshot = await getDocs(q);
      const newDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === 12);

      if (isLoadMore) {
        setFetchedResults(prev => [...prev, ...newDocs]);
      } else {
        setFetchedResults(newDocs);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, searchType === 'players' ? 'users' : 'teams');
    } finally {
      if (isLoadMore) setLoadingMore(false);
      else setLoadingResults(false);
    }
  };

  useEffect(() => {
    fetchResults(false);
  }, [searchType, filters, user, profile]);

  const results = fetchedResults;

  const openConfirmModal = (targetUid: string, teamId?: string) => {
    if (!user) {
      toast.error('Пожалуйста, войдите в систему');
      return;
    }
    if (user.uid === targetUid) {
      toast.error('Вы не можете отправить запрос самому себе');
      return;
    }

    let name = '';
    if (teamId) {
      const team = results.find(t => t.id === teamId);
      if (team) name = team.name;
    } else {
      const player = results.find(p => p.uid === targetUid);
      if (player) name = player.displayName;
    }

    setConfirmModal({ uid: targetUid, teamId, name: name || 'Пользователь' });
  };

  const handleConfirmRequest = async () => {
    if (!confirmModal || !user) return;
    setIsConfirming(true);
    try {
      const price = 1; // 1 ruble as requested
      await sendContactRequest(user.uid, confirmModal.uid, price, confirmModal.teamId);
      toast.success('Запрос отправлен!');
      setConfirmModal(null);
    } catch (error: any) {
      toast.error(error.message || 'Ошибка отправки запроса');
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Загрузка...</div>;

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Search Header */}
      <div className="bento-glass p-6 space-y-6 mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black uppercase tracking-tighter">
            {profile?.role === 'manager' ? 'Поиск игроков' : 'Поиск команд'}
          </h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-xl transition-all",
                viewMode === 'grid' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-xl transition-all",
                viewMode === 'list' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-[var(--color-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] w-5 h-5 pointer-events-none" />
            <input 
              type="text" 
              placeholder={searchType === 'players' ? "Поиск по имени..." : "Поиск по названию..."}
              className="bento-input pl-14"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-4 rounded-2xl transition-all",
              showFilters 
                ? "bg-primary text-white shadow-lg shadow-primary/20" 
                : "bg-black/5 dark:bg-white/5 text-[var(--color-text-primary)] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5"
            )}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 gap-4 pt-2 overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <select 
                  className="bento-input appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em]"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")' }}
                  value={filters.gameFormat}
                  onChange={(e) => setFilters({...filters, gameFormat: e.target.value})}
                >
                  <option value="">Любой формат</option>
                  <option value="5x5">5x5</option>
                  <option value="8x8">8x8</option>
                  <option value="11x11">11x11</option>
                </select>
                <select 
                  className="bento-input appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em]"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")' }}
                  value={filters.position}
                  onChange={(e) => setFilters({...filters, position: e.target.value})}
                >
                  <option value="">Любая позиция</option>
                  {FOOTBALL_POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <select 
                className="bento-input appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em]"
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")' }}
                value={filters.metro}
                onChange={(e) => setFilters({...filters, metro: e.target.value})}
              >
                <option value="">Любое метро</option>
                {SPB_METRO_STATIONS.map(station => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
              <button 
                onClick={() => setFilters({ position: '', gameFormat: '', metro: '' })}
                className="text-xs font-bold text-[var(--color-text-secondary)] hover:text-accent transition-colors text-right px-2 uppercase tracking-widest pt-2"
              >
                Сбросить фильтры
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Results */}
      <div className={cn(
        "grid gap-4 sm:gap-6",
        viewMode === 'grid' 
          ? (searchType === 'players' ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")
          : "grid-cols-1 lg:grid-cols-2"
      )}>
        {loadingResults ? (
          <div className="text-center py-20 text-[var(--color-text-secondary)] flex flex-col items-center gap-4 col-span-full">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-bold tracking-widest uppercase">Поиск...</p>
          </div>
        ) : results.length > 0 ? (
          <>
            {results.map((item) => (
              viewMode === 'grid' ? (
                searchType === 'players' ? (
                  <PlayerCard 
                    key={item.id} 
                    player={item} 
                    onContact={openConfirmModal} 
                    isSent={sentRequests.has(item.uid)} 
                    isRejected={rejectedRequests.has(item.uid)}
                    isAccepted={acceptedRequests.has(item.uid)}
                    acceptedChatId={acceptedRequests.get(item.uid)}
                  />
                ) : (
                  <TeamCard
                    key={item.id}
                    team={item}
                    onContact={openConfirmModal}
                    isSent={sentRequests.has(item.id)}
                    isRejected={rejectedRequests.has(item.id)}
                    isAccepted={acceptedRequests.has(item.id)}
                    acceptedChatId={acceptedRequests.get(item.id)}
                  />
                )
              ) : (
              <div 
                key={item.id} 
                onClick={() => {
                  if (searchType === 'players') {
                    navigate(`/player/${item.uid}`);
                  } else {
                    navigate(`/team/${item.id}`);
                  }
                }}
                className="bento-glass p-5 sm:p-6 bento-hover group flex flex-col cursor-pointer relative overflow-hidden rounded-3xl border border-black/5 dark:border-white/5"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex gap-4 sm:gap-6 flex-col sm:flex-row flex-1">
                  {searchType === 'players' ? (
                    <>
                      <div className="flex-shrink-0 relative self-start">
                        <img 
                          src={item.photoURL || `https://ui-avatars.com/api/?name=${item.displayName}&background=166534&color=fff`} 
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-sm group-hover:shadow-md ring-2 ring-black/5 dark:ring-white/10 transition-shadow"
                          alt=""
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-black text-xl text-[var(--color-text-primary)] truncate">{item.displayName}</h3>
                            <p className="text-primary font-bold text-sm uppercase tracking-tighter mt-1">{item.playerProfile?.position || 'Позиция не указана'}</p>
                          </div>
                          <span className="bg-black/5 dark:bg-white/5 p-2 rounded-xl text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors hidden sm:block">
                            <Eye className="w-5 h-5" />
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4 text-sm font-medium">
                          <span className="bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-xl flex items-center gap-2 text-[var(--color-text-secondary)]">
                            <Users className="w-4 h-4 opacity-70" /> {item.playerProfile?.gameFormat || 'Любой'}
                          </span>
                          {item.playerProfile?.metroStations?.slice(0,2).map((s: string, idx: number) => (
                            <span key={idx} className="bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-xl flex items-center gap-2 text-[var(--color-text-secondary)]">
                              <MapPin className="w-4 h-4 opacity-70" /> {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                       <div className="flex-shrink-0 relative self-start">
                        <img 
                          src={item.logoURL || `https://ui-avatars.com/api/?name=${item.name}&background=166534&color=fff`} 
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-sm group-hover:shadow-md ring-2 ring-black/5 dark:ring-white/10 transition-shadow"
                          alt=""
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-black text-xl text-[var(--color-text-primary)] truncate">{item.name}</h3>
                            <p className="text-primary font-bold text-sm uppercase tracking-tighter mt-1">{item.gameFormat || 'Формат не указан'}</p>
                          </div>
                          <span className="bg-black/5 dark:bg-white/5 p-2 rounded-xl text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors hidden sm:block">
                            <Eye className="w-5 h-5" />
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-4 text-sm font-medium">
                          {item.tournaments?.length > 0 && (
                            <span className="flex items-center gap-2 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-xl text-[var(--color-text-secondary)]">
                              <Trophy className="w-4 h-4 text-primary" /> {item.tournaments[0]}
                            </span>
                          )}
                          <span className="flex items-center gap-2 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-xl text-[var(--color-text-secondary)]">
                            <Users className="w-4 h-4 opacity-70" /> Игроков: {item.members?.length || 0}
                          </span>
                        </div>
                        {item.description && (
                          <p className="mt-4 text-[var(--color-text-secondary)] text-sm line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="mt-6 sm:mt-auto pt-6 border-t border-black/5 dark:border-white/5 flex gap-3 justify-end items-center">
                  <span className="sm:hidden text-[var(--color-text-secondary)] bg-black/5 dark:bg-white/5 p-3 rounded-xl flex items-center justify-center">
                    <Eye className="w-5 h-5" />
                  </span>
                  {searchType === 'players' ? (
                    acceptedRequests.has(item.uid) ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate(`/chat/${acceptedRequests.get(item.uid)}`); }}
                        className="flex-1 sm:w-auto px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
                      >
                        Перейти в чат
                      </button>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); openConfirmModal(item.uid); }}
                        disabled={sentRequests.has(item.uid) || rejectedRequests.has(item.uid)}
                        className={cn(
                          "flex-1 sm:w-auto px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all",
                          rejectedRequests.has(item.uid)
                            ? 'bg-red-500/10 text-red-500 cursor-not-allowed opacity-70'
                            : sentRequests.has(item.uid) 
                              ? 'bg-primary/10 text-primary cursor-default' 
                              : 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20'
                        )}
                      >
                        {rejectedRequests.has(item.uid) ? 'Отклонено' : sentRequests.has(item.uid) ? (
                          <><Clock className="w-4 h-4" /> В ожидании</>
                        ) : (
                          <><MessageCircle className="w-4 h-4" /> Пригласить</>
                        )}
                      </button>
                    )
                  ) : (
                    acceptedRequests.has(item.id) ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate(`/chat/${acceptedRequests.get(item.id)}`); }}
                        className="flex-1 sm:w-auto px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
                      >
                        Перейти в чат
                      </button>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); openConfirmModal(item.managerUid, item.id); }}
                        disabled={sentRequests.has(item.id) || rejectedRequests.has(item.id)}
                        className={cn(
                          "flex-1 sm:w-auto px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all",
                          rejectedRequests.has(item.id)
                            ? 'bg-red-500/10 text-red-500 cursor-not-allowed opacity-70'
                            : sentRequests.has(item.id) 
                              ? 'bg-primary/10 text-primary cursor-default' 
                              : 'bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20'
                        )}
                      >
                        {rejectedRequests.has(item.id) ? 'Отклонено' : sentRequests.has(item.id) ? (
                          <><Clock className="w-4 h-4" /> В ожидании</>
                        ) : (
                          <><MessageCircle className="w-4 h-4" /> Написать</>
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          ))}
          {hasMore && (
            <div className="col-span-full mt-8 flex justify-center">
              <button 
                onClick={() => fetchResults(true)}
                disabled={loadingMore}
                className="px-8 py-3 rounded-xl bento-glass font-bold text-sm uppercase tracking-widest text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка...' : 'Загрузить еще'}
              </button>
            </div>
          )}
        </>
        ) : (
          <div className="text-center py-20 bento-glass border-2 border-dashed border-black/10 dark:border-white/10 col-span-full">
            <div className="w-20 h-20 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-10 h-10 text-[var(--color-text-secondary)]" />
            </div>
            <p className="text-[var(--color-text-primary)] font-black uppercase tracking-widest text-lg mb-2">Ничего не найдено</p>
            <p className="text-sm text-[var(--color-text-secondary)] font-medium">Попробуйте изменить параметры фильтра</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => !isConfirming && setConfirmModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bento-glass rounded-3xl p-6 shadow-2xl border border-white/10 dark:border-white/5 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4">
                <button
                  onClick={() => !isConfirming && setConfirmModal(null)}
                  className="text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>

              <h3 className="text-xl font-black text-white mb-2 tracking-tight">Подтверждение запроса</h3>
              
              <div className="bg-white/5 rounded-2xl p-4 mb-6">
                <p className="text-sm text-gray-300 leading-relaxed font-medium">
                  Для открытия чата с <span className="text-white font-bold">{confirmModal.name}</span> на вашем балансе будет холдировано <span className="text-primary font-bold">1 ₽</span>.
                  <br className="my-2" />
                  Сумма спишется только после принятия заявки.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-white/10 hover:bg-white/15 text-white transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmRequest}
                  disabled={isConfirming}
                  className="flex-1 px-4 py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all flex items-center justify-center disabled:opacity-70"
                >
                  {isConfirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Подтвердить'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
