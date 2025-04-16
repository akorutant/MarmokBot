/**
 * Возвращает правильное склонение слова "час" по правилам русского языка
 * @param hours Количество часов
 * @returns Строка со словом "час" в правильном склонении
 */
export function getHoursString(hours: number): string {
  const lastDigit = Math.abs(hours) % 10;
  const lastTwoDigits = Math.abs(hours) % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return "часов";
  }

  if (lastDigit === 1) {
    return "час";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "часа";
  }

  return "часов";
}

