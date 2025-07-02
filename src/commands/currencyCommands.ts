import { 
    Discord, 
    Slash, 
    SlashOption, 
    Guard, 
    SlashGroup
} from "discordx";
import { 
    CommandInteraction, 
    ApplicationCommandOptionType, 
    User as DiscordUser,
    TextChannel as DiscordTextChannel
} from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User } from "../entities/User.js";
import { Currency } from "../entities/Currency.js";
import { Config } from "../entities/Config.js";
import { 
    createCurrencyBalanceEmbed,
    createErrorEmbed, 
    createSuccessEmbed, 
    createTransferNotificationEmbed 
} from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { RequireRoles } from "../utils/decorators/RequireRoles.js";

@Discord()
class TransferCommand {
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
            const configRepository = AppDataSource.getRepository(Config);

            const sourceUser = await userRepository.findOneOrFail({
                where: { discordId: interaction.user.id },
                relations: ["currency"]
            });

            const commission = Math.ceil(currencyAmount * 0.07);
            const totalAmount = currencyAmount + commission;
            
            if (sourceUser.currency.currencyCount < BigInt(totalAmount)) {
                const embed = createErrorEmbed(
                    `У вас недостаточно валюты для этого перевода! ` +
                    `Необходимо: ${currencyAmount} + ${commission} (комиссия 7%) = ${totalAmount}`,
                    interaction.user
                );
                await interaction.reply({ embeds: [embed] });
                return;
            }

            const targetUser = await userRepository.findOneOrFail({
                where: { discordId: targetDiscordUser.id },
                relations: ["currency"]
            });

            await AppDataSource.transaction(async (manager) => {
                await manager.decrement(
                    Currency,
                    { id: sourceUser.currency.id },
                    "currencyCount",
                    totalAmount
                );

                await manager.increment(
                    Currency,
                    { id: targetUser.currency.id },
                    "currencyCount",
                    currencyAmount
                );
            });

            const senderEmbed = createSuccessEmbed(
                `Вы успешно перевели ${currencyAmount} валюты пользователю <@${targetDiscordUser.id}>!
` +
                `Комиссия составила ${commission} (7%).
` +
                `Общая сумма списания: ${totalAmount}`,
                interaction.user
            );
            
            await interaction.reply({ embeds: [senderEmbed] });
            
            const receiverEmbed = createTransferNotificationEmbed(
                interaction.user,
                targetDiscordUser,
                currencyAmount
            );
            
            try {
                const dm = await targetDiscordUser.createDM();
                await dm.send({ embeds: [receiverEmbed] });
                logger.info(`Уведомление о переводе отправлено в ЛС ${targetDiscordUser.id}`);
            } catch {
                logger.warn(`Не удалось отправить ЛС пользователю ${targetDiscordUser.id}`);
                const commandsConfig = await configRepository.findOne({ where: { key: "user_commands_channel" } });
                if (commandsConfig?.value) {
                    const ch = interaction.client.channels.cache.get(commandsConfig.value) as DiscordTextChannel;
                    if (ch) await ch.send({ content: `<@${targetDiscordUser.id}>`, embeds: [receiverEmbed] });
                }
            }

            logger.info(`Пользователь ${interaction.user.id} перевел ${currencyAmount} валюты пользователю ${targetDiscordUser.id}`);
        } catch (error) {
            const embed = createErrorEmbed("Ошибка! За подробностями обратитесь к разработчикам.", interaction.user);
            await interaction.reply({ embeds: [embed] });
            logger.error("Ошибка при переводе валюты:", error);
        }
    }
}


@Discord()
export class BalanceCommand {
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
        // Создаем timeout protection
        const timeout = createInteractionTimeout(interaction);
        
        try {
            // Проверяем, можем ли мы отвечать на interaction
            if (!canRespond(interaction)) {
                logger.warn("Balance command: Cannot respond to interaction");
                clearTimeout(timeout);
                return;
            }

            const targetUser = discordUser || interaction.user;
            const userRepository = AppDataSource.getRepository(User);

            const user = await userRepository.findOneOrFail({
                where: { discordId: targetUser.id },
                relations: ["currency"]
            });

            const embed = createCurrencyBalanceEmbed(targetUser, user.currency.currencyCount, interaction.user);
            
            // Очищаем timeout перед успешным ответом
            clearTimeout(timeout);
            
            await safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            clearTimeout(timeout);
            logger.error("Ошибка при проверке баланса:", error);
            
            // Используем безопасную отправку ошибки
            await safeErrorReply(
                interaction, 
                "Ошибка! За подробностями обратитесь к разработчикам."
            );
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
}

export default { CurrencyCommands, BalanceCommand, TransferCommand};