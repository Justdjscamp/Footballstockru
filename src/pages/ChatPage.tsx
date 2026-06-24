import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, or, and } from 'firebase/firestore';
import { Message, UserProfile, ContactRequest } from '../types';
import { useAuth } from '../hooks/useAuth';
import { sendMessage, acceptContactRequest, markChatAsRead, rejectContactRequest, deleteChat, deleteAllChatsAndRequests, setTypingStatus, subscribeToTypingStatus, handleFirestoreError, OperationType } from '../services/firebaseService';
import { toast } from 'sonner';
import { Send, ArrowLeft, CheckCircle2, XCircle, Clock, MessageSquare, MoreVertical, Phone, Info, Trash2, Loader2, Image as ImageIcon, Mic, X, Edit2 } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { limit } from 'firebase/firestore';
import { uploadChatAttachment, editMessage, deleteMessage } from '../services/firebaseService';

interface ExtendedContactRequest extends Omit<ContactRequest, 'unreadCount'> {
  otherProfile: {
    uid: string;
    displayName: string;
    photoURL?: string;
    role?: string;
    lastActive?: string;
  };
  unreadCount: number;
}

export default function ChatPage() {
  const { chatId } = useParams();
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<ExtendedContactRequest[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingStatuses, setTypingStatuses] = useState<Record<string, Record<string, boolean>>>({});
  
  // New States
  const [messageLimit, setMessageLimit] = useState(50);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  const CHAT_HEIGHT = "h-[calc(100svh-88px)] md:h-[calc(100dvh-120px)]";

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (chatId && user && isTyping) {
        setTypingStatus(chatId, user.uid, false);
      }
    };
  }, [chatId, user, isTyping]);

  useEffect(() => {
    const chatIds = chats.map(c => c.id);
    if (!chatIds.length) return;

    const unsubscribes = chatIds.map(id => {
      return subscribeToTypingStatus(id, (typingUsers) => {
        setTypingStatuses(prev => ({ ...prev, [id]: typingUsers }));
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [chats.map(c => c.id).join(',')]);

  useEffect(() => {
    if (!user) return;

    const qFrom = query(
      collection(db, 'contactRequests'),
      where('fromUid', '==', user.uid)
    );
    const qTo = query(
      collection(db, 'contactRequests'),
      where('toUid', '==', user.uid)
    );

    const handleAllReqs = async (fromReqs: ContactRequest[], toReqs: ContactRequest[]) => {
      const reqsMap = new Map<string, ContactRequest>();
      [...fromReqs, ...toReqs].forEach(req => reqsMap.set(req.id, req));
      const allReqs = Array.from(reqsMap.values());

      const pendingReqs = allReqs.filter(r => r.status === 'pending');
      setRequests(pendingReqs);

      const acceptedReqs = allReqs.filter(r => r.status === 'accepted');
      
      const chatList = acceptedReqs.map(req => {
        const isFromMe = req.fromUid === user.uid;
        let otherName = isFromMe ? req.toName : req.fromName;
        let otherPhotoURL = isFromMe ? req.toPhotoURL : req.fromPhotoURL;
        const otherUid = isFromMe ? req.toUid : req.fromUid;

        if (req.teamId && profile?.role === 'player') {
          otherName = req.teamName || otherName;
          otherPhotoURL = req.teamLogoURL || otherPhotoURL;
        }

        return {
          ...req,
          otherProfile: { 
            uid: otherUid,
            displayName: otherName || 'Anonymous', 
            photoURL: otherPhotoURL,
            role: req.teamId ? 'team' : undefined,
            lastActive: undefined
          },
          lastMessage: req.lastMessage || 'Начните общение',
          unreadCount: req.unreadCount?.[user.uid] || 0
        } as ExtendedContactRequest;
      });
      
      chatList.sort((a, b) => {
        const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
        const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      setChats(chatList);
    };

    let latestFromReqs: ContactRequest[] = [];
    let latestToReqs: ContactRequest[] = [];

    const unsubscribeFrom = onSnapshot(qFrom, async (snapshot) => {
      latestFromReqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
      await handleAllReqs(latestFromReqs, latestToReqs);
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    const unsubscribeTo = onSnapshot(qTo, async (snapshot) => {
      latestToReqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
      await handleAllReqs(latestFromReqs, latestToReqs);
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    return () => {
      unsubscribeFrom();
      unsubscribeTo();
    };
  }, [user]);

  // Mark as read when entering chat
  useEffect(() => {
    if (chatId && user) {
      markChatAsRead(chatId, user.uid);
    }
  }, [chatId, user]);

  useEffect(() => {
    if (!chatId || !user) return;

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(messageLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)).reverse();
      setMessages(msgs);
      
      if (messageLimit === 50) {
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}/messages`);
    });

    return () => unsubscribe();
  }, [chatId, user, messageLimit]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    if (target.scrollTop === 0) {
      if (messages.length >= messageLimit) {
        setMessageLimit(prev => prev + 50);
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId || !user) return;
    if (!inputText.trim() && !attachment && !audioBlob) return;

    const currentChat = chats.find(c => c.id === chatId);
    if (!currentChat) return;

    const recipientUid = currentChat.fromUid === user.uid ? currentChat.toUid : currentChat.fromUid;

    try {
      if (isTyping) {
        setTypingStatus(chatId, user.uid, false);
        setIsTyping(false);
      }

      if (editingMessageId && inputText.trim()) {
        await editMessage(chatId, editingMessageId, inputText.trim());
        setEditingMessageId(null);
        setInputText('');
        return;
      }

      setUploading(true);
      let imageUrl = '';
      let uploadedAudioUrl = '';

      if (attachment) {
        imageUrl = await uploadChatAttachment(chatId, attachment, 'image');
      }

      if (audioBlob) {
        uploadedAudioUrl = await uploadChatAttachment(chatId, audioBlob, 'audio');
      }

      await sendMessage(chatId, user.uid, inputText.trim(), recipientUid, imageUrl || undefined, uploadedAudioUrl || undefined);
      
      setInputText('');
      setAttachment(null);
      setAudioBlob(null);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      toast.error('Ошибка отправки');
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error('Не удалось получить доступ к микрофону');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      audioChunksRef.current = []; // clear chunks
    }
    setIsRecording(false);
    setAudioBlob(null);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (!chatId || !user) return;

    if (!isTyping) {
      setIsTyping(true);
      setTypingStatus(chatId, user.uid, true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      setTypingStatus(chatId, user.uid, false);
    }, 3000);
  };

  const handleAccept = async (req: ContactRequest) => {
    try {
      await acceptContactRequest(req.id, req.fromUid, req.toUid, req.price);
      toast.success('Запрос принят!');
    } catch (error: any) {
      toast.error(error.message || 'Ошибка');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Вы уверены, что хотите удалить ВСЕ чаты и запросы? Это действие необратимо.')) return;
    try {
      await deleteAllChatsAndRequests();
      toast.success('Все данные удалены');
    } catch (error) {
      toast.error('Ошибка при удалении');
    }
  };

  const handleDeleteChat = async () => {
    if (!chatId) return;
    if (!window.confirm('Удалить этот чат?')) return;
    try {
      await deleteChat(chatId);
      toast.success('Чат удален');
      navigate('/chat');
    } catch (error) {
      toast.error('Ошибка при удалении чата');
    }
  };

  const handleReject = async (reqId: string) => {
    try {
      await rejectContactRequest(reqId);
      toast.success('Запрос отклонен');
    } catch (error: any) {
      toast.error(error.message || 'Ошибка');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 font-medium">Загрузка...</div>;

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  const currentChat = chats.find(c => c.id === chatId);

  return (
    <div className={cn("max-w-7xl mx-auto flex gap-6 pb-20 md:pb-0 overflow-hidden", CHAT_HEIGHT)}>
      
      {/* Sidebar: Chats List - hidden on mobile when viewing a chat */}
      <div className={cn(
        "w-full md:w-[350px] lg:w-[400px] flex flex-col gap-0 bento-glass overflow-hidden flex-shrink-0",
        chatId ? "hidden md:flex" : "flex"
      )}>
        <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 sticky top-0 z-10 bg-white/50 dark:bg-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">ЧАТЫ</h1>
            <div className="flex items-center gap-2">
              {user?.email === 'justdjscamp@gmail.com' && (
                <button 
                  onClick={handleDeleteAll}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                  title="Удалить все (Админ)"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              {(chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0) + requests.filter(r => r.toUid === user?.uid).length) > 0 && (
                <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  {chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0) + requests.filter(r => r.toUid === user?.uid).length} новых
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Pending Requests */}
          {requests.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest px-2">Запросы</h2>
              <div className="grid gap-3">
                {requests.map(req => (
                  <div key={req.id} className="bg-white/50 dark:bg-black/20 p-4 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col gap-3 group hover:bg-white dark:hover:bg-black/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-500/10 p-2.5 rounded-2xl group-hover:scale-110 transition-transform">
                        <Clock className="w-5 h-5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--color-text-primary)] text-sm truncate">{req.fromUid === user?.uid ? 'Ваш запрос' : 'Вам запрос'}</div>
                        <div className="text-xs text-[var(--color-text-secondary)] font-medium mt-0.5">{req.price} ₽ спишется при подтверждении</div>
                      </div>
                    </div>
                    {req.toUid === user?.uid && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleAccept(req)} 
                          className="flex-1 bg-green-500/10 text-green-600 dark:text-green-500 py-2 rounded-xl hover:bg-green-500 hover:text-white font-bold text-sm transition-all"
                        >
                          Принять
                        </button>
                        <button 
                          onClick={() => handleReject(req.id)}
                          className="flex-1 bg-red-500/10 text-red-600 dark:text-red-500 py-2 rounded-xl hover:bg-red-500 hover:text-white font-bold text-sm transition-all"
                        >
                          Отклонить
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Chats */}
          <div className="space-y-4">
            <h2 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest px-2">Активные</h2>
            <div className="grid gap-2">
              {chats.length > 0 ? chats.map(chat => (
                <button 
                  key={chat.id}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  className={cn(
                    "w-full p-4 rounded-[2rem] flex items-center gap-4 text-left relative overflow-hidden group transition-all",
                    chatId === chat.id 
                      ? "bg-primary/10 border border-primary/20" 
                      : "bg-transparent hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <img 
                      src={chat.otherProfile.photoURL || `https://ui-avatars.com/api/?name=${chat.otherProfile.displayName}`} 
                      className="w-14 h-14 rounded-full object-cover border-2 border-white/50 dark:border-black/50 shadow-sm"
                      alt=""
                    />
                    {chat.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-black border-[2px] border-white dark:border-[#1C1C1E] animate-pulse z-10">
                        {chat.unreadCount}
                      </div>
                    )}
                    {chat.otherProfile.lastActive && differenceInMinutes(new Date(), new Date(chat.otherProfile.lastActive)) < 5 && (
                      <div className="absolute bottom-0 right-0 bg-green-500 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1C1C1E]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="font-bold text-[var(--color-text-primary)] text-base truncate pr-2">{chat.otherProfile.displayName}</div>
                      {chat.lastMessageAt && (
                        <div className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase flex-shrink-0">
                          {format(new Date(chat.lastMessageAt), 'HH:mm')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {typingStatuses[chat.id]?.[chat.otherProfile.uid] ? (
                        <div className="flex items-center gap-1 text-primary font-bold text-[13px]">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Печатает...</span>
                        </div>
                      ) : (
                        <div className={cn(
                          "text-[13px] truncate",
                          chat.unreadCount > 0 ? "text-[var(--color-text-primary)] font-bold" : "text-[var(--color-text-secondary)]"
                        )}>
                          {chat.lastMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )) : (
                <div className="text-center py-12 px-4 rounded-3xl border-2 border-dashed border-black/5 dark:border-white/5">
                  <MessageSquare className="w-8 h-8 text-[var(--color-text-secondary)] mx-auto mb-3 opacity-50" />
                  <p className="text-[var(--color-text-secondary)] font-medium text-sm">У вас пока нет активных чатов</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Area: Active Chat - hidden on mobile when no chat is selected */}
      <div className={cn(
        "flex-1 bento-glass overflow-hidden flex flex-col relative",
        !chatId ? "hidden md:flex items-center justify-center bg-black/5 dark:bg-white/5" : "flex"
      )}>
        {chatId && currentChat ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 md:py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-black/20 backdrop-blur-md z-10 shadow-sm relative">
              <div className="flex items-center gap-3 flex-1 overflow-hidden">
                <button 
                  onClick={() => navigate('/chat')} 
                  className="p-2 -ml-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors md:hidden group flex-shrink-0"
                >
                  <ArrowLeft className="w-6 h-6 text-[var(--color-text-primary)] group-hover:-translate-x-1 transition-transform" />
                </button>
                <button 
                  onClick={() => navigate(currentChat.otherProfile.role === 'team' ? `/team/${currentChat.otherProfile.uid}` : `/player/${currentChat.otherProfile.uid}`)} 
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="relative flex-shrink-0">
                    <img 
                      src={currentChat.otherProfile.photoURL || `https://ui-avatars.com/api/?name=${currentChat.otherProfile.displayName}`} 
                      className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover shadow-sm border border-black/10 dark:border-white/10"
                      alt=""
                    />
                    {currentChat.otherProfile.lastActive && differenceInMinutes(new Date(), new Date(currentChat.otherProfile.lastActive)) < 5 && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#1C1C1E] rounded-full"></div>
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="font-bold text-[var(--color-text-primary)] text-[15px] md:text-base truncate leading-tight shadow-sm">
                      {currentChat.otherProfile.displayName}
                    </div>
                    <div className={cn(
                      "text-xs font-medium truncate mt-0.5",
                      currentChat.otherProfile.lastActive && differenceInMinutes(new Date(), new Date(currentChat.otherProfile.lastActive)) < 5
                        ? "text-green-500"
                        : "text-[var(--color-text-secondary)]"
                    )}>
                      {currentChat.otherProfile.lastActive && differenceInMinutes(new Date(), new Date(currentChat.otherProfile.lastActive)) < 5
                        ? "В сети"
                        : "Был(а) недавно"}
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="p-2.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-[var(--color-text-primary)] transition-colors">
                  <Phone className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleDeleteChat}
                  className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors"
                  title="Удалить чат"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar"
            >
              {messages.map((msg, i) => {
                const isMe = msg.senderUid === user?.uid;
                const showDate = i === 0 || format(new Date(messages[i-1].createdAt), 'yyyy-MM-dd') !== format(new Date(msg.createdAt), 'yyyy-MM-dd');
                
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-6">
                        <span className="bg-black/5 dark:bg-white/5 px-4 py-1.5 rounded-full text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">
                          {format(new Date(msg.createdAt), 'd MMMM', { locale: ru })}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={cn(
                        "max-w-[85%] md:max-w-[70%] text-[15px] p-3.5 shadow-sm relative group",
                        isMe 
                          ? 'bg-primary text-white rounded-[1.5rem] rounded-tr-sm' 
                          : 'bg-black/5 dark:bg-white/5 text-[var(--color-text-primary)] rounded-[1.5rem] rounded-tl-sm'
                      )}>
                        {msg.isDeleted ? (
                          <p className="italic opacity-60">Сообщение удалено</p>
                        ) : (
                          <>
                            {msg.imageUrl && (
                              <img src={msg.imageUrl} alt="attachment" className="rounded-xl mt-1 mb-3 max-w-full" />
                            )}
                            {msg.audioUrl && (
                              <audio controls src={msg.audioUrl} className="mb-2 max-w-[200px] h-10 w-full" />
                            )}
                            <p className="leading-relaxed font-medium whitespace-pre-wrap">{msg.text}</p>
                            
                            {/* Message Actions */}
                            {isMe && (
                              <div className="absolute top-2 -left-16 opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                                <button onClick={() => { setEditingMessageId(msg.id); setInputText(msg.text); }} className="w-7 h-7 bg-white dark:bg-black/50 text-blue-500 rounded-full flex items-center justify-center hover:scale-110 border border-black/5 dark:border-white/5 mx-1" title="Редактировать">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteMessage(chatId, msg.id)} className="w-7 h-7 bg-white text-red-500 dark:bg-black/50 rounded-full flex items-center justify-center hover:scale-110 border border-black/5 dark:border-white/5 mr-1" title="Удалить">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                        <div className={cn(
                          "text-[9px] mt-2 font-bold uppercase tracking-tighter opacity-70 flex items-center gap-2",
                          isMe ? 'justify-end text-white/70' : 'justify-start text-[var(--color-text-secondary)]'
                        )}>
                          <span>{format(new Date(msg.createdAt), 'HH:mm')}</span>
                          {msg.isEdited && <span>(Изменено)</span>}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              {typingStatuses[currentChat.id] && Object.entries(typingStatuses[currentChat.id]).some(([uid, isUserTyping]) => uid !== user?.uid && isUserTyping) && (
                <div className="flex justify-start pt-2">
                  <div className="bg-black/5 dark:bg-white/5 py-2.5 px-4 rounded-[1.5rem] rounded-tl-sm shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-widest">Печатает...</span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {/* Input */}
            <div className="p-2 md:p-4 bg-white/50 dark:bg-black/20 border-t border-black/5 dark:border-white/5 backdrop-blur-md pb-[calc(env(safe-area-inset-bottom,0px)+8px)] md:pb-4">
              {editingMessageId && (
                <div className="mb-2 max-w-4xl mx-auto flex items-center justify-between text-blue-500 bg-blue-500/10 px-4 py-2 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4" />
                    <span className="text-sm font-bold">Редактирование сообщения</span>
                  </div>
                  <button onClick={() => { setEditingMessageId(null); setInputText(''); }} className="hover:opacity-70">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              {attachment && (
                <div className="mb-2 max-w-4xl mx-auto flex items-center gap-2 bg-black/5 dark:bg-white/5 px-4 py-2 rounded-xl">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm text-[var(--color-text-primary)] truncate">{attachment.name}</span>
                  <button onClick={() => setAttachment(null)} className="ml-auto hover:opacity-70 text-[var(--color-text-secondary)]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {uploading && (
                <div className="mb-2 max-w-4xl mx-auto text-center text-sm font-bold text-primary animate-pulse">
                  Отправка...
                </div>
              )}

              {isRecording ? (
                <div className="flex gap-2 items-center max-w-4xl mx-auto bg-black/5 dark:bg-white/5 px-4 py-3.5 md:py-4 rounded-full w-full">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-mono font-bold text-red-500 tabular-nums">
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </span>
                  <div className="flex-1" />
                  <button onClick={cancelRecording} className="p-2 text-[var(--color-text-secondary)] hover:text-red-500 transition-colors mr-2">
                    <X className="w-5 h-5" />
                  </button>
                  <button onClick={() => { stopRecording(); setTimeout(() => document.getElementById('chatForm')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 100); }} className="bg-primary text-white p-2 md:p-3 rounded-full hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all flex-shrink-0">
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              ) : (
                <form id="chatForm" onSubmit={handleSend} className="flex gap-2 items-center max-w-4xl mx-auto">
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 md:p-4 text-[var(--color-text-secondary)] hover:text-primary transition-colors bg-black/5 dark:bg-white/5 rounded-full flex-shrink-0"
                    title="Прикрепить фото"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setAttachment(e.target.files[0]);
                    }}
                  />

                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={handleInputChange}
                      placeholder="Написать сообщение..."
                      className="w-full bg-black/5 dark:bg-white/5 border-none focus:ring-2 focus:ring-primary/20 pl-5 pr-12 py-3.5 md:py-4 rounded-full text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] text-[15px]"
                    />
                  </div>

                  {!inputText.trim() && !attachment ? (
                    <button 
                      type="button"
                      onClick={startRecording}
                      className="text-[var(--color-text-secondary)] p-3.5 md:p-4 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all outline-none flex-shrink-0"
                      title="Голосовое сообщение"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  ) : (
                    <button 
                      type="submit"
                      disabled={uploading}
                      className="bg-primary text-white p-3.5 md:p-4 rounded-full hover:bg-primary-hover disabled:opacity-50 disabled:grayscale shadow-lg shadow-primary/20 active:scale-95 transition-all outline-none flex-shrink-0"
                    >
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-24 text-[var(--color-text-secondary)] flex flex-col items-center justify-center h-full">
            <MessageSquare className="w-16 h-16 mx-auto mb-6 opacity-20" />
            <p className="font-bold text-xl text-[var(--color-text-primary)]">Выберите чат</p>
            <p className="text-sm mt-2 max-w-xs">Список активных чатов и запросов находится слева</p>
          </div>
        )}
      </div>
    </div>
  );
}
