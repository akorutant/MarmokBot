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
            if (interaction.replied || interaction.deferred) {
                logger.warn("CheckMoney: Interaction already replied or deferred");
                return next(); 
            }

            let bet: number;
            let targetUserId: string | undefined;
            
            await interaction.deferReply({ ephemeral: true });

            if (interaction instanceof CommandInteraction) {
                const betOption = interaction.options.get("bet");
                if (!betOption?.value) {
                    await interaction.editReply("❌ Укажите сумму ставки");
                    return;
                }
                bet = betOption.value as number;
            } else {
                const match = interaction.customId.match(/duel_(\d+)_(\d+)/);
                if (!match) {
                    await interaction.editReply("❌ Неверный формат дуэли");
                    return;
                }
                bet = parseInt(match[2]);
                targetUserId = match[1];
            }

            if (bet <= 0) {
                await interaction.editReply("❌ Неверная сумма ставки");
                return;
            }

            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOne({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            if (!user?.currency) {
                await interaction.editReply("❌ Ваш аккаунт не найден");
                return;
            }

            if (user.currency.currencyCount < BigInt(bet)) {
                await interaction.editReply("❌ Недостаточно средств");
                return;
            }

            if (targetUserId) {
                const targetUser = await userRepo.findOne({
                    where: { discordId: targetUserId },
                    relations: ["currency"]
                });

                if (!targetUser?.currency) {
                    await interaction.editReply("❌ Оппонент не найден");
                    return;
                }

                if (targetUser.currency.currencyCount < BigInt(bet)) {
                    await interaction.editReply("❌ У оппонента недостаточно средств");
                    return;
                }
            }
    
            
            await next();
        } catch (error) {
            logger.error("CheckMoney error:", error);
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply("❌ Ошибка проверки баланса");
                } else if (!interaction.replied) {
                    await interaction.reply({
                        content: "❌ Ошибка проверки баланса",
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                logger.error("Failed to send error response:", replyError);
            }
        }
    };
}