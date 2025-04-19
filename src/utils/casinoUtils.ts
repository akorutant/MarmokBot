import { CasinoResult, CasinoMultiplier } from "../types/casinoTypes.js";

// Возможные множители выигрыша с шансами выпадения
// Уменьшенные шансы на победу и увеличенный шанс проигрыша
const CASINO_MULTIPLIERS: CasinoMultiplier[] = [
    { 
        chance: 0.005, 
        value: 10.0, 
        emoji: "💎", 
        description: "ДЖЕКПОТ! Невероятная удача! Ваша ставка умножена в 10 раз!"
    },
    { 
        chance: 0.045,
        value: 3.0,
        emoji: "🎰", 
        description: "Крупный выигрыш! Ваша ставка умножена в 3 раза!"
    },
    { 
        chance: 0.15, 
        value: 1.5, 
        emoji: "🍀", 
        description: "Неплохой выигрыш! Ваша ставка умножена в 1.5 раза."
    },
    { 
        chance: 0.20, 
        value: 1.0, 
        emoji: "🎲", 
        description: "Ваша ставка возвращается. Ни выигрыша, ни проигрыша."
    },
    { 
        chance: 0.60, 
        value: 0, 
        emoji: "💸", 
        description: "К сожалению, удача сегодня не на вашей стороне. Вы теряете ставку."
    }
];

/**
 * Определяет результат игры в казино на основе шансов выпадения
 * @returns Результат игры в казино (множитель и описание)
 */
export function determineCasinoResult(): CasinoResult {
    const rand = Math.random();
    let cumulativeChance = 0;
    
    for (const multiplier of CASINO_MULTIPLIERS) {
        cumulativeChance += multiplier.chance;
        if (rand <= cumulativeChance) {
            return {
                multiplier: multiplier.value,
                emoji: multiplier.emoji,
                description: multiplier.description
            };
        }
    }
    
    // По умолчанию возвращаем проигрыш (последний элемент массива)
    const defaultResult = CASINO_MULTIPLIERS[CASINO_MULTIPLIERS.length - 1];
    return {
        multiplier: defaultResult.value,
        emoji: defaultResult.emoji,
        description: defaultResult.description
    };
}