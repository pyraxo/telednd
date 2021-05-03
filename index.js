const token = require('./token.json').token

const TelegramBot = require('node-telegram-bot-api')

const bot = new TelegramBot(token, { polling: true })

let botId
const games = {}
const gameMaster = {}
const playerGames = {}

bot.getMe().then(botUser => {
    botId = botUser.id
}).catch(console.error)

const joinGame = (msg, code) => {
    const currGame = games[code]

    if (typeof currGame === 'undefined') {
        return bot.sendMessage(msg.chat.id, 'No such game exists!')
    }

    gameMaster[currGame].playerChats.push({
        userId: msg.from.id,
        chatId: msg.chat.id,
        firstName: msg.from.first_name,
        selected: false
    })

    playerGames[msg.from.id] = (playerGames[msg.from.id] || []).concat(currGame)

    return bot.sendMessage(msg.chat.id, `You have joined *${gameMaster[currGame].dmName}*'s game\\!`, { parse_mode: 'MarkdownV2' })
}

bot.onText(/\/joingame (.+)/, (msg, match) => {
    if (msg.chat.type !== 'private') return

    if (match[1].length !== 6) {
        return bot.sendMessage(msg.chat.id, 'That is an invalid game code.')
        return
    }

    joinGame(msg, match[1])
})

bot.onText(/\/quitgame/, msg => {
    if (msg.chat.type !== 'private') return

    for (const gameKey in gameMaster) {
        const idx = gameMaster[gameKey].playerChats.findIndex(player => player.userId === msg.from.id)
        if (idx > -1) {
            gameMaster[gameKey].playerChats.splice(idx, 1)
            playerGames[msg.from.id] = playerGames[msg.from.id].filter(game => game === gameKey)
            return bot.sendMessage(msg.chat.id, `You have left *${gameMaster[gameKey].dmName}*'s game\\.`, { parse_mode: 'MarkdownV2' })
        }
        return bot.sendMessage(msg.chat.id, 'You are not currently in a game.')
    }
})

bot.onText(/\/dmstop/, msg => {
    if (msg.chat.type !== 'private') return
    if (typeof gameMaster[msg.from.id] === 'undefined') {
        bot.sendMessage(msg.chat.id, 'You\'re not running a game! Use /dmstart to begin a game.')
    }

    for (const playerChat in gameMaster[msg.from.id].playerChats) {
        bot.sendMessage(playerChat.chatId, msg.chat.id, msg.message_id)
    }
    delete gameMaster[msg.from.id]
    bot.sendMessage(msg.chat.id, 'You have stopped the game.')
})

bot.onText(/\/dmstart/, msg => {
    if (msg.chat.type !== 'private') return
    if (typeof gameMaster[msg.from.id] !== 'undefined') {
        bot.sendMessage(msg.chat.id, `You already have a game running\\! Code: *${gameMaster[msg.from.id].code}*`, { parse_mode: 'MarkdownV2' })
        return
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    gameMaster[msg.from.id] = {
        dmName: msg.from.username,
        dmChatId: msg.from.id,
        code,
        playerChats: []
    }
    games[code] = msg.from.id
    bot.sendMessage(msg.chat.id, [
        'You have started a game\\!\n',
        'To start broadcasting to players, get them to run the command:',
        `\`/joingame ${code}\`\n`,
        'Or run /openmenu to start selecting players to send messages to\\.'
    ].join('\n'), {
        parse_mode: 'MarkdownV2'
    })
})

bot.onText(/\/openmenu/, msg => {
    if (msg.chat.type !== 'private') return

    const game = gameMaster[msg.from.id]
    if (typeof game === 'undefined') {
        bot.sendMessage(msg.chat.id, 'You\'re not running a game! Use /dmstart to begin a game.')
    }

    bot.sendMessage(msg.chat.id, [
        '📢 *Broadcast Menu*',
        `Game code: *${game.code}*`,
        `Total players: ${game.playerChats.length}\n`,
        `You have selected *${game.playerChats.reduce((count, curr) => count + (curr.selected ? 1 : 0), 0)}* players:`
    ].join('\n'), {
        parse_mode: 'MarkdownV2',
        reply_markup: {
            inline_keyboard: [game.playerChats.map(playerChat => ({
                text: playerChat.firstName + (playerChat.selected ? ' ✅' : ''),
                callback_data: JSON.stringify({
                    id: playerChat.userId,
                    gameId: msg.from.id
                })
            })) || []]
        }
    })
})

bot.on('callback_query', query => {
    if (query.message.from.id !== botId) return
    if (!query.message.text.startsWith('📢')) return

    const data = JSON.parse(query.data)
    const game = gameMaster[data.gameId] // Verify if message ID is the user
    game.playerChats.forEach(playerChat => {
        if (playerChat.userId === data.id) {
            playerChat.selected = !playerChat.selected
        }
    })

    bot.editMessageText([
        '📢 *Broadcast Menu*',
        `Game code: *${game.code}*`,
        `Total players: ${game.playerChats.length}\n`,
        `You have selected *${game.playerChats.reduce((count, curr) => count + (curr.selected ? 1 : 0), 0)}* players:`
    ].join('\n'), {
        parse_mode: 'MarkdownV2',
        message_id: query.message.message_id,
        chat_id: query.message.chat.id,
        reply_markup: {
            inline_keyboard: [game.playerChats.map(playerChat => ({
                text: playerChat.firstName + (playerChat.selected ? ' ✅' : ''),
                callback_data: JSON.stringify({
                    id: playerChat.userId,
                    gameId: data.gameId
                })
            })) || []]
        }
    }).then(() => bot.answerCallbackQuery(query.id))
})

bot.on('message', msg => {
    if (msg.chat.type !== 'private') return
    if (msg.text && msg.text.startsWith('/')) return

    if (typeof gameMaster[msg.from.id] !== 'undefined') {
        // Broadcast to all players
        for (const playerChat of gameMaster[msg.from.id].playerChats) {
            if (!playerChat.selected) continue
            bot.forwardMessage(playerChat.userId, msg.chat.id, msg.message_id)
        }
    } else {
        if (typeof playerGames[msg.from.id] !== 'undefined') {
            playerGames[msg.from.id].forEach(gameId => {
                if (typeof gameMaster[gameId] === 'undefined') return
                bot.forwardMessage(gameMaster[gameId].dmChatId, msg.chat.id, msg.message_id)
            })
        }
    }
})

bot.on('polling_error', console.error)