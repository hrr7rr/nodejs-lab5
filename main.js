import http from 'node:http';
import fs from 'node:fs/promises';
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

function sendText(res, status, message) {
   res.writeHead(status, {
     'Content-Type' : 'text/plain; charset=utf-8'
   });
   res.end(message);
}

// Отримання HTTP-код із шляху запиту
function getCode(url) {
   const match = /^\/([1-5][0-9]{2})$/.exec(url);

   return match ? match[1] : null;
}

// Надсилання картинки клієнту
function sendImage(res, image, source) {
   res.writeHead(200, {
     'Content-Type': 'image/jpeg',
     'X-Cache': source
   });

   res.end(image);
}

// Обробка GET-запит
async function handleGet(res, code, filePath) {
   let image;

// Спочатку пошук картинки в кеші
   try {
        image = await fs.readFile(filePath);

        return sendImage(res, image, 'HIT');

   } catch (error) {
      if (error.code !== 'ENOENT') {
         throw error;
      }
   }

// Якщо картинки немає в кеші, треба завантажити її
   try {
        const response = await superagent
               .get(`https://http.cat/${code}`)
               .buffer(true)
               .parse(superagent.parse.image)
               .timeout(10000);

       image = response.body;

       if (!Buffer.isBuffer(image)) {
          throw new Error('Не отримано двійкові дані');
       }

       await fs.writeFile(filePath, image);

       return sendImage(res, image, 'MISS');

   } catch (error) {
       console.error('Помилка GET:', error.message);

       return sendText(res, 404, 'Картинку не знайдено або не вдалося завантажити');
   }
}

// Читання тіла HTTP-запиту
async function readBody(req) {
   const chunks = [];

   for await (const chunk of req) {
      chunks.push(chunk);
   }

   return Buffer.concat(chunks);
}

// PUT запит
async function handlePut (req, res, filePath) {

   if (req.headers['content-type'] !== 'image/jpeg') {
      return sendText(res, 415, 'Потрібен Content-Type: image/jpeg');
   }

// Читання дані картинки із запиту
   const image = await readBody(req);


   if (image.length === 0 ) {
      return sendText(res, 400, 'Порожнє тіло запиту');
   }

//Зберігання картинки в кеші
   await fs.writeFile(filePath, image);

   return sendText(res, 201, 'Картинку збережено');
}


const server = http.createServer(async(req, res) => {
   try{
       if (!['GET', 'PUT'].includes(req.method)) {
          res.setHeader('Allow', 'GET', 'PUT');
          return sendText(res, 405, 'Метод не дозволено');
       }

//Отримання коду з URL
       const code = getCode(req.url);

       if(!code) {
         return sendText(res, 404, 'Неправильний шлях');
       }
//Формується шлях до картинки в кеші
       const filePath = path.join(cacheDir, `${code}.jpg`);

       if(req.method === 'GET') {
          return await handleGet(res, code, filePath);
       }

       if (req.method === 'PUT') {
          return await handlePut(req, res, filePath);
       }

   } catch (error) {
       console.error('Помилка:', error.message);

       if(!res.headersSent) {
           sendText(res, 500, 'Внутрішня помилка сервера');
       } else {
           res.destroy();
       }
   }
});

async function main() {
   try {
       await fs.mkdir(cacheDir, {recursive:true});

       server.listen(port, host);
       await once(server, 'listening');

       console.log(`Сервер працює : http://${host}:${port}`);
  } catch (err) {
       console.error('Помилка запуску:', err.message);
       process.exitCode = 1;
  }
}

main();
