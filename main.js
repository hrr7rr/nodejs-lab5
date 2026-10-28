import http from 'node:http';
import fs from 'node:fs/promise';
import path from 'node:path';
import { once } from 'node:events';
import { Command } from 'commander';
import superagent from 'superagent';

const program = new Command();

program
       .requiredOption('-h, --host <address>', 'Адреса сервера')
       .requiredOption('-p, --port <number>', 'Порт сервера')
       .requiredOption('-c, --cache <path>', 'Тека кешу');

program.parse();

const options = program.opts();

const host = options.host;
const port = Number(options.port);
const cacheDir = path.resolve(options.cache);

if (!Number.isInteger(port) || port<1 || port>65535) {
   console.error('Неправильний порт');
   process.exit(1);
}

