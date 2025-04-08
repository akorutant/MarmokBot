import { Discord, SlashGroup, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User as DiscordUser, ApplicationCommandOptionType } from "discord.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import {
    createEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createCurrencyTopEmbed,
    createCurrencyBalanceEmbed
} from "../utils/embedBuilder.js";
import logger from "../services/logger.js";

@Discord()
@SlashGroup({ description: "Commands for managing user currency", name: "currency" })
@SlashGroup("currency")
class CurrencyCommands {
    @Slash({ description: "Set user currency to a specific value" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    @EnsureUser()
    async set(
        @SlashOption({
            description: "Выберите пользователя",
            name: "user",
            required: true,
            type: ApplicationCommandOptionType.User
        })
        discordUser: DiscordUser,
        @SlashOption({
            description: "Напишите кол-во валюты для установления пользователю",
            name: "amount",
            required: true,
            type: ApplicationCommandOptionType.Number
        })
        currencyAmount: number,
        interaction: CommandInteraction,
    ) {
        try {
            const userRepository = AppDataSource.getRepository(User);
            const currencyRepository = AppDataSource.getRepository(Currency);

            let user = await userRepository.findOne({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            if (user && user.currency) {
                user.currency.currencyCount = BigInt(currencyAmount);
                await currencyRepository.save(user.currency);
                logger.info(`Пользователю ${discordUser.id} установлено ${currencyAmount} валюты`);
            }

            const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> установлено валюты = ${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при установке валюты: %O", error);
        }
    }

    @Slash({ description: "Add currency to a user" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    @EnsureUser()
    async add(
        @SlashOption({
            description: "Выберите пользователя",
            name: "user",
            required: true,
            type: ApplicationCommandOptionType.User
        })
        discordUser: DiscordUser,
        @SlashOption({
            description: "Напишите кол-во валюты для добавления",
            name: "amount",
            required: true,
            type: ApplicationCommandOptionType.Number
        })
        currencyAmount: number,
        interaction: CommandInteraction,
    ) {
        try {
            const userRepository = AppDataSource.getRepository(User);
            const currencyRepository = AppDataSource.getRepository(Currency);

            let user = await userRepository.findOne({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            if (user && user.currency) {
                await currencyRepository.increment({ id: user.currency.id }, "currencyCount", currencyAmount);
                logger.info(`Пользователю ${discordUser.id} добавлено ${currencyAmount} валюты`);
            }

            const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено валюты: +${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при добавлении валюты: %O", error);
        }
    }

    @Slash({ description: "Remove currency from a user" })
    @RequireRoles(["high_mod_level", "medium_mod_level"])
    @EnsureUser()
    async remove(
        @SlashOption({
            description: "Выберите пользователя",
            name: "user",
            required: true,
            type: ApplicationCommandOptionType.User
        })
        discordUser: DiscordUser,
        @SlashOption({
            description: "Напишите кол-во валюты для вычитания",
            name: "amount",
            required: true,
            type: ApplicationCommandOptionType.Number
        })
        currencyAmount: number,
        interaction: CommandInteraction,
    ) {
        try {
            const userRepository = AppDataSource.getRepository(User);
            const currencyRepository = AppDataSource.getRepository(Currency);

            let user = await userRepository.findOne({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            if (user && user.currency) {
                await currencyRepository.increment({ id: user.currency.id }, "currencyCount", -currencyAmount);
                logger.info(`У пользователя ${discordUser.id} вычтено ${currencyAmount} валюты`);
            }

            const embed = createSuccessEmbed(`У пользователя <@${discordUser.id}> вычтено валюты: -${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при удалении валюты: %O", error);
        }
    }

    @Slash({ description: "Check user's currency balance" })
    @Guard(ChannelGuard("user_commands_channel"))
    @EnsureUser()
    async balance(
        @SlashOption({
            description: "Выберите пользователя (не указывайте, чтобы проверить свой баланс)",
            name: "user",
            required: false,
            type: ApplicationCommandOptionType.User
        })
        discordUser: DiscordUser | undefined,
        interaction: CommandInteraction,
    ) {
        try {
            const targetUser = discordUser || interaction.user;
            const userRepository = AppDataSource.getRepository(User);

            let user = await userRepository.findOne({
                where: { discordId: targetUser.id },
                relations: ["currency"]
            });

            if (user && user.currency) {
                const embed = createCurrencyBalanceEmbed(targetUser, user.currency.currencyCount, interaction.user);
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = createErrorEmbed(`Пользователь <@${targetUser.id}> не найден или у него нет валюты`, interaction.user);
                await interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при проверке баланса: %O", error);
        }
    }

    @Slash({ description: "Transfer currency to another user" })
    @Guard(ChannelGuard("user_commands_channel"))
    @EnsureUser()
    async transfer(
        @SlashOption({
            description: "Выберите пользователя, которому хотите перевести валюту",
            name: "user",
            required: true,
            type: ApplicationCommandOptionType.User
        })
        targetDiscordUser: DiscordUser,
        @SlashOption({
            description: "Напишите кол-во валюты для перевода",
            name: "amount",
            required: true,
            type: ApplicationCommandOptionType.Number
        })
        currencyAmount: number,
        interaction: CommandInteraction,
    ) {
        try {
            if (currencyAmount <= 0) {
                const embed = createErrorEmbed("Сумма перевода должна быть положительной!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (targetDiscordUser.id === interaction.user.id) {
                const embed = createErrorEmbed("Вы не можете перевести валюту самому себе!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const userRepository = AppDataSource.getRepository(User);
            const currencyRepository = AppDataSource.getRepository(Currency);

            let sourceUser = await userRepository.findOne({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            if (!sourceUser || !sourceUser.currency) {
                const embed = createErrorEmbed("У вас нет валюты для перевода!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (sourceUser.currency.currencyCount < BigInt(currencyAmount)) {
                const embed = createErrorEmbed("У вас недостаточно валюты для этого перевода!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            let targetUser = await userRepository.findOne({
                where: { discordId: targetDiscordUser.id },
                relations: ["currency"]
            });

            if (!targetUser) {
                targetUser = userRepository.create({
                    discordId: targetDiscordUser.id,
                    messageCount: 0n,
                    voiceMinutes: 0n
                });
                await userRepository.save(targetUser);

                targetUser = await userRepository.findOne({
                    where: { discordId: targetDiscordUser.id },
                    relations: ["currency"]
                });
            }
            if (targetUser) {
                if (!targetUser.currency) {
                    const newCurrency = currencyRepository.create({
                        currencyCount: 0n,
                        user: targetUser
                    });
                    await currencyRepository.save(newCurrency);

                    targetUser = await userRepository.findOne({
                        where: { discordId: targetDiscordUser.id },
                        relations: ["currency"]
                    });
                }
            } else {
                const embed = createErrorEmbed("Не удалось найти или создать пользователя!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            await AppDataSource.transaction(async (transactionalEntityManager) => {
                await transactionalEntityManager.decrement(
                    Currency,
                    { id: sourceUser.currency.id },
                    "currencyCount",
                    currencyAmount
                );

                await transactionalEntityManager.increment(
                    Currency,
                    { id: targetUser?.currency.id },
                    "currencyCount",
                    currencyAmount
                );
            });

            const embed = createSuccessEmbed(`Вы успешно перевели ${currencyAmount} валюты пользователю <@${targetDiscordUser.id}>!`, interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.info(`Пользователь ${interaction.user.id} перевел ${currencyAmount} валюты пользователю ${targetDiscordUser.id}`);
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при переводе валюты: %O", error);
        }
    }

    @Slash({ description: "Show top users by currency amount" })
    @Guard(ChannelGuard("user_commands_channel"))
    async top(
        @SlashOption({
            description: "Количество пользователей для отображения",
            name: "limit",
            required: false,
            type: ApplicationCommandOptionType.Number
        })
        limit: number = 10,
        interaction: CommandInteraction,
    ) {
        try {
            if (limit <= 0 || limit > 25) {
                limit = 10;
            }

            const currencyRepository = AppDataSource.getRepository(Currency);

            const topUsers = await currencyRepository
                .createQueryBuilder("currency")
                .leftJoinAndSelect("currency.user", "user")
                .orderBy("currency.currencyCount", "DESC")
                .take(limit)
                .getMany();

            if (topUsers.length === 0) {
                const embed = createErrorEmbed("На сервере пока нет пользователей с валютой!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const embed = createCurrencyTopEmbed(topUsers, limit, interaction.user, interaction.guild);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при получении топа пользователей по валюте: %O", error);
        }
    }
}

export default CurrencyCommands;