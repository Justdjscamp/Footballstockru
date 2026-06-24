export type UserRole = 'player' | 'manager';

export interface PlayerProfile {
  position: string;
  gameFormat: string;
  metroStations: string[];
  experience: string;
}

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string;
  balance: number;
  heldBalance?: number;
  fcmTokens?: string[];
  playerProfile?: PlayerProfile;
  createdAt: string;
  lastActive?: string;
}

export interface Team {
  id: string;
  managerUid: string;
  name: string;
  gameFormat: string;
  tournaments: string[];
  reinforcementPositions: string[];
  description: string;
  logoURL?: string;
  members?: string[];
  createdAt: string;
}

export interface ContactRequest {
  id: string;
  fromUid: string;
  toUid: string;
  teamId?: string;
  status: 'pending' | 'accepted' | 'rejected';
  price: number;
  fromName?: string;
  fromPhotoURL?: string;
  toName?: string;
  toPhotoURL?: string;
  teamName?: string;
  teamLogoURL?: string;
  createdAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: { [uid: string]: number };
  typing?: { [uid: string]: boolean };
}

export interface Message {
  id: string;
  chatId: string;
  senderUid: string;
  text: string;
  createdAt: string;
  imageUrl?: string;
  audioUrl?: string;
  isEdited?: boolean;
  isDeleted?: boolean;
}

export interface Transaction {
  id: string;
  uid: string;
  amount: number;
  type: 'topup' | 'payment';
  description: string;
  createdAt: string;
}
