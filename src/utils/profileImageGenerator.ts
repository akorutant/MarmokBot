import { createCanvas, loadImage, registerFont, Canvas, CanvasRenderingContext2D, Image } from 'canvas';
import { User } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMaxLevel } from './levelUpUtils.js';
import logger from '../services/logger.js';
import { getHoursString } from './hoursUtils.js';
import { getAverageColor } from 'fast-average-color-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Font Registration --------------------
/** Регистрирует шрифты Montserrat */
function registerFonts(): void {
  try {
    const fontsPath: string = path.join(__dirname, '../../assets/fonts');
    registerFont(path.join(fontsPath, 'Montserrat-Bold.ttf'), { family: 'Montserrat', weight: 'bold' });
    registerFont(path.join(fontsPath, 'Montserrat-Regular.ttf'), { family: 'Montserrat', weight: 'normal' });
  } catch (error: unknown) {
    logger.error('Font registration error:', error);
    throw error;
  }
}

try { registerFonts(); } catch (error: unknown) { logger.error('Font initialization failed:', error); }

// -------------------- Type Definitions --------------------
interface RGB { r: number; g: number; b: number; }
interface HSL { h: number; s: number; l: number; }
interface Styles {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  panelBg: string;
  cardBg: string;
  borderRadius: number;
  avatarSize: number;
}

// -------------------- Color Conversion and Analysis --------------------
/**
 * Преобразует RGB в HSL
 */
function rgb2hsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    
    h /= 6;
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Преобразует HSL в RGB
 */
function hsl2rgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Анализирует изображение для выделения доминантных цветов с учетом областей интереса
 */
async function analyzeImageColors(image: Image): Promise<RGB> {
  try {
    // Создаем Canvas из изображения для анализа
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    let dominantColor: RGB;
    
    try {
      // Пробуем использовать fast-average-color-node
      // Нужно преобразовать canvas в Buffer или строку для getAverageColor
      const imageBuffer = canvas.toBuffer();
      const fac = await getAverageColor(imageBuffer);
      
      // Теперь получаем результат правильно из типа FastAverageColorResult
      dominantColor = { r: fac.value[0], g: fac.value[1], b: fac.value[2] };
    } catch (facError) {
      logger.warn('Fast average color failed, using fallback method:', facError);
      // Используем только наш собственный алгоритм как запасной вариант
      dominantColor = computeAverageColor(image);
    }
    
    // Выборочный анализ разных зон изображения для лучшей адаптации
    // Анализируем верхнюю часть (где будет текст)
    const topData = ctx.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.3)).data;
    // Анализируем середину изображения
    const midData = ctx.getImageData(0, Math.floor(canvas.height * 0.3), canvas.width, Math.floor(canvas.height * 0.4)).data;
    
    // Вычисляем средние цвета для разных областей
    const topColor = computeAverageFromData(topData);
    const midColor = computeAverageFromData(midData);
    
    // Приоритет верхней части, где будет размещаться текст
    const r = Math.round((topColor.r * 0.6 + midColor.r * 0.4));
    const g = Math.round((topColor.g * 0.6 + midColor.g * 0.4));
    const b = Math.round((topColor.b * 0.6 + midColor.b * 0.4));
    
    return { r, g, b };
  } catch (error) {
    logger.error('Error analyzing image colors:', error);
    // Возвращаем нейтральный серый цвет в случае ошибки
    return { r: 128, g: 128, b: 128 };
  }
}

/**
 * Вычисляет средний цвет из данных ImageData
 */
function computeAverageFromData(data: Uint8ClampedArray): RGB {
  let r = 0, g = 0, b = 0;
  const pixelCount = data.length / 4;
  
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  
  return {
    r: Math.round(r / pixelCount),
    g: Math.round(g / pixelCount),
    b: Math.round(b / pixelCount)
  };
}

/**
 * Вычисляет средний цвет изображения с помощью уменьшенного образца
 */
