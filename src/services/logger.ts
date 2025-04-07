import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import "dotenv/config";
// import axios from "axios";

const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

const logger = createLogger({
  level: "info",
  format: logFormat,
  defaultMeta: { service: "MarmokBot" },
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    }),

    new DailyRotateFile({
      dirname: "logs/info",
      filename: "info-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "info",
      maxFiles: "7d",
      zippedArchive: true
    }),

    new DailyRotateFile({
      dirname: "logs/warn",
      filename: "warn-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "warn",
      maxFiles: "7d",
      zippedArchive: true
    }),

    new DailyRotateFile({
      dirname: "logs/error",
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "7d",
      zippedArchive: true
    })
  ]
});

// Отправка алертов в Discord при критических ошибках
// const criticalWebhook = process.env.CRITICAL_WEBHOOK_URL;
// logger.on("data", (log) => {
//   if (log.level === "error" || log.level === "warn") {
//     if (criticalWebhook) {
//       // Включить axios для отправки сообщений
//       axios.post(criticalWebhook, {
//         content: `🚨 **[${log.level.toUpperCase()}]** ${log.message}`,
//         embeds: [
//           {
//             description: "```json\n" + JSON.stringify(log, null, 2) + "\n```",
//             color: log.level === "error" ? 0xff0000 : 0xffa500
//           }
//         ]
//       }).catch((err) => {
//         console.error("Ошибка отправки алерта в Discord:", err);
//       });
//     }
//   }
// });

export default logger;
