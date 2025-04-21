import { Discord, SlashGroup, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction, User as DiscordUser, ApplicationCommandOptionType } from "discord.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import {
    createErrorEmbed,
    createSuccessEmbed,
    createCurrencyTopEmbed,
    createCurrencyBalanceEmbed
} from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";


@Discord()
export class TransferCommand {
    @Slash({ 
        description: "Перевести валюту другому пользователю",
        name: "transfer"
    })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
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

            const sourceUser = await userRepository.findOneOrFail({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            if (sourceUser.currency.currencyCount < BigInt(currencyAmount)) {
                const embed = createErrorEmbed("У вас недостаточно валюты для этого перевода!", interaction.user);
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const targetUser = await userRepository.findOneOrFail({
                where: { discordId: targetDiscordUser.id },
                relations: ["currency"]
            });

            await AppDataSource.transaction(async (transactionalEntityManager) => {
                await transactionalEntityManager.decrement(
                    Currency,
                    { id: sourceUser.currency.id },
                    "currencyCount",
                    currencyAmount
                );

                await transactionalEntityManager.increment(
                    Currency,
                    { id: targetUser.currency.id },
                    "currencyCount",
                    currencyAmount
                );
            });

            const embed = createSuccessEmbed(
                `Вы успешно перевели ${currencyAmount} валюты пользователю <@${targetDiscordUser.id}>!`, 
                interaction.user
            );
            await interaction.reply({ embeds: [embed] });
            logger.info(`Пользователь ${interaction.user.id} перевел ${currencyAmount} валюты пользователю ${targetDiscordUser.id}`);
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при переводе валюты: %O", error);
        }
    }
}

@Discord()
class BalanceCommand {
    @Slash({ description: "Посмотреть баланс пользователя" })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard(),
    )
    async balance(
        @SlashOption({
            description: "Выберите пользователя",
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

            const user = await userRepository.findOneOrFail({
                where: { discordId: targetUser.id },
                relations: ["currency"]
            });

            const embed = createCurrencyBalanceEmbed(targetUser, user.currency.currencyCount, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при проверке баланса: %O", error);
        }
    }
}

@Discord()
@SlashGroup({ 
    description: "Команды для изменения баланса пользователя", 
    name: "currency",
    defaultMemberPermissions: "0", 
    dmPermission: false, 
})
@SlashGroup("currency")
class CurrencyCommands {
    @Slash({ description: "Установить пользователю кол-во валюты" })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
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

            const user = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            user.currency.currencyCount = BigInt(currencyAmount);
            await currencyRepository.save(user.currency);
            logger.info(`Пользователю ${discordUser.id} установлено ${currencyAmount} валюты`);

            const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> установлено валюты = ${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при установке валюты: %O", error);
        }
    }

    @Slash({ description: "Добавить пользователю кол-во валюты" })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
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

            const user = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            await currencyRepository.increment({ id: user.currency.id }, "currencyCount", currencyAmount);
            logger.info(`Пользователю ${discordUser.id} добавлено ${currencyAmount} валюты`);

            const embed = createSuccessEmbed(`Пользователю <@${discordUser.id}> добавлено валюты: +${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при добавлении валюты: %O", error);
        }
    }

    @Slash({ description: "Снять валюту у пользователя" })
    @EnsureUser()
    @Guard(
        EnsureUserGuard(),
        RequireRoles(["high_mod_level", "medium_mod_level"])
    )
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

            const user = await userRepository.findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            await currencyRepository.increment({ id: user.currency.id }, "currencyCount", -currencyAmount);
            logger.info(`У пользователя ${discordUser.id} вычтено ${currencyAmount} валюты`);

            const embed = createSuccessEmbed(`У пользователя <@${discordUser.id}> вычтено валюты: -${currencyAmount}`, interaction.user);
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при удалении валюты: %O", error);
        }
    }

    @Slash({ description: "Показать топ юзеров по количеству валюты" })
    @Guard(
        ChannelGuard("user_commands_channel"),
        EnsureUserGuard()
    )
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

export default { CurrencyCommands, BalanceCommand };