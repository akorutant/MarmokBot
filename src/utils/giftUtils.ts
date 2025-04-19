import { GiftReward, GIFT_TYPES } from "../types/giftTypes.js";

/**
 * Открывает один подарок и определяет награду
 * Скорректированные шансы с меньшей вероятностью получения ценных наград
 */
export function openGift(): GiftReward {
    const random = Math.random();
    let cumulativeChance = 0;
    

    for (const item of GIFT_TYPES) {
        cumulativeChance += item.chance;
        if (random <= cumulativeChance) {
            const reward = { ...item.reward };
            
            if (reward.type === 'currency') {
                switch (reward.rarity) {
                    case 'common':
                        reward.amount = getRandomInt(50, 150);
                        break;
                    case 'uncommon':
                        reward.amount = getRandomInt(200, 400);
                        break;
                    case 'rare':
                        reward.amount = getRandomInt(450, 700);
                        break;
                    case 'legendary':
                        reward.amount = getRandomInt(750, 1200);
                        break;
                }
            }
            
            return reward;
        }
    }
    
    return GIFT_TYPES[0].reward;
}

/**
 * Возвращает случайное целое число в заданном диапазоне (включительно)
 */
export function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pluralizeGifts(count: number): string {
    if (count % 10 === 1 && count % 100 !== 11) return 'подарок';
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'подарка';
    return 'подарков';
  }