function computeAverageColor(image: Image, sampleSize = 50): RGB {
  const offCanvas: Canvas = createCanvas(sampleSize, sampleSize);
  const offCtx: CanvasRenderingContext2D = offCanvas.getContext('2d')!;
  offCtx.drawImage(image, 0, 0, sampleSize, sampleSize);
  const data = offCtx.getImageData(0, 0, sampleSize, sampleSize).data;
  let r = 0, g = 0, b = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

/**
 * Определяет, является ли цвет слишком темным или слишком светлым
 */
function isColorExtreme(color: RGB): boolean {
  const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
  return brightness < 30 || brightness > 225;
}

/**
 * Корректирует цвет, если он слишком экстремальный
 */
function normalizeColor(color: RGB): RGB {
  const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
  
  if (brightness < 30) {
    // Слишком темный цвет, делаем его светлее
    const hsl = rgb2hsl(color.r, color.g, color.b);
    hsl.l = Math.max(hsl.l, 20); // Минимальная яркость 20%
    return hsl2rgb(hsl.h, hsl.s, hsl.l);
  } else if (brightness > 225) {
    // Слишком светлый цвет, делаем его темнее
    const hsl = rgb2hsl(color.r, color.g, color.b);
    hsl.l = Math.min(hsl.l, 80); // Максимальная яркость 80%
    return hsl2rgb(hsl.h, hsl.s, hsl.l);
  }
  
  return color;
}

/**
 * Генерирует стили на основе базового цвета с улучшенной адаптацией
 */
function generateStylesFromColor(color: RGB): Styles {
  // Нормализуем цвет для избежания экстремальных значений
  const normalizedColor = normalizeColor(color);
  const { r, g, b } = normalizedColor;
  
  // Преобразуем в HSL для более точной манипуляции цветами
  const hsl = rgb2hsl(r, g, b);
  
  // Определяем светлоту для адаптации интерфейса
  const isDark = hsl.l < 50;
  
  // Определяем основной текстовый цвет в зависимости от фона
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const textSecondary = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)';
  
  // Создаем вариации основного цвета с разной насыщенностью и яркостью
  const primary = hslToString(hsl.h, Math.min(hsl.s + 10, 100), isDark ? Math.min(hsl.l + 15, 90) : Math.max(hsl.l - 15, 10));
  const secondary = hslToString(hsl.h, Math.min(hsl.s + 5, 100), isDark ? Math.min(hsl.l + 5, 85) : Math.max(hsl.l - 5, 15));
  
  // Создаем акцентный цвет, смещая оттенок
  const accentHue = (hsl.h + 180) % 360; // Комплементарный цвет
  const accent = hslToString(accentHue, Math.min(70, hsl.s + 20), isDark ? 65 : 45);
  
  // Создаем полупрозрачные фоны для панелей с повышенной прозрачностью
  const panelBg = isDark 
    ? `rgba(${Math.floor(r/3)}, ${Math.floor(g/3)}, ${Math.floor(b/3)}, 0.75)` 
    : `rgba(${Math.min(r+20, 255)}, ${Math.min(g+20, 255)}, ${Math.min(b+20, 255)}, 0.75)`;
  
  const cardBg = isDark
    ? `rgba(${Math.floor(r/4)}, ${Math.floor(g/4)}, ${Math.floor(b/4)}, 0.8)`  
    : `rgba(${Math.min(r+30, 255)}, ${Math.min(g+30, 255)}, ${Math.min(b+30, 255)}, 0.75)`;
  
  return {
    primary,
    secondary,
    accent,
    text: textColor,
    textSecondary,
    panelBg,
    cardBg,
    borderRadius: 15,
    avatarSize: 160,
  };
}

/**
 * Конвертирует HSL в строку CSS
 */
function hslToString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

