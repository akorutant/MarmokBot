export interface GiftReward {
    type: 'nothing' | 'currency';
    name: string;
    emoji: string;
    rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
    amount?: number;
}

export interface GiftType {
    chance: number;
    reward: GiftReward;
}

export const GIFT_TYPES: GiftType[] = [
    {
        chance: 0.40, 
        reward: {
            type: 'nothing',
            name: 'Пустой подарок',
            emoji: '📦'
        }
    },
    {
        chance: 0.40, 
        reward: {
            type: 'currency',
            name: 'Немного монет',
            emoji: '💰',
            rarity: 'common'
        }
    },
    {
        chance: 0.15, 
        reward: {
            type: 'currency',
            name: 'Мешочек с монетами',
            emoji: '💸',
            rarity: 'uncommon'
        }
    },
    {
        chance: 0.04, 
        reward: {
            type: 'currency',
            name: 'Сундук с золотом',
            emoji: '💶',
            rarity: 'rare'
        }
    },
    {
        chance: 0.01, 
        reward: {
            type: 'currency',
            name: 'Сокровище',
            emoji: '💎',
            rarity: 'legendary'
        }
    }
];
