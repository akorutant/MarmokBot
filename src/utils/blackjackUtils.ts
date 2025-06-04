import { EmbedBuilder, User } from "discord.js";
import { AppDataSource } from "../services/database.js";
import { User as DBUser } from "../entities/User.js"; 
import { Currency } from "../entities/Currency.js";

export type Card = {
    suit: string;
    rank: string;
    value: number;
};

export type GameState = {
    playerCards: Card[];
    dealerCards: Card[];
    bet: number;
    playerTurn: boolean;
    deck: Card[];
};

export class BlackjackGame {
    private readonly suits = ["♥", "♦", "♣", "♠"];
    private readonly ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    public readonly TAX_RATE = 0.07;

    createDeck(): Card[] {
        const deck: Card[] = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                let value = parseInt(rank);
                if (isNaN(value)) {
                    value = rank === "A" ? 11 : 10;
                }
                deck.push({ suit, rank, value });
            }
        }
        return this.shuffleDeck([...deck]);
    }

    private shuffleDeck(deck: Card[]): Card[] {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    calculateHand(hand: Card[]): number {
        let total = hand.reduce((sum, card) => sum + card.value, 0);
        hand.filter(card => card.rank === "A").forEach(() => {
            if (total > 21) total -= 10;
        });
        return total;
    }

    createGameEmbed(state: GameState, user: User, gameOver = false): EmbedBuilder {
        const playerTotal = this.calculateHand(state.playerCards);
        const dealerTotal = this.calculateHand(state.dealerCards);

        const embed = new EmbedBuilder()
            .setTitle(`🎰 Blackjack - Ставка: ${state.bet}$`)
            .setColor("#0099ff")
            .setFooter({ text: `Игрок: ${user.username}`, iconURL: user.displayAvatarURL() })
            .setTimestamp();

        if (!gameOver) {
            embed.addFields({
                name: "Дилер",
                value: `${state.dealerCards[0].rank}${state.dealerCards[0].suit} и ❓\n(Очки: ${state.dealerCards[0].value}+?)`,
                inline: true
            });
        } else {
            embed.addFields({
                name: "Дилер",
                value: state.dealerCards.map(c => `${c.rank}${c.suit}`).join(", ") +
                    `\n(Очки: ${dealerTotal})`,
                inline: true
            });
        }

        embed.addFields({
            name: "Игрок",
            value: state.playerCards.map(c => `${c.rank}${c.suit}`).join(", ") +
                `\n(Очки: ${playerTotal})`,
            inline: true
        });

        if (gameOver) {
            if (playerTotal > 21) {
                embed.setDescription("**Перебор! Вы проиграли.**");
            } else if (dealerTotal > 21) {
                const winAmount = this.calculateWinAmount(state.bet, true);
                embed.setDescription(`**Дилер перебрал! Вы выиграли ${winAmount.net}$ (налог ${winAmount.tax}$)!**`);
            } else if (playerTotal > dealerTotal) {
                const winAmount = this.calculateWinAmount(state.bet, true);
                embed.setDescription(`**Вы выиграли ${winAmount.net}$ (налог ${winAmount.tax}$)!**`);
            } else if (playerTotal < dealerTotal) {
                embed.setDescription("**Вы проиграли.**");
            } else {
                embed.setDescription(`**Ничья! Возврат ставки ${state.bet}$.**`);
            }
        }

        return embed;
    }

    async dealerTurn(state: GameState, user: User): Promise<{ embed: EmbedBuilder; winAmount?: { gross: number; net: number; tax: number } }> {
        state.playerTurn = false;

        while (this.calculateHand(state.dealerCards) < 17) {
            state.dealerCards.push(state.deck.pop()!);
        }

        const playerTotal = this.calculateHand(state.playerCards);
        const dealerTotal = this.calculateHand(state.dealerCards);

        let result;
        if (playerTotal > 21) {
            result = { embed: this.createGameEmbed(state, user, true) };
        } else if (dealerTotal > 21) {
            const winAmount = this.calculateWinAmount(state.bet, true);
            result = { embed: this.createGameEmbed(state, user, true), winAmount };
        } else if (playerTotal > dealerTotal) {
            const winAmount = this.calculateWinAmount(state.bet, true);
            result = { embed: this.createGameEmbed(state, user, true), winAmount };
        } else if (playerTotal < dealerTotal) {
            result = { embed: this.createGameEmbed(state, user, true) };
        } else {
            const winAmount = this.calculateWinAmount(state.bet, false);
            result = { embed: this.createGameEmbed(state, user, true), winAmount };
        }

        return result;
    }

    calculateWinAmount(bet: number, isWin: boolean): { gross: number; net: number; tax: number } {
        if (!isWin) {
            return { gross: bet, net: bet, tax: 0 };
        }

        const gross = bet * 2;
        const tax = Math.floor(gross * this.TAX_RATE);
        const net = gross - tax;

        return { gross, net, tax };
    }

    async processGameResult(
        state: GameState,
        userId: string,
        isSurrender = false
    ): Promise<{ winAmount: number; result: string }> {
        const playerTotal = this.calculateHand(state.playerCards);
        const dealerTotal = this.calculateHand(state.dealerCards);

        let winAmount = 0;
        let result = "";

        if (isSurrender) {
            winAmount = Math.floor(state.bet / 2);
            result = "surrender";
        } else if (playerTotal > 21) {
            result = "bust";
        } else if (dealerTotal > 21) {
            const amount = this.calculateWinAmount(state.bet, true);
            winAmount = amount.net;
            result = "win";
        } else if (playerTotal > dealerTotal) {
            const amount = this.calculateWinAmount(state.bet, true);
            winAmount = amount.net;
            result = "win";
        } else if (playerTotal < dealerTotal) {
            result = "lose";
        } else {
            winAmount = state.bet;
            result = "push";
        }

        if (winAmount > 0) {
            const currencyRepository = AppDataSource.getRepository(Currency);
            const dbUser = await AppDataSource.getRepository(DBUser).findOneOrFail({
                where: { discordId: userId },
                relations: ["currency"]
            });

            await currencyRepository.update(
                { id: dbUser.currency.id },
                { currencyCount: dbUser.currency.currencyCount + BigInt(winAmount) }
            );
        }

        return { winAmount, result };
    }
}