// -------------------- Polyfill for roundRect --------------------
const ctxPrototype = Object.getPrototypeOf(createCanvas(1,1).getContext('2d')) as any;
if (!ctxPrototype.roundRect) {
  ctxPrototype.roundRect = function(x: number,y: number,w: number,h: number,r: number) {
    if (r > w/2) r = w/2; if (r > h/2) r = h/2;
    this.beginPath(); this.moveTo(x+r,y);
    this.arcTo(x+w,y,x+w,y+h,r);
    this.arcTo(x+w,y+h,x,y+h,r);
    this.arcTo(x,y+h,x,y,r);
    this.arcTo(x,y,x+w,y,r);
    this.closePath(); return this;
  };
}

export async function generateProfileImage(
  user: User,
  messageCount: number,
  voiceMinutes: number,
  level: number,
  currency: number,
  progressPercent: number,
  backgroundImagePath?: string // Добавляем опциональный параметр для пути к кастомному фону
): Promise<Buffer> {
  try {
    const canvas: Canvas = createCanvas(1000, 500);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
    
    // Используем указанное изображение или стандартное
    const bgPath = backgroundImagePath || path.join(__dirname, '../../assets/images/marmok_background.png');
    const bgImage: Image = await loadImage(bgPath) as Image;
    
    // Анализируем цвета изображения с улучшенным алгоритмом
    const avgColor = await analyzeImageColors(bgImage);
    const styles = generateStylesFromColor(avgColor);
    
    // Отрисовываем фон с адаптивным затемнением
    await drawBackground(ctx, canvas, bgImage, styles);
    
    const voiceHours = Math.floor(voiceMinutes/60);
    const hoursString = getHoursString(voiceHours);
    
    await drawProfileHeader(ctx, user, styles);
    drawStatisticsPanel(ctx, messageCount, voiceHours, hoursString, currency, styles);
    drawLevelPanel(ctx, level, progressPercent, styles);
    
    return canvas.toBuffer();
  } catch (error: unknown) {
    logger.error('Error generating profile image:', error);
    return createErrorCanvas();
  }
}

function createErrorCanvas(): Buffer {
  const canvas: Canvas = createCanvas(800, 400);
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
  ctx.fillStyle = '#1E1E1E';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 32px Montserrat';
  ctx.fillStyle = '#FF6B00';
  ctx.textAlign = 'center';
  ctx.fillText('Ошибка при создании изображения профиля', canvas.width/2, canvas.height/2);
  return canvas.toBuffer();
}

/**
 * Отрисовывает фон с адаптивным затемнением на основе цветов изображения
 */
