import { createCanvas, loadImage, registerFont } from 'canvas';
import { User } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMaxLevel } from './levelUpUtils.js';
import logger from '../services/logger.js';
import { getHoursString } from './hoursUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Регистрация шрифтов
function registerFonts() {
  try {
    const fontsPath = path.join(__dirname, '../../assets/fonts');
    
    registerFont(path.join(fontsPath, 'Montserrat-Bold.ttf'), {
      family: 'Montserrat',
      weight: 'bold'
    });

    registerFont(path.join(fontsPath, 'Montserrat-Regular.ttf'), {
      family: 'Montserrat',
      weight: 'normal'
    });
  } catch (error) {
    logger.error('Font registration error:', error);
    throw error;
  }
}

try {
  registerFonts();
} catch (error) {
  logger.error('Font initialization failed:', error);
}

// Полифил для roundRect (применяем к прототипу)
const ctxBase = createCanvas(1, 1).getContext('2d');
const ctxProto = ctxBase ? Object.getPrototypeOf(ctxBase) : null;

if (ctxProto && !ctxProto.roundRect) {
  ctxProto.roundRect = function (
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    if (radius > width / 2) radius = width / 2;
    if (radius > height / 2) radius = height / 2;
    
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + width, y, x + width, y + height, radius);
    this.arcTo(x + width, y + height, x, y + height, radius);
    this.arcTo(x, y + height, x, y, radius);
    this.arcTo(x, y, x + width, y, radius);
    this.closePath();
    return this;
  };
}

/**
 * Генерирует изображение профиля пользователя
 * @param user Объект пользователя Discord
 * @param messageCount Количество сообщений
 * @param voiceMinutes Минуты в голосовых каналах
 * @param level Уровень пользователя
 * @param currency Количество валюты
 * @param progressPercent Процент прогресса до следующего уровня (от 0 до 100)
 * @returns Буфер с изображением профиля
 */
export async function generateProfileImage(
  user: User,
  messageCount: number,
  voiceMinutes: number,
  level: number,
  currency: number,
  progressPercent: number
): Promise<Buffer> {
  try {
    const canvas = createCanvas(1000, 500);
    const ctx = canvas.getContext('2d');

    // Основные стили
    const styles = {
      primary: '#FF6B00',
      secondary: '#FFA726',
      accent: '#FFD54F',
      text: '#FFFFFF',
      textSecondary: '#EEEEEE',
      panelBg: 'rgba(40, 40, 40, 0.85)',
      cardBg: 'rgba(30, 30, 30, 0.9)',
      avatarSize: 160,
      borderRadius: 15
    };
    
    // Перевод минут в часы
    const voiceHours = Math.floor(voiceMinutes / 60); 
    const hoursString = getHoursString(voiceHours);

    // Отрисовка фона
    await drawBackground(ctx, canvas);
    
    // Отрисовка контента
    await drawProfileHeader(ctx, user, styles);
    drawStatisticsPanel(ctx, messageCount, voiceHours, hoursString, currency, styles);
    drawLevelPanel(ctx, level, progressPercent, styles);
    
    return canvas.toBuffer();
  } catch (error) {
    logger.error('Error generating profile image:', error);
    return createErrorCanvas();
  }
}

/**
 * Создает простое изображение с сообщением об ошибке
 */
function createErrorCanvas(): Buffer {
  const canvas = createCanvas(800, 400);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#1E1E1E';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = 'bold 32px Montserrat';
  ctx.fillStyle = '#FF6B00';
  ctx.textAlign = 'center';
  ctx.fillText('Ошибка при создании изображения профиля', canvas.width / 2, canvas.height / 2);
  
  return canvas.toBuffer();
}

/**
 * Отрисовывает фоновое изображение с сохранением пропорций
 */
