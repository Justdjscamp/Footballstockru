import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  updatePlayerProfile, 
  createTeam, 
  acceptContactRequest, 
  rejectContactRequest,
  updateUserProfile,
  updateTeam,
  addTestBalance
} from '../services/firebaseService';
import { db, auth, storage } from '../firebase';
import { handleFirestoreError, OperationType } from '../services/firebaseService';
import { collection, query, where, onSnapshot, doc, getDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Team, PlayerProfile, ContactRequest, UserProfile } from '../types';
import { FOOTBALL_POSITIONS, SPB_METRO_STATIONS } from '../constants';
import { toast } from 'sonner';
import { Plus, Save, MapPin, Users, Trophy, Info, Bell, Check, X, MessageCircle, Clock, History, Camera, Upload, Coins, Pencil, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { cn } from '../lib/utils';

export default function ProfilePage() {
  const { user, profile, loading, setProfile } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<ContactRequest[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'requests'>('profile');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  
  // Cropper State
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropType, setCropType] = useState<'profile' | 'team'>('profile');
  const [editingTeamForCrop, setEditingTeamForCrop] = useState<{ id?: string, isEdit: boolean } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const teamLogoInputRef = useRef<HTMLInputElement>(null);

  // Player Profile State
  const [playerData, setPlayerData] = useState<PlayerProfile>({
    position: '',
    gameFormat: '',
    metroStations: [],
    experience: ''
  });

  // Team Creation State
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [newTeam, setNewTeam] = useState<Partial<Team>>({
    name: '',
    gameFormat: '',
    tournaments: [],
    reinforcementPositions: [],
    description: '',
    logoURL: ''
  });

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamData, setEditTeamData] = useState<Partial<Team>>({});
  const editTeamLogoInputRef = useRef<HTMLInputElement>(null);

  const [isOnboarding, setIsOnboarding] = useState(false);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'УДАЛИТЬ') return;
    try {
      setIsDeleting(true);
      const { httpsCallable } = await import('firebase/functions');
      const { functions, auth } = await import('../firebase');
      const fn = httpsCallable(functions, 'deleteUserAccount');
      await fn();
      toast.success('Аккаунт удален');
      await auth.signOut();
    } catch (error) {
      console.error(error);
      toast.error('Ошибка удаления аккаунта');
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const handleBackButton = (e: any) => {
      if (isCropping) {
        e.preventDefault();
        setIsCropping(false);
        setCropImage(null);
      } else if (showTeamForm) {
        e.preventDefault();
        setShowTeamForm(false);
      } else if (editingTeamId) {
        e.preventDefault();
        setEditingTeamId(null);
      }
    };

    window.addEventListener('capacitorBackButton', handleBackButton);
    return () => window.removeEventListener('capacitorBackButton', handleBackButton);
  }, [isCropping, showTeamForm, editingTeamId]);

  useEffect(() => {
    if (profile?.playerProfile) {
      setPlayerData({
        ...profile.playerProfile
      });
    }
    if (profile?.displayName) {
      setNewName(profile.displayName !== 'Anonymous' ? profile.displayName : '');
    }
    // Check if onboarding is needed
    if (profile && profile.displayName === 'Anonymous') {
      setIsOnboarding(true);
    }
  }, [profile]);

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    try {
      if (profile?.role === 'player') {
        if (!playerData.position || !playerData.gameFormat || playerData.metroStations.length === 0) {
          toast.error('Пожалуйста, заполните все обязательные поля');
          return;
        }
        await updatePlayerProfile(user.uid, playerData);
        setProfile(prev => prev ? { ...prev, playerProfile: playerData } : null);
      }
      
      await updateUserProfile(user.uid, { displayName: newName });
      setProfile(prev => prev ? { ...prev, displayName: newName } : null);
      
      setIsOnboarding(false);
      toast.success('Профиль успешно заполнен!');
    } catch (error) {
      toast.error('Ошибка сохранения профиля');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('No 2d context');

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const base64 = await fileToBase64(file);
      setCropImage(base64);
      setCropType('profile');
      setIsCropping(true);
    } catch (error) {
      toast.error('Ошибка чтения файла');
    }
  };

  const handleTeamLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      setCropImage(base64);
      setCropType('team');
      setEditingTeamForCrop({ isEdit });
      setIsCropping(true);
    } catch (error) {
      toast.error('Ошибка чтения файла');
    }
  };

  const handleSaveCrop = async () => {
    if (!cropImage || !croppedAreaPixels) return;

    try {
      setIsUploadingPhoto(true);
      const croppedBase64 = await getCroppedImg(cropImage, croppedAreaPixels);
      const res = await fetch(croppedBase64);
      const blob = await res.blob();
      
      let photoURL = '';

      if (cropType === 'profile' && user) {
        if (profile?.photoURL && profile.photoURL.includes('firebase')) {
          try {
            const oldRef = ref(storage, profile.photoURL);
            await deleteObject(oldRef);
          } catch (e) {
            console.error('Failed to delete old photo', e);
          }
        }
        const storageRef = ref(storage, `users/${user.uid}/profile_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        photoURL = await getDownloadURL(storageRef);

        await updateUserProfile(user.uid, { photoURL });
        setProfile(prev => prev ? { ...prev, photoURL } : null);
        toast.success('Фото обновлено');
      } else if (cropType === 'team' && editingTeamForCrop) {
        if (editingTeamForCrop.isEdit && editTeamData.logoURL && editTeamData.logoURL.includes('firebase')) {
          try {
            const oldRef = ref(storage, editTeamData.logoURL);
            await deleteObject(oldRef);
          } catch (e) {
            console.error('Failed to delete old logo', e);
          }
        }
        const uniqueId = Math.random().toString(36).substring(2, 15);
        const storageRef = ref(storage, `teams_logos/${user?.uid}_${uniqueId}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        photoURL = await getDownloadURL(storageRef);

        if (editingTeamForCrop.isEdit) {
          setEditTeamData(prev => ({ ...prev, logoURL: photoURL }));
        } else {
          setNewTeam(prev => ({ ...prev, logoURL: photoURL }));
        }
        toast.success('Логотип подготовлен');
      }

      setIsCropping(false);
      setCropImage(null);
    } catch (error) {
      console.error(error);
      toast.error('Ошибка при обработке фото');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleNameChange = async () => {
    if (!user || !newName.trim()) return;
    try {
      await updateUserProfile(user.uid, { displayName: newName });
      setProfile(prev => prev ? { ...prev, displayName: newName } : null);
      setIsEditingName(false);
      toast.success('Имя обновлено');
    } catch (error) {
      toast.error('Ошибка обновления имени');
    }
  };

  const handleGetBonus = async () => {
    if (!user) return;
    try {
      await addTestBalance(user.uid, 1000);
      setProfile(prev => prev ? { ...prev, balance: (prev.balance || 0) + 1000 } : null);
      toast.success('Пробные 1000 ₽ начислены!');
    } catch (error) {
      toast.error('Ошибка начисления бонуса');
    }
  };

  const handleStartEditTeam = (team: Team) => {
    setEditingTeamId(team.id);
    setEditTeamData(team);
    setShowTeamForm(false);
  };

  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const handleUpdateTeam = async () => {
    if (!editingTeamId) return;
    try {
      await updateTeam(editingTeamId, editTeamData);
      setEditingTeamId(null);
      setEditTeamData({});
      toast.success('Команда обновлена');
    } catch (error) {
      toast.error('Ошибка обновления команды');
    }
  };

  const handleDeleteTeamConfirm = async () => {
    if (!teamToDelete) return;
    try {
      setIsDeletingTeam(true);
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      await deleteDoc(doc(db, 'teams', teamToDelete));
      toast.success('Команда удалена');
      setTeamToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'teams');
      toast.error('Ошибка удаления команды');
    } finally {
      setIsDeletingTeam(false);
    }
  };

  useEffect(() => {
    if (user) {
      // Fetch sent requests
      const qSent = query(
        collection(db, 'contactRequests'),
        where('fromUid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const unsubscribeSent = onSnapshot(qSent, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
        setSentRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, (error) => {
        if (!auth.currentUser) return;
        handleFirestoreError(error, OperationType.GET, 'contactRequests');
      });

      // Fetch incoming pending requests
      const qReq = query(
        collection(db, 'contactRequests'), 
        where('toUid', '==', user.uid),
        where('status', '==', 'pending')
      );
      const unsubscribeReq = onSnapshot(qReq, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
        setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }, error => {
        if (!auth.currentUser) return;
        handleFirestoreError(error, OperationType.GET, 'contactRequests');
      });

      let unsubscribeTeams: (() => void) | undefined;
      if (profile?.role === 'manager') {
        const q = query(collection(db, 'teams'), where('managerUid', '==', user.uid));
        unsubscribeTeams = onSnapshot(q, (snapshot) => {
          setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
        }, error => {
          if (!auth.currentUser) return;
          handleFirestoreError(error, OperationType.GET, 'teams');
        });
      }

      return () => {
        unsubscribeSent();
        unsubscribeReq();
        if (unsubscribeTeams) unsubscribeTeams();
      };
    }
  }, [user, profile]);

  const handleAcceptRequest = async (req: ContactRequest) => {
    try {
      await acceptContactRequest(req.id, req.fromUid, req.toUid, req.price);
      toast.success('Запрос принят! Чат открыт.');
      navigate(`/chat/${req.id}`);
    } catch (error: any) {
      let msg = error.message || 'Ошибка при принятии запроса';
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) msg = parsed.error;
      // eslint-disable-next-line no-empty
      } catch (e) {}
      toast.error(msg);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectContactRequest(requestId);
      toast.info('Запрос отклонен');
    } catch (error: any) {
      toast.error(error.message || 'Ошибка при отклонении');
    }
  };

  const handleSavePlayerProfile = async () => {
    if (!user) return;
    try {
      await updatePlayerProfile(user.uid, playerData);
      setProfile(prev => prev ? { ...prev, playerProfile: playerData } : null);
      setIsEditing(false);
      toast.success('Профиль обновлен');
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const handleCreateTeam = async () => {
    if (!user) return;
    try {
      await createTeam(user.uid, newTeam);
      setShowTeamForm(false);
      setNewTeam({ name: '', gameFormat: '', tournaments: [], reinforcementPositions: [], description: '' });
      toast.success('Команда создана');
    } catch (error) {
      toast.error('Ошибка создания команды');
    }
  };

  const calculateCompletion = () => {
    let score = 0;
    if (profile?.photoURL) score += 20;
    if (profile?.displayName) score += 5;
    
    if (profile?.role === 'player') {
      if (playerData.position) score += 20;
      if (playerData.gameFormat) score += 20;
      if (playerData.metroStations.length > 0) score += 15;
      if (playerData.experience) score += 20;
    } else {
      if (teams.length > 0) score += 75;
    }
    return Math.min(score, 100);
  };

  const completion = calculateCompletion();

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Загрузка профиля...</div>;

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (isOnboarding) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bento-glass p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black text-[var(--color-text-primary)]">Добро пожаловать!</h1>
            <p className="text-[var(--color-text-secondary)] font-medium">Пожалуйста, заполните основные данные {profile.role === 'player' ? 'игрока' : 'менеджера'}</p>
          </div>

          <form onSubmit={handleOnboardingSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Имя и Фамилия <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Иван Иванов"
                className="bento-input w-full p-3"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Номер телефона</label>
              <input 
                type="text" 
                value={profile.phoneNumber || user.phoneNumber || 'Не указан'}
                disabled
                className="bento-input w-full p-3 opacity-70 cursor-not-allowed"
              />
            </div>

            {profile.role === 'player' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Позиция <span className="text-red-500">*</span></label>
                    <select 
                      value={playerData.position}
                      onChange={e => setPlayerData({...playerData, position: e.target.value})}
                      className="bento-input w-full p-3"
                      required
                    >
                      <option value="">Выберите...</option>
                      {FOOTBALL_POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Формат <span className="text-red-500">*</span></label>
                    <select 
                      value={playerData.gameFormat}
                      onChange={e => setPlayerData({...playerData, gameFormat: e.target.value})}
                      className="bento-input w-full p-3"
                      required
                    >
                      <option value="">Выберите...</option>
                      <option value="5x5">5x5</option>
                      <option value="8x8">8x8</option>
                      <option value="11x11">11x11</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Метро <span className="text-red-500">*</span></label>
                  <select 
                    onChange={e => {
                      if (e.target.value && !playerData.metroStations.includes(e.target.value)) {
                        setPlayerData({...playerData, metroStations: [...playerData.metroStations, e.target.value]});
                      }
                      e.target.value = '';
                    }}
                    className="bento-input w-full p-3"
                  >
                    <option value="">Добавить станцию...</option>
                    {SPB_METRO_STATIONS.map(station => (
                      <option key={station} value={station}>{station}</option>
                    ))}
                  </select>
                  
                  {playerData.metroStations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {playerData.metroStations.map((s, i) => (
                        <span key={i} className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                          {s}
                          <button 
                            type="button"
                            onClick={() => setPlayerData({...playerData, metroStations: playerData.metroStations.filter(st => st !== s)})}
                            className="hover:text-accent ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <button type="submit" className="bento-button w-full py-4 text-lg mt-4">
              Сохранить и продолжить
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Tabs Navigation */}
      <div className="flex justify-center">
        <div className="flex bento-glass p-2 rounded-2xl">
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all",
              activeTab === 'profile' ? "bg-primary text-white shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            )}
          >
            Профиль
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={cn(
              "px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all",
              activeTab === 'requests' ? "bg-primary text-white shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            )}
          >
            Запросы
          </button>
        </div>
      </div>

      {/* Header Info */}
      <div className="bento-glass p-6 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
        <div className="relative group">
          <div className="relative w-28 h-28">
            <img 
              src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}`} 
              alt={profile.displayName}
              className={cn(
                "w-28 h-28 rounded-2xl object-cover border-2 border-white/10 transition-opacity",
                isUploadingPhoto ? "opacity-50" : "opacity-100"
              )}
            />
            {isUploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            )}
            <button 
              onClick={() => !isUploadingPhoto && fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl disabled:cursor-not-allowed"
            >
              <Camera className="w-6 h-6" />
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handlePhotoUpload}
          />
        </div>
        
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="space-y-1">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="text-2xl font-bold bento-input px-3 py-1"
                    autoFocus
                  />
                  <button onClick={handleNameChange} className="p-2 bg-primary text-white rounded-xl shadow-sm"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setIsEditingName(false)} className="p-2 bg-black/10 dark:bg-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <h1 className="text-2xl md:text-3xl font-black flex items-center justify-center md:justify-start gap-2 group text-[var(--color-text-primary)] tracking-tight">
                  {profile.displayName}
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--color-text-secondary)] hover:text-primary transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </h1>
              )}
              <p className="text-[var(--color-text-secondary)] font-bold tracking-widest uppercase text-xs mt-2">{profile.role === 'player' ? 'Футболист' : 'Менеджер'}</p>
              
              {/* Profile Completion Indicator */}
              <div className="mt-4 space-y-2 max-w-xs mx-auto md:mx-0">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider mt-4">
                  <span className="text-[var(--color-text-secondary)]">Заполнение профиля</span>
                  <span className="text-primary">{completion}%</span>
                </div>
                <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center md:justify-start gap-3 mt-4">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-bold border border-primary/20">
                  <Coins className="w-4 h-4" /> {profile.balance} ₽
                </div>
                {profile.email === 'justdjscamp@gmail.com' && (
                  <button 
                    onClick={handleGetBonus}
                    className="inline-flex items-center gap-1 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-sm font-bold hover:bg-accent/20 transition-colors border border-accent/20"
                  >
                    <Plus className="w-4 h-4" /> +1000 ₽
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'profile' ? (
        <>
          {profile.role === 'player' && (
            <div className="bento-glass p-8 space-y-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-[var(--color-text-primary)]">
                  <Users className="w-5 h-5 text-primary" />
                  Анкета игрока
                </h2>
                <button 
                  onClick={() => isEditing ? handleSavePlayerProfile() : setIsEditing(true)}
                  className="text-primary font-bold flex items-center gap-2 hover:bg-primary/10 px-4 py-2 rounded-xl transition-all border border-primary/20 active:scale-95"
                >
                  {isEditing ? <><Save className="w-4 h-4" /> Сохранить</> : 'Редактировать'}
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Позиция</label>
                  {isEditing ? (
                    <select 
                      value={playerData.position}
                      onChange={e => setPlayerData({...playerData, position: e.target.value})}
                      className="bento-input w-full p-3"
                    >
                      <option value="">Выберите позицию</option>
                      {FOOTBALL_POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-lg font-black text-[var(--color-text-primary)]">{playerData.position || 'Не указано'}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Формат игры</label>
                  {isEditing ? (
                    <select 
                      value={playerData.gameFormat}
                      onChange={e => setPlayerData({...playerData, gameFormat: e.target.value})}
                      className="bento-input w-full p-3"
                    >
                      <option value="">Выберите формат</option>
                      <option value="5x5">5x5</option>
                      <option value="8x8">8x8</option>
                      <option value="11x11">11x11</option>
                    </select>
                  ) : (
                    <div className="text-lg font-black text-[var(--color-text-primary)]">{playerData.gameFormat || 'Не указано'}</div>
                  )}
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Метро (Санкт-Петербург)</label>
                  {isEditing ? (
                    <div className="space-y-3">
                      <select 
                        onChange={e => {
                          if (e.target.value && !playerData.metroStations.includes(e.target.value)) {
                            setPlayerData({...playerData, metroStations: [...playerData.metroStations, e.target.value]});
                          }
                          e.target.value = '';
                        }}
                        className="bento-input w-full p-3"
                      >
                        <option value="">Добавить станцию...</option>
                        {SPB_METRO_STATIONS.map(station => (
                          <option key={station} value={station}>{station}</option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {playerData.metroStations.map((s, i) => (
                          <span key={i} className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 border border-primary/20 shadow-sm">
                            {s}
                            <button 
                              onClick={() => setPlayerData({...playerData, metroStations: playerData.metroStations.filter(st => st !== s)})}
                              className="hover:text-accent"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {playerData.metroStations.length > 0 ? playerData.metroStations.map((s, i) => (
                        <span key={i} className="bg-black/10 dark:bg-white/10 text-[var(--color-text-primary)] px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2 border border-white/20 dark:border-white/5 shadow-sm">
                          <MapPin className="w-3 h-3 text-primary" /> {s}
                        </span>
                      )) : <span className="text-[var(--color-text-secondary)] font-medium">Не указано</span>}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Опыт и о себе</label>
                  {isEditing ? (
                    <textarea 
                      value={playerData.experience}
                      onChange={e => setPlayerData({...playerData, experience: e.target.value})}
                      className="bento-input w-full p-3 min-h-[120px]"
                      placeholder="Расскажите о своем опыте..."
                    />
                  ) : (
                    <p className="text-[var(--color-text-primary)] font-medium leading-relaxed whitespace-pre-wrap bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-white/10 dark:border-white/5 mt-1">
                      {playerData.experience || 'Описание отсутствует'}
                    </p>
                  )}
                </div>

              </div>
            </div>
          )}

          {profile.role === 'manager' && (
            <div className="space-y-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-[var(--color-text-primary)]">
                    <Trophy className="w-5 h-5 text-primary" />
                    Мои команды
                  </h2>
                  <button 
                    onClick={() => setShowTeamForm(true)}
                    className="bg-primary text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Добавить команду
                  </button>
                </div>
              </div>

              {showTeamForm && (
                <div className="bento-glass p-8 border-2 border-primary/20 shadow-xl space-y-6">
                  <div className="flex items-center gap-6 mb-6">
                    <div className="relative group">
                      <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-white/10 overflow-hidden relative">
                        {newTeam.logoURL ? (
                          <img src={newTeam.logoURL} className={cn("w-full h-full object-cover", isUploadingPhoto && cropType === 'team' ? "opacity-50" : "opacity-100")} alt="Logo" />
                        ) : (
                          <Trophy className="w-8 h-8 text-white/20" />
                        )}
                        {isUploadingPhoto && cropType === 'team' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => teamLogoInputRef.current?.click()}
                        className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                      >
                        <Upload className="w-5 h-5" />
                      </button>
                      <input 
                        type="file" 
                        ref={teamLogoInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleTeamLogoUpload(e, false)}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">Логотип команды</h3>
                      <p className="text-sm text-gray-400">Нажмите для загрузки</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Название команды</label>
                      <input 
                        type="text" 
                        value={newTeam.name}
                        onChange={e => setNewTeam({...newTeam, name: e.target.value})}
                        className="bento-input w-full p-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Формат игры</label>
                      <select 
                        value={newTeam.gameFormat}
                        onChange={e => setNewTeam({...newTeam, gameFormat: e.target.value})}
                        className="bento-input w-full p-3"
                      >
                        <option value="">Выберите формат</option>
                        <option value="5x5">5x5</option>
                        <option value="8x8">8x8</option>
                        <option value="11x11">11x11</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Нужные позиции</label>
                      <div className="space-y-3">
                        <select 
                          onChange={e => {
                            if (e.target.value && !newTeam.reinforcementPositions?.includes(e.target.value)) {
                              setNewTeam({...newTeam, reinforcementPositions: [...(newTeam.reinforcementPositions || []), e.target.value]});
                            }
                            e.target.value = '';
                          }}
                          className="bento-input w-full p-3"
                        >
                          <option value="">Добавить позицию...</option>
                          {FOOTBALL_POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          {newTeam.reinforcementPositions?.map((pos, i) => (
                            <span key={i} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 border border-primary/20">
                              {pos}
                              <button 
                                onClick={() => setNewTeam({...newTeam, reinforcementPositions: newTeam.reinforcementPositions?.filter(p => p !== pos)})}
                                className="hover:text-accent"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Описание</label>
                      <textarea 
                        value={newTeam.description}
                        onChange={e => setNewTeam({...newTeam, description: e.target.value})}
                        className="bento-input w-full p-3 min-h-[100px]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleCreateTeam} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold">Создать</button>
                    <button onClick={() => setShowTeamForm(false)} className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl font-bold">Отмена</button>
                  </div>
                </div>
              )}

              {editingTeamId && (
                <div className="bento-glass p-8 border-2 border-primary/20 shadow-xl space-y-6">
                  <div className="flex items-center gap-6 mb-6">
                    <div className="relative group">
                      <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-white/10 overflow-hidden relative">
                        {editTeamData.logoURL ? (
                          <img src={editTeamData.logoURL} className={cn("w-full h-full object-cover", isUploadingPhoto && cropType === 'team' ? "opacity-50" : "opacity-100")} alt="Logo" />
                        ) : (
                          <Trophy className="w-8 h-8 text-white/20" />
                        )}
                        {isUploadingPhoto && cropType === 'team' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => editTeamLogoInputRef.current?.click()}
                        className="absolute inset-0 bg-black/40 text-[var(--color-text-primary)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                      >
                        <Upload className="w-5 h-5" />
                      </button>
                      <input 
                        type="file" 
                        ref={editTeamLogoInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleTeamLogoUpload(e, true)}
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-[var(--color-text-primary)]">Редактировать логотип</h3>
                      <p className="text-sm text-[var(--color-text-secondary)]">Нажмите, чтобы изменить</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Название команды</label>
                      <input 
                        type="text" 
                        value={editTeamData.name}
                        onChange={e => setEditTeamData({...editTeamData, name: e.target.value})}
                        className="bento-input w-full p-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Формат игры</label>
                      <select 
                        value={editTeamData.gameFormat}
                        onChange={e => setEditTeamData({...editTeamData, gameFormat: e.target.value})}
                        className="bento-input w-full p-3"
                      >
                        <option value="">Выберите формат</option>
                        <option value="5x5">5x5</option>
                        <option value="8x8">8x8</option>
                        <option value="11x11">11x11</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Нужные позиции</label>
                      <div className="space-y-3">
                        <select 
                          onChange={e => {
                            if (e.target.value && !editTeamData.reinforcementPositions?.includes(e.target.value)) {
                              setEditTeamData({...editTeamData, reinforcementPositions: [...(editTeamData.reinforcementPositions || []), e.target.value]});
                            }
                            e.target.value = '';
                          }}
                          className="bento-input w-full p-3"
                        >
                          <option value="">Добавить позицию...</option>
                          {FOOTBALL_POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          {editTeamData.reinforcementPositions?.map((pos, i) => (
                            <span key={i} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 border border-primary/20">
                              {pos}
                              <button 
                                onClick={() => setEditTeamData({...editTeamData, reinforcementPositions: editTeamData.reinforcementPositions?.filter(p => p !== pos)})}
                                className="hover:text-accent"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Описание</label>
                      <textarea 
                        value={editTeamData.description}
                        onChange={e => setEditTeamData({...editTeamData, description: e.target.value})}
                        className="bento-input w-full p-3 min-h-[100px]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleUpdateTeam} className="flex-1 bg-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 hover:bg-primary/90">Сохранить</button>
                    <button onClick={() => setEditingTeamId(null)} className="flex-1 bg-white/5 text-[var(--color-text-secondary)] py-3 rounded-xl font-bold hover:bg-white/10 transition-colors">Отмена</button>
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                {teams.map(team => (
                  <div key={team.id} className="bento-glass p-6 flex items-center gap-6 border border-white/5 hover:border-primary/30 transition-all group bento-hover">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 bg-white/5 flex-shrink-0">
                      <img 
                        src={team.logoURL || `https://ui-avatars.com/api/?name=${team.name}`} 
                        alt={team.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-white truncate">{team.name}</h3>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-400 font-medium">
                            <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" /> {team.gameFormat}</span>
                            <span className="flex items-center gap-1.5"><Trophy className="w-4 h-4 text-primary" /> {team.tournaments?.length || 0} турниров</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button 
                            onClick={() => handleStartEditTeam(team)}
                            className="text-gray-500 hover:text-primary p-2 rounded-xl hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setTeamToDelete(team.id)}
                            className="text-gray-500 hover:text-red-500 p-2 rounded-xl hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      {team.description && (
                        <p className="mt-4 text-gray-400 text-sm line-clamp-2 leading-relaxed">{team.description}</p>
                      )}
                    </div>
                  </div>
                ))}
                {teams.length === 0 && !showTeamForm && (
                  <div className="text-center py-16 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/10">
                    <Info className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-gray-500 font-bold">У вас пока нет созданных команд</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-10">
          <div className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-[var(--color-text-primary)]">
              <MessageCircle className="w-5 h-5 text-primary" />
              Входящие заявки
            </h2>
            <div className="grid gap-4">
              {requests.length > 0 ? requests.map(req => (
                <div key={req.id} className="bento-glass p-6 gap-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border border-white/5 bento-hover">
                  <div className="flex items-center gap-4">
                    <img 
                      src={req.teamId && profile?.role === 'player' ? (req.teamLogoURL || `https://ui-avatars.com/api/?name=${req.teamName}`) : (req.fromPhotoURL || `https://ui-avatars.com/api/?name=${req.fromName}`)} 
                      className="w-14 h-14 rounded-2xl object-cover border border-white/10 flex-shrink-0"
                      alt=""
                    />
                    <div>
                      <div className="font-bold text-lg text-white">
                        {req.teamId && profile?.role === 'player' ? req.teamName : req.fromName}
                      </div>
                      <div className="text-sm text-gray-400 flex items-center gap-2 font-medium">
                        {req.teamId ? 'Заявка в команду' : 'Приглашение в команду'}
                      </div>
                      <div className="text-xs text-primary mt-1 flex items-center gap-1 font-bold">
                        С инициатора будет списано {req.price}₽
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 font-bold">
                        <Clock className="w-3 h-3" /> {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full sm:w-auto gap-2">
                    <button 
                      onClick={() => handleAcceptRequest(req)}
                      className="flex-1 sm:flex-none py-3 px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                      <Check className="w-5 h-5" /> Принять
                    </button>
                    <button 
                      onClick={() => rejectContactRequest(req.id)}
                      className="p-3 bg-accent text-white rounded-xl hover:bg-accent/90 transition-all flex items-center justify-center shadow-lg shadow-accent/20"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-16 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/10">
                  <p className="text-gray-500 font-bold">Нет новых заявок</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-[var(--color-text-primary)]">
              <History className="w-5 h-5 text-primary" />
              Отправленные запросы
            </h2>
            <div className="grid gap-4">
              {sentRequests.length > 0 ? sentRequests.map(req => (
                <div key={req.id} className="bento-glass p-6 gap-6 flex flex-col sm:flex-row items-start sm:items-center justify-between border border-white/5 bento-hover">
                  <div className="flex items-center gap-4">
                    <img 
                      src={req.teamId && profile?.role === 'player' ? (req.teamLogoURL || `https://ui-avatars.com/api/?name=${req.teamName}`) : (req.toPhotoURL || `https://ui-avatars.com/api/?name=${req.toName}`)} 
                      className="w-14 h-14 rounded-2xl object-cover border border-white/10 flex-shrink-0"
                      alt=""
                    />
                    <div>
                      <div className="font-bold text-lg text-white">
                        {req.teamId && profile?.role === 'player' ? req.teamName : req.toName}
                      </div>
                      <div className="text-sm text-gray-400 flex items-center gap-2 font-medium">
                        {req.teamId ? 'Запрос в команду' : 'Приглашение игроку'} • 
                        <span className={`font-bold ${
                          req.status === 'accepted' ? 'text-primary' : 
                          req.status === 'rejected' ? 'text-accent' : 'text-primary'
                        }`}>
                          {req.status === 'accepted' ? 'Принят' : 
                           req.status === 'rejected' ? 'Отклонен' : 'В ожидании'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 font-bold">
                        <Clock className="w-3 h-3 text-primary" /> {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  {req.status === 'accepted' && (
                    <button 
                      onClick={() => navigate(`/chat/${req.id}`)}
                      className="w-full sm:w-auto p-3 flex justify-center bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-all border border-primary/20 shadow-lg shadow-primary/10"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )) : (
                <div className="text-center py-16 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/10">
                  <p className="text-gray-500 font-bold">Вы еще не отправляли запросов</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Button */}
      <div className="flex justify-center mt-12 pb-8">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="bento-glass py-3 px-6 rounded-2xl text-red-500 font-bold border border-red-500/20 hover:bg-red-500/10 transition-colors flex items-center gap-2"
        >
          <AlertCircle className="w-5 h-5" />
          Удалить аккаунт
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="bento-glass w-full max-w-md p-8 border-2 border-red-500/30 shadow-2xl shadow-red-500/10 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="font-black text-2xl text-white">Вы уверены?</h3>
              <p className="text-gray-400 font-medium">
                Все ваши чаты, заявки и баланс будут безвозвратно удалены.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center block">
                Введите УДАЛИТЬ для подтверждения
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                className="bento-input w-full p-4 text-center text-white text-lg font-bold uppercase placeholder:text-gray-600 focus:border-red-500/50 focus:ring-red-500/20"
                placeholder="УДАЛИТЬ"
              />
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== 'УДАЛИТЬ' || isDeleting}
                className="flex-1 bg-red-500 text-white py-4 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/20 flex items-center justify-center"
              >
                {isDeleting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Удалить навсегда'}
              </button>
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                disabled={isDeleting}
                className="flex-1 bg-white/5 text-gray-300 py-4 rounded-xl font-bold hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Team Modal */}
      {teamToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="bento-glass w-full max-w-md p-8 border-2 border-red-500/30 shadow-2xl shadow-red-500/10 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="font-black text-2xl text-white">Удалить команду?</h3>
              <p className="text-gray-400 font-medium">
                Вы уверены, что хотите удалить эту команду? Все данные о ней будут безвозвратно удалены.
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={handleDeleteTeamConfirm}
                disabled={isDeletingTeam}
                className="flex-1 bg-red-500 text-white py-4 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/20 flex items-center justify-center"
              >
                {isDeletingTeam ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Удалить'}
              </button>
              <button 
                onClick={() => setTeamToDelete(null)}
                disabled={isDeletingTeam}
                className="flex-1 bg-white/5 text-gray-300 py-4 rounded-xl font-bold hover:bg-white/10 transition-all disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cropper Modal */}
      {isCropping && cropImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm">
          <div className="bento-glass w-full max-w-lg overflow-hidden flex flex-col h-[85vh] border-2 border-primary/20 shadow-2xl shadow-primary/10">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-background">
              <h3 className="font-bold text-xl text-[var(--color-text-primary)]">Обрезать фото</h3>
              <button 
                onClick={() => {
                  setIsCropping(false);
                  setCropImage(null);
                }}
                className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 relative bg-black">
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-8 space-y-6 bg-surface">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Масштаб</label>
                  <span className="text-xs font-bold text-primary">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={handleSaveCrop}
                  disabled={isUploadingPhoto}
                  className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 shadow-lg shadow-primary/20 transition-all active:scale-95"
                >
                  {isUploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Применить'}
                </button>
                <button 
                  onClick={() => {
                    setIsCropping(false);
                    setCropImage(null);
                  }}
                  disabled={isUploadingPhoto}
                  className="flex-1 bg-white/5 text-gray-400 py-4 rounded-2xl font-bold disabled:opacity-50 hover:bg-white/10 transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
