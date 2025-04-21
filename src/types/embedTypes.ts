export interface TopUser {
    user: { discordId: string };
    value: bigint | number | string;
  }
  
export interface TopEmbedOptions {
    title: string;
    description: string;
    icon?: string;
    color?: number;
    formatValue?: (value: TopUser["value"], index: number) => string;
  }