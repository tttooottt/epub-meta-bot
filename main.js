import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { unlink, readdir } from 'fs/promises';
import path from 'path';
import axios from 'axios';
import EPub from 'epub';
import { MongoClient, ServerApiVersion } from "mongodb";

const mg = new MongoClient(process.env.MG_CONNECTION_STRING,  {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const dir = "epubs";
if (!existsSync(dir)) {
	mkdirSync(dir);
}
for (const file of await readdir(dir)) {
    await unlink(path.join(dir, file));
}

const bot = new Telegraf(process.env.TG_BOT_TOKEN);

bot.use(Telegraf.log());

bot.command('start', ctx => {
    ctx.reply('Send file');
});


bot.on('message', async ctx => {
    const type = ctx.message.document?.mime_type;
    if (type === undefined) {
        ctx.reply('Send file');
        return;
    }
    if (type !== 'application/epub+zip') {
        ctx.reply(`I don't want your ${type}`);
        return;
    }
    if (ctx.message.document?.file_size >= 10e6) {
        ctx.reply('Too big');
        return;
    }

    const fileUId = ctx.message?.document.file_unique_id;

    const coll = mg.db("epub-meta-bot").collection("epubs");
    const existingEpub = await coll.findOne({_id: fileUId});
    if (existingEpub !== null) {
        delete existingEpub._id;
        ctx.reply(JSON.stringify(existingEpub));
        return;
    }

    const file = await ctx.telegram.getFileLink(ctx.message?.document.file_id);
    const fileResponse = await axios.get(file.href, { responseType: 'arraybuffer' });
    const filePath = `./${dir}/${fileUId}`;
    if (!existsSync(filePath))
        writeFileSync(filePath, fileResponse.data);

    const epub = new EPub(filePath);
    epub.on('end', () => {
        // ctx.reply(Object.keys(epub.metadata));
        ctx.reply(JSON.stringify(epub.metadata));
        coll.insertOne({_id: fileUId, ...epub.metadata});
        setTimeout(() => unlink(filePath), 10e3);
    });
    epub.parse();
});

mg.connect().then(() => bot.launch());

function stopAll(e) {
    console.log('Stopping...\n', e);
    mg.close();
    bot.stop();
}

process.once('SIGINT', stopAll);
process.once('SIGTERM', stopAll);
process.once('uncaughtException', stopAll);