import { Discord, Slash, SlashOption, Guard, ButtonComponent, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, Message, ButtonBuilder, ActionRowBuilder, ButtonStyle } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js";
import { ChannelGuard } from "../utils/decorators/ChannelGuard.js";
import { EnsureUser } from "../utils/decorators/EnsureUsers.js";
import { createErrorEmbed, createCasinoResultEmbed } from "../utils/embedBuilder.js";
import logger from "../services/logger.js";
import { Currency } from "../entities/Currency.js";
import { Cooldown } from "../utils/decorators/CoommandCooldown.js";
import { determineCasinoResult } from "../utils/casinoUtils.js";
import { CheckMoney } from "../utils/decorators/CheckMoney.js";
import { EnsureUserGuard } from "../utils/decorators/EnsureUserGuard.js";
import { BlackjackGame, GameState } from "../utils/blackjackUtils.js";

@Discord()
@SlashGroup({
    description: "Команды для игры в казино",
    name: "casino",
    dmPermission: false,
})
@SlashGroup("casino")
class CasinoCommands {
    private static TAX_RATE: number;

    @Slash({
        name: "random",
        description: "Проверьте свою удачу в казино"
    })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        EnsureUserGuard(),
        Cooldown({ minutes: 1 })
    )
    async random(
        @SlashOption({
            name: "bet",
            description: "Размер ставки (от 1000 до 10000)",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 1000,
            maxValue: 10000
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            if (!interaction || !interaction.user) {
                logger.error("Casino random: Invalid interaction");
                return;
            }

            if (isNaN(bet) || bet === null || bet === undefined) {
                logger.error("Casino random: Invalid bet value", bet);

                if (!interaction.replied && !interaction.deferred) {
                    const errorEmbed = createErrorEmbed("❌ Некорректная ставка", interaction.user);
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                return;
            }

            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply();
            }

            const discordUser = interaction.user;

            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: discordUser.id },
                relations: ["currency"]
            });

            const currencyRepository = AppDataSource.getRepository(Currency);

            if (dbUser.currency.currencyCount < BigInt(bet)) {
                const errorEmbed = createErrorEmbed(
                    `У вас недостаточно средств! Необходимо ${bet}$, у вас ${dbUser.currency.currencyCount}$`,
                    interaction.user
                );

                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
                return;
            }

            await AppDataSource.transaction(async (transactionalEntityManager) => {
                const newBalance = dbUser.currency.currencyCount - BigInt(bet);
                await transactionalEntityManager.update(Currency,
                    { id: dbUser.currency.id },
                    { currencyCount: newBalance }
                );

                const result = determineCasinoResult();
                const winAmount = Math.floor(bet * result.multiplier);
                let tax = 0;
                let netWin = winAmount;

                if (winAmount > 0) {
                    tax = Math.floor(winAmount * (CasinoCommands.TAX_RATE || 0.1));
                    netWin = winAmount - tax;

                    await transactionalEntityManager.update(Currency,
                        { id: dbUser.currency.id },
                        { currencyCount: newBalance + BigInt(netWin) }
                    );
                }

                const embed = createCasinoResultEmbed(
                    bet,
                    netWin,
                    result,
                    interaction
                );

                logger.info(
                    `Пользователь ${discordUser.id} сделал ставку ${bet}$ ` +
                    `в казино и ${winAmount > 0 ? `выиграл ${netWin}$ (налог ${tax}$)` : 'проиграл'}`
                );

                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed] });
                }
            });

        } catch (error) {
            logger.error("Ошибка в команде казино:", error);

            try {
                const errorEmbed = createErrorEmbed("Произошла ошибка при обработке ставки", interaction.user);

                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (responseError) {
                logger.error("Failed to send error response in casino command:", responseError);
            }
        }
    }

    private static activeGames = new Map<string, GameState & { message?: Message }>();

    private static game = new BlackjackGame();

    @Slash({ name: "blackjack", description: "Игра в 21 (Blackjack)" })
    @EnsureUser()
    @Guard(
        ChannelGuard("user_commands_channel"),
        CheckMoney(),
        EnsureUserGuard(),
        Cooldown({ minutes: 1 })
    )
    async blackjack(
        @SlashOption({
            name: "bet",
            description: "Размер ставки (от 500 до 5000)",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            minValue: 500,
            maxValue: 5000
        })
        bet: number,
        interaction: CommandInteraction
    ) {
        try {
            await interaction.deferReply();
            const userId = interaction.user.id;

            if (CasinoCommands.activeGames.has(userId)) {
                await interaction.editReply({
                    embeds: [createErrorEmbed(
                        "У вас уже есть активная игра! Завершите текущую игру перед началом новой.",
                        interaction.user
                    )]
                });
                return;
            }

            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: userId },
                relations: ["currency"]
            });

            const currencyRepository = AppDataSource.getRepository(Currency);
            await currencyRepository.update(
                { id: dbUser.currency.id },
                { currencyCount: dbUser.currency.currencyCount - BigInt(bet) }
            );

            const deck = CasinoCommands.game.createDeck();
            const gameState: GameState & { message?: Message } = {
                playerCards: [deck.pop()!, deck.pop()!],
                dealerCards: [deck.pop()!, deck.pop()!],
                bet,
                playerTurn: true,
                deck
            };

            const embed = CasinoCommands.game.createGameEmbed(gameState, interaction.user);
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("hit")
                    .setLabel("Взять карту")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("stand")
                    .setLabel("Остановиться")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("double")
                    .setLabel("Удвоить")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("surrender")
                    .setLabel("Сдаться")
                    .setStyle(ButtonStyle.Danger)
            ) as ActionRowBuilder<ButtonBuilder>;

            const message = await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            }) as Message;

            gameState.message = message;
            CasinoCommands.activeGames.set(userId, gameState);

            logger.info(`Blackjack: Игра начата для ${userId}, ставка ${bet}$`);

        } catch (error) {
            logger.error("Ошибка в команде Blackjack:", error);
            await interaction.editReply({
                embeds: [createErrorEmbed("Произошла ошибка при запуске игры", interaction.user)]
            });
        }
    }

    @ButtonComponent({ id: "hit" })
    async hitButton(interaction: any) {
        try {
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const gameState = CasinoCommands.activeGames.get(userId);

            if (!gameState || !gameState.playerTurn) {
                await interaction.followUp({
                    content: "У вас нет активной игры или сейчас не ваш ход!",
                    ephemeral: true
                });
                return;
            }

            gameState.playerCards.push(gameState.deck.pop()!);

            if (CasinoCommands.game.calculateHand(gameState.playerCards) > 21) {
                const { embed } = await CasinoCommands.game.dealerTurn(gameState, interaction.user);
                const result = await CasinoCommands.game.processGameResult(gameState, userId);

                await gameState.message?.edit({
                    embeds: [embed],
                    components: []
                });

                logger.info(
                    `Blackjack: Игрок ${userId} перебрал, ставка ${gameState.bet}$` +
                    (result.winAmount > 0 ? `, выигрыш ${result.winAmount}$` : "")
                );

                CasinoCommands.activeGames.delete(userId);
                return;
            }

            const embed = CasinoCommands.game.createGameEmbed(gameState, interaction.user);
            await gameState.message?.edit({ embeds: [embed] });

        } catch (error) {
            logger.error("Ошибка в обработке кнопки HIT:", error);
        }
    }

    @ButtonComponent({ id: "stand" })
    async standButton(interaction: any) {
        try {
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const gameState = CasinoCommands.activeGames.get(userId);

            if (!gameState || !gameState.playerTurn) {
                await interaction.followUp({
                    content: "У вас нет активной игры или сейчас не ваш ход!",
                    ephemeral: true
                });
                return;
            }

            const { embed } = await CasinoCommands.game.dealerTurn(gameState, interaction.user);
            const result = await CasinoCommands.game.processGameResult(gameState, userId);

            await gameState.message?.edit({
                embeds: [embed],
                components: []
            });

            logger.info(
                `Blackjack: Игрок ${userId} завершил игру, ставка ${gameState.bet}$` +
                (result.winAmount > 0 ? `, выигрыш ${result.winAmount}$` : "") +
                `, результат: ${result.result}`
            );

            CasinoCommands.activeGames.delete(userId);

        } catch (error) {
            logger.error("Ошибка в обработке кнопки STAND:", error);
        }
    }

    @ButtonComponent({ id: "double" })
    async doubleButton(interaction: any) {
        try {
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const gameState = CasinoCommands.activeGames.get(userId);

            if (!gameState || !gameState.playerTurn) {
                await interaction.followUp({
                    content: "У вас нет активной игры или сейчас не ваш ход!",
                    ephemeral: true
                });
                return;
            }

            if (gameState.playerCards.length !== 2) {
                await interaction.followUp({
                    content: "Удвоение возможно только при первых двух картах!",
                    ephemeral: true
                });
                return;
            }

            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: userId },
                relations: ["currency"]
            });

            if (dbUser.currency.currencyCount < BigInt(gameState.bet)) {
                await interaction.followUp({
                    content: `У вас недостаточно средств для удвоения! Нужно еще ${gameState.bet}$`,
                    ephemeral: true
                });
                return;
            }

            const currencyRepository = AppDataSource.getRepository(Currency);
            await currencyRepository.update(
                { id: dbUser.currency.id },
                { currencyCount: dbUser.currency.currencyCount - BigInt(gameState.bet) }
            );

            gameState.bet *= 2;

            gameState.playerCards.push(gameState.deck.pop()!);

            const { embed } = await CasinoCommands.game.dealerTurn(gameState, interaction.user);
            const result = await CasinoCommands.game.processGameResult(gameState, userId);

            await gameState.message?.edit({
                embeds: [embed],
                components: []
            });

            logger.info(
                `Blackjack: Игрок ${userId} удвоил ставку до ${gameState.bet}$` +
                (result.winAmount > 0 ? `, выигрыш ${result.winAmount}$` : "") +
                `, результат: ${result.result}`
            );

            CasinoCommands.activeGames.delete(userId);

        } catch (error) {
            logger.error("Ошибка в обработке кнопки DOUBLE:", error);
        }
    }

    @ButtonComponent({ id: "surrender" })
    async surrenderButton(interaction: any) {
        try {
            await interaction.deferUpdate();
            const userId = interaction.user.id;
            const gameState = CasinoCommands.activeGames.get(userId);

            if (!gameState || !gameState.playerTurn) {
                await interaction.followUp({
                    content: "У вас нет активной игры или сейчас не ваш ход!",
                    ephemeral: true
                });
                return;
            }

            const { winAmount } = await CasinoCommands.game.processGameResult(gameState, userId, true);
            const embed = CasinoCommands.game.createGameEmbed(gameState, interaction.user, true);
            embed.setDescription(`**Вы сдались! Возвращено ${winAmount}$.**`);

            await gameState.message?.edit({
                embeds: [embed],
                components: []
            });

            logger.info(
                `Blackjack: Игрок ${userId} сдался, возвращено ${winAmount}$ из ставки ${gameState.bet}$`
            );

            CasinoCommands.activeGames.delete(userId);

        } catch (error) {
            logger.error("Ошибка в обработке кнопки SURRENDER:", error);
        }
    }
}

export default CasinoCommands;
