import { GiftReward, GIFT_TYPES } from "../types/giftTypes.js";

/**
 * Открывает один подарок и определяет награду
 * Скорректированные шансы с меньшей вероятностью получения ценных наград
 */
export function openGift(): GiftReward {
    const random = Math.random();
    let cumulativeChance = 0;
    
    // Примечание: вероятности должны быть настроены в GIFT_TYPES
    // Эта функция только использует их для определения результата
    
    for (const item of GIFT_TYPES) {
        cumulativeChance += item.chance;
        if (random <= cumulativeChance) {
            const reward = { ...item.reward };
            
            if (reward.type === 'currency') {
                switch (reward.rarity) {
                    case 'common':
                        // Немного уменьшен верхний диапазон
                        reward.amount = getRandomInt(50, 150);
                        break;
                    case 'uncommon':
                        // Немного уменьшен верхний диапазон
                        reward.amount = getRandomInt(200, 400);
                        break;
                    case 'rare':
                        // Добавлен промежуточный уровень
                        reward.amount = getRandomInt(450, 700);
                        break;
                    case 'legendary':
                        // Сохранен высокий выигрыш для легендарных
                        reward.amount = getRandomInt(750, 1200);
                        break;
                }
            }
            
            return reward;
        }
    }
    
    // Возвращаем первый элемент как значение по умолчанию
    return GIFT_TYPES[0].reward;
}

/**
 * Возвращает случайное целое число в заданном диапазоне (включительно)
 */
export function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}