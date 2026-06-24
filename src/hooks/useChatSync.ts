import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { toast } from 'sonner';
import { ContactRequest } from '../types';
import { handleFirestoreError, OperationType } from '../services/firebaseService';
import { User } from 'firebase/auth';

export const useChatSync = (user: User | null) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [totalUnread, setTotalUnread] = useState(0);
  const [unreadRequestsCount, setUnreadRequestsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const prevUnreadMapRef = useRef<{ [chatId: string]: number }>({});
  const seenRequestsRef = useRef(new Set<string>());
  const seenFromRef = useRef(new Set<string>());
  const serverSnapRequestsRef = useRef(false);
  const serverSnapFromRef = useRef(false);
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    setTotalUnread(unreadRequestsCount + unreadMessagesCount);
  }, [unreadRequestsCount, unreadMessagesCount]);

  useEffect(() => {
    if (!user) {
      setUnreadRequestsCount(0);
      setUnreadMessagesCount(0);
      prevUnreadMapRef.current = {};
      seenRequestsRef.current.clear();
      seenFromRef.current.clear();
      serverSnapRequestsRef.current = false;
      serverSnapFromRef.current = false;
      return;
    }

    // Smart Notifications Logic
    const qRequests = query(
      collection(db, 'contactRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      setUnreadRequestsCount(snapshot.docs.length);

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          if (serverSnapRequestsRef.current && !change.doc.metadata.hasPendingWrites && !seenRequestsRef.current.has(change.doc.id)) {
            toast.success('Новый запрос на контакт!', {
              description: `Кто-то хочет получить ваши контакты`,
              action: {
                label: 'Смотреть',
                onClick: () => navigate('/chat')
              }
            });
          }
          seenRequestsRef.current.add(change.doc.id);
        }
      });
      
      if (!snapshot.metadata.fromCache) {
        serverSnapRequestsRef.current = true;
      }
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    const qFrom = query(
      collection(db, 'contactRequests'),
      where('status', '==', 'accepted'),
      where('fromUid', '==', user.uid)
    );

    const qTo = query(
      collection(db, 'contactRequests'),
      where('status', '==', 'accepted'),
      where('toUid', '==', user.uid)
    );

    const handleChatsUpdate = (fromChats: ContactRequest[], toChats: ContactRequest[]) => {
      // Map deduplication
      const chatsMap = new Map<string, ContactRequest>();
      [...fromChats, ...toChats].forEach(chat => chatsMap.set(chat.id, chat));
      const chats = Array.from(chatsMap.values());

      const unread = chats.reduce((acc, chat) => acc + (chat.unreadCount?.[user.uid] || 0), 0);
      setUnreadMessagesCount(unread);
      
      // Check for new messages to show toast
      chats.forEach(chat => {
        const currentUnread = chat.unreadCount?.[user.uid] || 0;
        
        if (!(chat.id in prevUnreadMapRef.current)) {
          // First load for this chat, don't toast, just save it
          prevUnreadMapRef.current[chat.id] = currentUnread;
        } else {
          const prevUnread = prevUnreadMapRef.current[chat.id];
          if (currentUnread > prevUnread && pathnameRef.current !== `/chat/${chat.id}`) {
            toast('💬 Новое сообщение', {
              description: chat.lastMessage ? chat.lastMessage.substring(0, 40) + '...' : 'Нажмите, чтобы прочитать',
              action: {
                label: 'Открыть',
                onClick: () => navigate(`/chat/${chat.id}`)
              }
            });
          }
          prevUnreadMapRef.current[chat.id] = currentUnread;
        }
      });
    };

    let latestFromChats: ContactRequest[] = [];
    let latestToChats: ContactRequest[] = [];

    const unsubscribeFrom = onSnapshot(qFrom, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          if (serverSnapFromRef.current && !change.doc.metadata.hasPendingWrites && !seenFromRef.current.has(change.doc.id)) {
            toast.success('🎉 Ваш запрос принят!', {
              description: 'Теперь вы можете начать общение',
              action: {
                label: 'В чат',
                onClick: () => navigate(`/chat/${change.doc.id}`)
              }
            });
          }
          seenFromRef.current.add(change.doc.id);
        }
      });
      
      if (!snapshot.metadata.fromCache) {
        serverSnapFromRef.current = true;
      }

      latestFromChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
      handleChatsUpdate(latestFromChats, latestToChats);
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    const unsubscribeTo = onSnapshot(qTo, (snapshot) => {
      latestToChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactRequest));
      handleChatsUpdate(latestFromChats, latestToChats);
    }, (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.GET, 'contactRequests');
    });

    return () => {
      unsubscribeRequests();
      unsubscribeFrom();
      unsubscribeTo();
    };
  }, [user, navigate]);

  return { totalUnread, unreadRequestsCount, unreadMessagesCount };
};
