var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as dotenv from 'dotenv';
dotenv.config();
import { Telegraf } from 'telegraf';
import DocumentDAO from './DocumentDAO';
import GraphDAO, { amountOfRecommendedTags } from './GraphDAO';
var CallbackCommand;
(function (CallbackCommand) {
    CallbackCommand["LIKE"] = "like";
    CallbackCommand["STARRED"] = "starred";
    CallbackCommand["RECOMMENDATION"] = "recommendation";
})(CallbackCommand || (CallbackCommand = {}));
const bot = new Telegraf(process.env.BOT_TOKEN);
const graphDAO = new GraphDAO();
const documentDAO = new DocumentDAO();
const callbackSep = '__';
const quotesPerPage = 5;
function stripMargin(template, ...expressions) {
    const result = template.reduce((accumulator, part, i) => {
        return accumulator + expressions[i - 1] + part;
    });
    return result.replace(/(\n|\r|\r\n)\s*\|/g, '$1');
}
function buildQuoteKeyboard(quoteId, currentLike) {
    return {
        inline_keyboard: [[
                {
                    text: "Love it! 💓",
                    callback_data: CallbackCommand.LIKE + callbackSep + quoteId,
                },
                {
                    text: "Share",
                    switch_inline_query: quoteId
                }
            ]],
    };
}
function buildRecommendationsKeyboard(tags) {
    let kb = [];
    for (var i = 0; i < amountOfRecommendedTags; i++) {
        kb.push([{
                text: tags[i].name,
                callback_data: CallbackCommand.RECOMMENDATION + callbackSep + tags[i].id,
            }]);
    }
    return { inline_keyboard: kb };
}
function buildPaginationKeyboard(page, callbackCmd, end) {
    const buttons = [];
    if (page > 0) {
        buttons.push({
            text: "« Previous",
            callback_data: callbackCmd + callbackSep + (page - 1)
        });
    }
    if (!end) {
        buttons.push({
            text: "Next »",
            callback_data: callbackCmd + callbackSep + (page + 1)
        });
    }
    return {
        inline_keyboard: [buttons]
    };
}
function formatQuote(content, author) {
    return '*' + content + '*\n\n_' + author + '_';
}
function formatQuotes(quotes) {
    const text = quotes.map(q => formatQuote(q.text, q.author)).reduce((p, c) => p + c + '\n\n\n', '');
    return text.length ? text : 'Like more quotes to see them here!';
}
function getQuotesLiked(userId, page) {
    return __awaiter(this, void 0, void 0, function* () {
        const quotesId = yield graphDAO.getQuotesLiked(userId, quotesPerPage, page);
        const quotes = [];
        for (const id of quotesId) {
            const quote = yield documentDAO.getQuoteById(id);
            quotes.push(quote);
        }
        return quotes;
    });
}
// User is using the inline query mode on the bot
bot.on('inline_query', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    const query = ctx.inlineQuery;
    if (query) {
        const quotes = [];
        // First search by id (for share function)
        const quote = yield documentDAO.getQuoteById(query.query);
        if (quote !== null) {
            quotes.push(quote);
        }
        else { // if no id matches, then search by author and text
            quotes.push(...(yield documentDAO.getQuotesByAuthor(query.query)));
            quotes.push(...((yield documentDAO.getQuotes(query.query))
                .filter(q => !quotes.map(q => q._id).includes(q._id))));
        }
        const answer = quotes.map((quote) => ({
            id: quote._id,
            type: 'article',
            title: quote.author,
            description: quote.text,
            reply_markup: buildQuoteKeyboard(quote._id),
            input_message_content: {
                message_text: formatQuote(quote.text, quote.author),
                parse_mode: "Markdown"
            },
        }));
        ctx.answerInlineQuery(answer);
    }
}));
function likeCallbackHandler(quoteId, user) {
    return __awaiter(this, void 0, void 0, function* () {
        const liked = yield graphDAO.getQuoteLiked(user.id, quoteId);
        if (liked) {
            return "You already love this glorious quote";
        }
        yield graphDAO.upsertQuoteLiked(user, quoteId);
    });
}
function starredCallbackHandler(page, ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        const quotes = yield getQuotesLiked(ctx.from.id, page);
        ctx.editMessageText(formatQuotes(quotes), {
            parse_mode: 'Markdown',
            reply_markup: buildPaginationKeyboard(page, CallbackCommand.STARRED, !quotes.length)
        });
    });
}
bot.on('callback_query', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    if (ctx.callbackQuery && ctx.from) {
        const args = ctx.callbackQuery.data.split(callbackSep);
        let toast = "";
        //args[0] == type of callback
        switch (args[0]) {
            case CallbackCommand.LIKE:
                //args[1] == id of quote
                toast = yield likeCallbackHandler(args[1], ctx.from);
                break;
            case CallbackCommand.STARRED:
                //args[1] == page number
                yield starredCallbackHandler(parseInt(args[1]), ctx);
                break;
            case CallbackCommand.RECOMMENDATION:
                //args[1] = tag id
                const tagId = parseInt(args[1]);
                const quoteId = yield graphDAO.getRecommendation(ctx.from, tagId);
                console.log("quoteID = " + quoteId);
                let quote = undefined;
                quote = yield documentDAO.getQuoteById(quoteId);
                console.log("quote = " + quote);
                if (quote === null) {
                    quote = yield documentDAO.getRandomQuote();
                }
                ctx.replyWithMarkdown(formatQuote(quote.text, quote.author), {
                    reply_markup: buildQuoteKeyboard(quote._id)
                });
                break;
        }
        ctx.answerCbQuery(toast);
    }
}));
bot.command('random', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    const randomQuote = yield documentDAO.getRandomQuote();
    ctx.replyWithMarkdown(formatQuote(randomQuote.text, randomQuote.author), {
        reply_markup: buildQuoteKeyboard(randomQuote._id)
    });
}));
bot.command('recommend', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    yield graphDAO.upsertUser(ctx.from);
    const tags = yield graphDAO.getMyTopFiveTags(ctx.from);
    ctx.replyWithMarkdown("Please choose a tag", {
        reply_markup: buildRecommendationsKeyboard(tags)
    });
}));
bot.command('help', (ctx) => {
    ctx.reply(`
TODO
  `);
});
bot.command('start', (ctx) => {
    ctx.replyWithMarkdown('*You\'re doing quite well.*\n\n_GlaDOS (ironically)_');
});
bot.command('recommendquote', (ctx) => {
    if (!ctx.from || !ctx.from.id) {
        ctx.reply('We cannot guess who you are');
    }
    else {
        // TODO: call Geo4J (and MongoDB?) backend
    }
});
bot.command('starred', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    if (ctx.from && ctx.from.id) {
        const quotes = yield getQuotesLiked(ctx.from.id, 0);
        ctx.replyWithMarkdown(formatQuotes(quotes), {
            reply_markup: buildPaginationKeyboard(0, CallbackCommand.STARRED)
        });
    }
}));
// Initialize mongo connexion
// before starting bot
documentDAO.init().then(() => {
    bot.startPolling();
});
