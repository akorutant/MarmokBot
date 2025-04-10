/**
 * Вычисляет требуемый опыт для достижения определенного уровня
 * 19 уровень = 1млн опыта, 20 уровень = 2млн опыта
 * Максимальный уровень - 20
 * 
 * @param level целевой уровень
 * @returns количество опыта, необходимое для достижения уровня
 */
export function getExpForLevel(level: number): bigint {
    if (level > 20) {
        return getExpForLevel(20);
    }
        if (level <= 19) {
        const baseValue = 85;         
        const factor = 700;            
        const power = 2.53;          
        
        const linearComponent = baseValue * level;
        const exponentialComponent = factor * Math.pow(level - 1, power);
        return BigInt(Math.floor(linearComponent + exponentialComponent));
    } else {
        return BigInt(2000000);
    }
}

/**
 * Вычисляет требуемый опыт для достижения следующего уровня
 * @param level текущий уровень
 */
export function calculateNextLevelExp(currentLevel: number): bigint {
    if (currentLevel >= 20) {
        return BigInt(0);
    }
    return getExpForLevel(currentLevel + 1);
}

/**
 * Находит максимальный уровень, который пользователь может достичь с текущим опытом
 * @param currentExp текущий опыт пользователя
 * @param startLevel уровень с которого начинать проверку
 * @returns максимальный возможный уровень
 */
export function getMaxLevelForExp(currentExp: bigint, startLevel: number = 1): number {
    let level = startLevel;
    
    while (level < 20) {
        const nextLevelExp = getExpForLevel(level + 1);
        if (currentExp < nextLevelExp) {
            break;
        }
        level++;
    }
    
    return level;
}

/**
 * Рассчитывает, сколько опыта осталось до следующего уровня
 * @param currentExp текущий опыт пользователя
 * @param currentLevel текущий уровень пользователя
 * @returns количество опыта, необходимое для достижения следующего уровня
 */
export function getExpToNextLevel(currentExp: bigint, currentLevel: number): bigint {
    if (currentLevel >= 20) {
        return BigInt(0); 
    }
    
    const nextLevelExp = getExpForLevel(currentLevel + 1);
    return nextLevelExp - currentExp;
}

/**
 * Рассчитывает процент прогресса к следующему уровню
 * @param currentExp текущий опыт пользователя
 * @param currentLevel текущий уровень пользователя
 * @returns процент прогресса (от 0 до 100)
 */
export function getProgressToNextLevel(currentExp: bigint, currentLevel: number): number {
    if (currentLevel >= 20) {
        return 100;
    }
    
    const currentLevelExp = getExpForLevel(currentLevel);
    const nextLevelExp = getExpForLevel(currentLevel + 1);
    
    const totalExpNeeded = nextLevelExp - currentLevelExp;
    const expGained = currentExp - currentLevelExp;
    
    return Math.floor(Number(expGained * BigInt(100)) / Number(totalExpNeeded));
}

/**
 * Примерный расчет времени (в днях) для достижения следующего уровня
 * при текущем темпе набора опыта
 * @param expToNextLevel опыт, необходимый для следующего уровня
 * @param avgDailyXP средний дневной набор опыта (по умолчанию 1500)
 * @returns количество дней
 */
export function getDaysToNextLevel(expToNextLevel: bigint, avgDailyXP: number = 1500): number {
    return Math.ceil(Number(expToNextLevel) / avgDailyXP);
}

/**
 * Проверяет, достигнут ли максимальный уровень
 * @param level текущий уровень
 * @returns true, если достигнут максимальный уровень
 */
export function isMaxLevel(level: number): boolean {
    return level >= 20;
}

/**
 * Вычисляет примерное время в днях для достижения определенного уровня
 * @param targetLevel целевой уровень
 * @param avgDailyXP средний дневной набор опыта
 * @returns количество дней для достижения уровня
 */
export function getDaysToLevel(targetLevel: number, avgDailyXP: number = 1500): number {
    if (targetLevel <= 0 || targetLevel > 20) {
        return 0;
    }
    
    const requiredExp = getExpForLevel(targetLevel);
    return Math.ceil(Number(requiredExp) / avgDailyXP);
}