async function drawBackground(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  bgImage: Image,
  styles: Styles
): Promise<void> {
  // Масштабирование и отрисовка фонового изображения для заполнения всего холста
  const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
  const scaledWidth = bgImage.width * scale;
  const scaledHeight = bgImage.height * scale;
  const x = (canvas.width - scaledWidth) / 2;
  const y = (canvas.height - scaledHeight) / 2;
  
  // Отрисовываем исходное изображение
  ctx.drawImage(bgImage, x, y, scaledWidth, scaledHeight);
  
  // Получаем средний цвет для анализа яркости изображения
  // Используем уже проанализированные цвета из styles вместо повторного анализа
  // Извлекаем примерные RGB компоненты из строки CSS primary
  const styleColorMatch = styles.primary.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  let r = 128, g = 128, b = 128;
  let hsl: HSL;
  
  if (styleColorMatch && styleColorMatch.length >= 4) {
    // Если primary в формате HSL, конвертируем в RGB
    const h = parseInt(styleColorMatch[1], 10);
    const s = parseInt(styleColorMatch[2], 10);
    const l = parseInt(styleColorMatch[3], 10);
    hsl = { h, s, l };
    const rgb = hsl2rgb(h, s, l);
    r = rgb.r;
    g = rgb.g;
    b = rgb.b;
  } else {
    // Используем вычисление среднего цвета напрямую из изображения
    const sampleColor = computeAverageColor(bgImage);
    r = sampleColor.r;
    g = sampleColor.g;
    b = sampleColor.b;
    hsl = rgb2hsl(r, g, b);
  }
  
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isDark = brightness < 128;
  
  // Создаем градиент для затемнения (темнее сверху, светлее снизу)
  // Это обеспечивает лучшую видимость текста профиля в верхней части
  const overlayGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  
  if (isDark) {
    // Для темных изображений делаем менее интенсивное затемнение
    overlayGradient.addColorStop(0, `rgba(0, 0, 0, 0.7)`);
    overlayGradient.addColorStop(0.4, `rgba(0, 0, 0, 0.6)`);
    overlayGradient.addColorStop(1, `rgba(0, 0, 0, 0.4)`);
  } else {
    // Для светлых изображений делаем более интенсивное затемнение
    overlayGradient.addColorStop(0, `rgba(0, 0, 0, 0.8)`);
    overlayGradient.addColorStop(0.4, `rgba(0, 0, 0, 0.7)`);
    overlayGradient.addColorStop(1, `rgba(0, 0, 0, 0.5)`);
  }
  
  // Применяем градиентное затемнение
  ctx.fillStyle = overlayGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Добавляем цветной оверлей, соответствующий цветовой гамме изображения
  const colorOverlay = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  
  // Создаем более насыщенную версию базового цвета
  const saturatedHSL = {
    h: hsl.h,
    s: Math.min(hsl.s + 10, 100),
    l: isDark ? Math.min(hsl.l + 10, 50) : Math.max(hsl.l - 10, 30)
  };
  
  // Добавляем акцентный цвет (комплементарный оттенок)
  const accentHSL = {
    h: (hsl.h + 30) % 360, // Слегка смещаем оттенок
    s: saturatedHSL.s,
    l: saturatedHSL.l
  };
  
  // Добавляем градиент с оттенком основного цвета
  const rgbMain = hsl2rgb(saturatedHSL.h, saturatedHSL.s, saturatedHSL.l);
  const rgbAccent = hsl2rgb(accentHSL.h, accentHSL.s, accentHSL.l);
  
  colorOverlay.addColorStop(0, `rgba(${rgbMain.r}, ${rgbMain.g}, ${rgbMain.b}, 0.3)`);
  colorOverlay.addColorStop(1, `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.2)`);
  
  // Применяем цветной оверлей
  ctx.fillStyle = colorOverlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Добавляем виньетку по краям для лучшего выделения контента в центре
  const vignette = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.3,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.7
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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

    // Имя пользователя с улучшенной читаемостью
    ctx.save();
    // Добавляем тень для текста для лучшей читаемости на любом фоне
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.font = 'bold 42px Montserrat';
    ctx.fillStyle = styles.text;
    ctx.textAlign = 'left';
    ctx.fillText(user.username, avatarX + avatarSize + 40, avatarY + 60);

    // Идентификатор с тенью для улучшения читаемости
    ctx.font = '24px Montserrat';
    ctx.fillStyle = styles.accent;
    ctx.fillText(`ID: ${user.id}`, avatarX + avatarSize + 40, avatarY + 100);
    ctx.restore();

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
 * Рисует панель с закругленными углами с улучшенной визуальной привлекательностью
 */
function drawPanel(ctx: any, x: number, y: number, width: number, height: number, radius: number, styles: any) {
  // Добавляем тень для эффекта глубины
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  
  // Фон панели с повышенной прозрачностью
  const panelBgAlpha = styles.panelBg.match(/rgba\(.*,\s*([\d\.]+)\)/);
  let panelBgColor;
  
  if (panelBgAlpha && panelBgAlpha[1]) {
    // Если panelBg уже в формате rgba, увеличиваем прозрачность
    const currentAlpha = parseFloat(panelBgAlpha[1]);
    const newAlpha = Math.max(0.5, currentAlpha * 0.85); // Увеличиваем прозрачность на 15%
    panelBgColor = styles.panelBg.replace(/rgba\(.*,\s*[\d\.]+\)/, `rgba/**
 * Рисует панель с закругленными углами с улучшенной визуальной привлекательностью
 */
function drawPanel(ctx: any, x: number, y: number, width: number, height: number, radius: number, styles: any) {
  // Добавляем тень для эффекта глубины
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  
  // Фон панели
  ctx.fillStyle = styles.panelBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
  
  // Обводка панели с градиентом
  const strokeGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  strokeGradient.addColorStop(0, styles.primary);
  strokeGradient.addColorStop(1, styles.secondary);
  
  ctx.strokeStyle = strokeGradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
  
  // Добавляем световой эффект по верхнему краю для объемности
  const glowGradient = ctx.createLinearGradient(x, y, x, y + height * 0.1);
  glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height * 0.1, radius);
  ctx.fill();
}`.replace(/,\s*[\d\.]+\)$/, `, ${newAlpha})`));
  } else if (styles.panelBg.startsWith('rgb(')) {
    // Если panelBg в формате rgb, преобразуем в rgba
    panelBgColor = styles.panelBg.replace(/rgb\((.*)\)/, `rgba($1, 0.8)`);
  } else {
    // Используем исходное значение, если формат не распознан
    panelBgColor = styles.panelBg;
  }
  
  ctx.fillStyle = panelBgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
  
  // Обводка панели с градиентом
  const strokeGradient = ctx.createLinearGradient(x, y, x + width, y + height);
  strokeGradient.addColorStop(0, styles.primary);
  strokeGradient.addColorStop(1, styles.secondary);
  
  ctx.strokeStyle = strokeGradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
  
  // Добавляем световой эффект по верхнему краю для объемности
  const glowGradient = ctx.createLinearGradient(x, y, x, y + height * 0.1);
  glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height * 0.1, radius);
  ctx.fill();
}

