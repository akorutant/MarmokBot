import { ButtonInteraction, CommandInteraction } from "discord.js";
import { GuardFunction } from "discordx";
import { AppDataSource } from "../../services/database.js";
import { User } from "../../entities/User.js";
import logger from "../../services/logger.js";

interface DuelData {
    bet: number;
    creatorId: string;
}

export function CheckMoney(): GuardFunction<CommandInteraction | ButtonInteraction> {
    return async (interaction, _, next) => {
        try {
            let bet: number;
            let targetUserId: string | undefined;

            if (interaction instanceof CommandInteraction) {
                // Для команды - берем ставку из опций
                const betOption = interaction.options.get("bet");
                if (!betOption?.value) {
                    await interaction.reply({
                        content: "❌ Укажите сумму ставки",
                        ephemeral: true
                    });
                    return;
                }
                bet = betOption.value as number;
            } else {
                // Для кнопки - парсим данные из customId
                const match = interaction.customId.match(/duel_(\d+)_(\d+)/);
                if (!match) {
                    await interaction.reply({
                        content: "❌ Неверный формат дуэли",
                        ephemeral: true
                    });
                    return;
                }
                bet = parseInt(match[2]);
                targetUserId = match[1];
            }

            if (bet <= 0) {
                await interaction.reply({
                    content: "❌ Неверная сумма ставки",
                    ephemeral: true
                });
                return;
            }

            // Проверяем баланс текущего пользователя
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            if (!user?.currency) {
                await interaction.reply({
                    content: "❌ Ваш аккаунт не найден",
                    ephemeral: true
                });
                return;
            }

            if (user.currency.currencyCount < BigInt(bet)) {
                await interaction.reply({
                    content: "❌ Недостаточно средств",
                    ephemeral: true
                });
                return;
            }

            // Если есть оппонент (для кнопки) - проверяем его баланс
            if (targetUserId) {
                const targetUser = await userRepo.findOne({
                    where: { discordId: targetUserId },
                    relations: ["currency"]
                });

                if (!targetUser?.currency) {
                    await interaction.reply({
                        content: "❌ Оппонент не найден",
                        ephemeral: true
                    });
                    return;
                }

                if (targetUser.currency.currencyCount < BigInt(bet)) {
                    await interaction.reply({
                        content: "❌ У оппонента недостаточно средств",
                        ephemeral: true
                    });
                    return;
                }
            }

            await next();
        } catch (error) {
            logger.error("CheckMoney error:", error);
            await interaction.reply({
                content: "❌ Ошибка проверки баланса",
                ephemeral: true
            });
        }
    };
}