async function drawBackground(ctx: any, canvas: any) {
  try {
    const bgPath = path.join(__dirname, '../../assets/images/bibi.jpg');
    const bgImage = await loadImage(bgPath);

    const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
    const x = (canvas.width - bgImage.width * scale) / 2;
    const y = (canvas.height - bgImage.height * scale) / 2;
    
    ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
    
    // Затемнение и градиент
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(255, 107, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(30, 30, 30, 0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } catch (error) {
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Отрисовывает верхнюю часть профиля с аватаром и именем
 */
async function drawProfileHeader(ctx: any, user: User, styles: any) {
  try {
    const avatarX = 70;
    const avatarY = 70;
    const avatarSize = styles.avatarSize;
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 512 }) || user.defaultAvatarURL;
    const avatar = await loadImage(avatarURL);

    // Рисуем аватар с тенью
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Рисуем обводку аватара
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = styles.primary;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Имя пользователя
    ctx.font = 'bold 42px Montserrat';
    ctx.fillStyle = styles.text;
    ctx.textAlign = 'left';
    ctx.fillText(user.username, avatarX + avatarSize + 40, avatarY + 60);

    // Идентификатор
    ctx.font = '24px Montserrat';
    ctx.fillStyle = styles.accent;
    ctx.fillText(`ID: ${user.id}`, avatarX + avatarSize + 40, avatarY + 100);

    // Дата создания (если нужно отрисовать, можно добавить ниже)
  } catch (error) {
    logger.error(`Ошибка при отрисовке заголовка: ${error}`);
    drawFallbackAvatar(ctx, 70, 70, styles);
  }
}

/**
 * Отрисовывает запасной аватар при ошибке загрузки
 */
function drawFallbackAvatar(ctx: any, x: number, y: number, styles: any) {
  const size = styles.avatarSize;
  ctx.fillStyle = styles.primary;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = styles.text;
  ctx.font = 'bold 60px Montserrat';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x + size / 2, y + size / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Рисует панель с закругленными углами
 */
function drawPanel(ctx: any, x: number, y: number, width: number, height: number, radius: number, styles: any) {
  ctx.fillStyle = styles.panelBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  
  ctx.strokeStyle = styles.primary;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Отрисовывает панель со статистикой
 */
function drawStatisticsPanel(
  ctx: any, 
  messageCount: number, 
  voiceHours: number, 
  hoursString: string, 
  currency: number, 
  styles: any
) {
  const panelX = 60;
  const panelY = 250;
  const panelWidth = 420;
  const panelHeight = 200;

  drawPanel(ctx, panelX, panelY, panelWidth, panelHeight, styles.borderRadius, styles);
  
  // Заголовок панели
  ctx.font = 'bold 28px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'left';
  ctx.fillText('Статистика', panelX + 25, panelY + 40);
  
  // Разбивка панели по вертикали
  drawStatItem(ctx, panelX + 25, panelY + 90, '', `Сообщений: ${messageCount.toLocaleString('ru-RU')}`, styles);
  drawStatItem(ctx, panelX + 25, panelY + 130, '', `В голосовых: ${voiceHours} ${hoursString}`, styles);
  drawStatItem(ctx, panelX + 25, panelY + 170, '', `Баланс: ${currency.toLocaleString('ru-RU')} $`, styles);
}

/**
 * Отрисовывает отдельный элемент статистики
 */
function drawStatItem(ctx: any, x: number, y: number, icon: string, text: string, styles: any) {
  ctx.font = '24px Montserrat';
  ctx.fillText(icon, x, y);
  ctx.fillStyle = styles.text;
  ctx.fillText(text, x, y);
}

/**
 * Отрисовывает панель с информацией об уровне, включая круг с уровнем и прогресс-бар
 */
function drawLevelPanel(
  ctx: any, 
  level: number, 
  progressPercent: number, 
  styles: any
) {
  const panelX = 520;
  const panelY = 250;
  const panelWidth = 420;
  const panelHeight = 200;
  
  drawPanel(ctx, panelX, panelY, panelWidth, panelHeight, styles.borderRadius, styles);
  
  // Заголовок панели "Уровень"
  ctx.font = 'bold 28px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'left';
  ctx.fillText('Уровень', panelX + 25, panelY + 40);
  
  // Фоновый круг для уровня
  const circleX = panelX + 90;
  const circleY = panelY + 120;
  const circleRadius = 60;
  
  ctx.fillStyle = styles.cardBg;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = styles.primary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Уровень внутри круга
  ctx.font = 'bold 48px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(level.toString(), circleX, circleY);
  
  // Прогресс-бар
  if (!isMaxLevel(level)) {
    const barX = panelX + 190;
    const barY = panelY + 120;
    const barWidth = 200;
    const barHeight = 20;
    const barRadius = 10;
    
    // Фон прогресс-бара
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
    ctx.fill();
    
    // Заполненная часть прогресс-бара
    const clampedProgress = Math.max(0, Math.min(progressPercent, 100));
    let progressWidth = Math.max(barHeight, barWidth * clampedProgress / 100); // Минимальная ширина = высота бара
    
    // Для очень маленьких значений делаем визуально заметный прогресс
    if (clampedProgress > 0 && progressWidth < barHeight * 2) {
      progressWidth = barHeight * 1.2; // Минимальная видимая ширина
    }
    
    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, styles.primary);
    gradient.addColorStop(1, styles.secondary);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, progressWidth, barHeight, barRadius);
    ctx.fill();
    
    // Текст прогресса
    ctx.font = 'bold 18px Montserrat';
    ctx.fillStyle = styles.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${clampedProgress}%`, barX + barWidth / 2, barY - 5);
  } else {
    // Максимальный уровень
    ctx.font = 'bold 22px Montserrat';
    ctx.fillStyle = styles.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('МАКС. УРОВЕНЬ', panelX + (panelWidth - circleRadius * 2), panelY + 120);
  }
}