/**
 * Отрисовывает панель со статистикой с улучшенной визуальной привлекательностью
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
  
  // Заголовок панели с тенью для лучшей читаемости
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  ctx.font = 'bold 28px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'left';
  ctx.fillText('Статистика', panelX + 25, panelY + 40);
  ctx.restore();
  
  drawStatItem(ctx, panelX + 25, panelY + 90, `Сообщений: ${messageCount.toLocaleString('ru-RU')}`, styles);
  drawStatItem(ctx, panelX + 25, panelY + 130, `В голосовых: ${voiceHours} ${hoursString}`, styles);
  drawStatItem(ctx, panelX + 25, panelY + 170, `Баланс: ${currency.toLocaleString('ru-RU')} $`, styles);
}

/**
 * Отрисовывает отдельный элемент статистики с иконкой
 */
function drawStatItem(ctx: any, x: number, y: number, text: string, styles: any) {
  ctx.save();
  // Добавляем тень для текста
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  const textOnPanel = 'rgba(255, 255, 255, 0.95)';

    
  // Основной текст
  ctx.font = '24px Montserrat';
  ctx.fillStyle = textOnPanel;
  ctx.fillText(text, x, y);
  ctx.restore();
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
  
  // Заголовок панели "Уровень" с тенью для улучшения читаемости
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  ctx.font = 'bold 28px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'left';
  ctx.fillText('Уровень', panelX + 25, panelY + 40);
  ctx.restore();
  
  // Фоновый круг для уровня с эффектом свечения
  const circleX = panelX + 90;
  const circleY = panelY + 120;
  const circleRadius = 60;
  
  // Эффект свечения / ореола вокруг круга
  const glowRadius = circleRadius + 10;
  const glowGradient = ctx.createRadialGradient(
    circleX, circleY, circleRadius - 10,
    circleX, circleY, glowRadius
  );
  glowGradient.addColorStop(0, `${styles.primary}80`); // 50% прозрачности
  glowGradient.addColorStop(1, `${styles.primary}00`); // 0% прозрачности
  
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(circleX, circleY, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Фон круга с градиентом
  const circleGradient = ctx.createRadialGradient(
    circleX - circleRadius/3, circleY - circleRadius/3, 0,
    circleX, circleY, circleRadius
  );
  circleGradient.addColorStop(0, styles.cardBg);
  circleGradient.addColorStop(1, styles.panelBg);
  
  ctx.fillStyle = circleGradient;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
  ctx.fill();

  // Обводка круга
  ctx.save();
  ctx.strokeStyle = styles.primary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  
  // Уровень внутри круга с эффектом тени для объема
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  ctx.font = 'bold 48px Montserrat';
  ctx.fillStyle = styles.primary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(level.toString(), circleX, circleY);
  ctx.restore();
  
  // Прогресс-бар с улучшенным дизайном
  if (!isMaxLevel(level)) {
    const barX = panelX + 190;
    const barY = panelY + 120;
    const barWidth = 200;
    const barHeight = 20;
    const barRadius = 10;
    
    // Эффект тени для прогресс-бара
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    // Фон прогресс-бара с градиентом
    const barBgGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    barBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
    barBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    
    ctx.fillStyle = barBgGradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
    ctx.fill();
    ctx.restore();
    
    // Заполненная часть прогресс-бара
    const clampedProgress = Math.max(0, Math.min(progressPercent, 100));
    let progressWidth = Math.max(barHeight, barWidth * clampedProgress / 100); // Минимальная ширина = высота бара
    
    // Для очень маленьких значений делаем визуально заметный прогресс
    if (clampedProgress > 0 && progressWidth < barHeight * 2) {
      progressWidth = barHeight * 1.2; // Минимальная видимая ширина
    }
    
    // Создаем красивый градиент для прогресс-бара
    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, styles.primary);
    gradient.addColorStop(0.5, styles.accent);
    gradient.addColorStop(1, styles.secondary);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, progressWidth, barHeight, barRadius);
    ctx.fill();
    
    // Эффект блика на прогресс-баре для объемности
    const shineGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight/2);
    shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    shineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = shineGradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, progressWidth, barHeight/2, barRadius);
    ctx.fill();
    
    // Текст прогресса с тенью для лучшей читаемости
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.font = 'bold 18px Montserrat';
    ctx.fillStyle = styles.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${clampedProgress}%`, barX + barWidth / 2, barY - 5);
    ctx.restore();
  } else {
    // Максимальный уровень с визуальным выделением
    ctx.save();
    // Создаем пульсирующий эффект свечения для максимального уровня
    ctx.shadowColor = styles.accent;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Размещаем текст "МАКС. УРОВЕНЬ" по центру второй панели и справа от кружка
    const maxLevelTextX = panelX + (panelWidth - circleRadius * 2) - 10; // Смещаем вправо от середины панели
    const maxLevelTextY = panelY + 120;
    
    ctx.font = 'bold 22px Montserrat';
    ctx.fillStyle = styles.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('МАКС. УРОВЕНЬ', maxLevelTextX, maxLevelTextY);
    ctx.restore();
    
    // Добавляем декоративные звездочки или искры вокруг текста
    const sparklePoints = [
      {x: maxLevelTextX - 100, y: maxLevelTextY - 10},
      {x: maxLevelTextX + 100, y: maxLevelTextY - 10},
      {x: maxLevelTextX - 100, y: maxLevelTextY + 10},
      {x: maxLevelTextX + 100, y: maxLevelTextY + 10}
    ];
    
    sparklePoints.forEach(point => {
      drawSpark(ctx, point.x, point.y, 5, styles.accent);
    });
  }
}

/**
 * Рисует декоративную искру для максимального уровня
 */
function drawSpark(ctx: any, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  
  // Рисуем четырехконечную звезду
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size/4, y - size/4);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size/4, y + size/4);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size/4, y + size/4);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size/4, y - size/4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}