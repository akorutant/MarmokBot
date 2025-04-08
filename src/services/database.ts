import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../entities/User.js'; 
import { Exp } from '../entities/Exp.js';
import { Currency } from '../entities/Currency.js';

config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Exp, Currency],
  synchronize: true,
  logging: true,
  charset: 'utf8mb4',
  migrations: [],
  subscribers: [],
});
