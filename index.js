const discord = require('discord.js')
const fs = require('fs')
const Command = require('./src/Command')
const tokenSymbol = Symbol("token")
class Bot {
    constructor(token, defaultPrefix) {
        this.db = {}
        if (fs.existsSync(require.main.path + "/DB/users.json")) this.db.users = JSON.parse(fs.readFileSync(require.main.path + "/DB/users.json", "utf-8"))
        if (fs.existsSync(require.main.path + "/DB/guilds.json")) this.db.guilds = JSON.parse(fs.readFileSync(require.main.path + "/DB/guilds.json", "utf-8"))
        this.commands = {}
        this.logged = false
        this.client = new discord.Client()
        this.onreadys = [
            () => {
                console.log(`${this.client.user.username} is connected`)
            }
        ]

        if (arguments.length > 1) {
            this[tokenSymbol] = Buffer.from(token).toString('base64')
            this.defaultPrefix = defaultPrefix
        } else {
            if (token.token) {
                this[tokenSymbol] = Buffer.from(token.token).toString("base64")
            } else {
                throw new TypeError("Set the token of your bot")
            }

            if (token.defaultPrefix) {
                this.defaultPrefix = token.defaultPrefix
            } else {
                throw new TypeError("Set the prefx of your bot")
            } 

            if (token.dbOptions) {
                let user = token.dbOptions.user
                let guild = token.dbOptions.guild
                this.setDB({
                    user: Boolean(user),
                    guild: guild
                }, guild? (guild.add? guild.add : (g) => ({
                    prefix: token.prefix,
                    id: g.id,
                    name: g.name,
                    ownerID: g.ownerID,})): null, user? (user.add? user.add: (u) => ({
                        id: u.id,
                        name: u.username, 
                        tag: u.tag
                    })): null)
            }
            
        }
    }

    async login() {
        await this.client.login(Buffer.from(this[tokenSymbol], "base64").toString("utf-8")).then(() => {
            this.logged = true
            this.onreadys.forEach(fn => fn())
        }).catch(() => {
            throw "Invalid token"
        })
    }

    async logout() {
        if (this.logged) {
            this.client.destroy()
        } else {
            throw "Your bot is not logged"
        }
    }
    
    on(event, callback) {
        const dbUsers = new discord.Collection()
        const dbGuilds = new discord.Collection()
        this.client.on(event, async (...args) => {
            for (let i = 0; i < args.length; i++) {
                const d = args[i];
                if (d.constructor == discord.User) {
                    if (this.db.users) dbUsers.set(d.id, (await this.getUserById(d.id, true)))
                } else if (typeof d == "string" && this.client.users.cache.has(d)) {
                    if (this.db.users) dbUsers.set(d, (await this.getUserById(d, true)))
                } else if (d.constructor == discord.Message) {
                    if (this.db.users) dbUsers.set(d.author.id, (await this.getUserById(d.author.id, true)))
                    if (this.db.guilds) dbGuilds.set(d.guild.id, (await this.getGuildById(d.guild.id, true)))
                } else if (typeof d == "string" && this.client.guilds.cache.has(d)) {
                    if (this.db.guilds) dbGuilds.set(d, (await this.getGuildById(d, this.getGuildById(d, true))))
                } else if (d.constructor == discord.GuildMember) {
                    if (this.db.users) dbUsers.set(d.user.id, (await this.getUserById(d.author.id, true)))
                    if (this.db.guilds) dbGuilds.set(d.guild.id, (await this.getGuildById(d.guild.id, true)))
                }
            }
            callback(...args, {
                users: dbUsers,
                guilds: dbGuilds
            })
        })
    }
    addCommand(...commands) {
        commands.forEach(command => {
            if (Array.isArray(command)) {
                return this.addCommand(...command)
            }
            if (Command.isCommand(command)) {
                if (command.constructor != Command) command = new Command(command)
                if (this.commands[command.name.toLowerCase()]) {
                    throw new Error(`The command "${command.name.toLowerCase()}" already has declared`)
                } else {
                    this.commands[command.name.toLowerCase()] = command
                }
            }
        })
        return this
    }
    listenCommands(filter, cb) {
        filter =  typeof filter == "function"? filter : (() => false) 
        this.client.on("message", async msg => {
            const prefix = this.db.guilds && this.prefixKey ? (await this.getGuildById(msg.guild.id))[this.prefixKey] || this.defaultPrefix : this.defaultPrefix
            if (!msg.author.bot && msg.content.startsWith(prefix)) {
                const obj = this.commands[msg.content.replace(prefix, '').split(/ +/)[0].toLowerCase()] || Object.values(this.commands).find(c => filter(c, msg.content.replace(prefix, '').split(/ +/)[0].toLowerCase()))
                const userDB = await this.getUserById(msg.author.id, true)
                const guildDB = await this.getGuildById(msg.guild.id, true)
                const args = msg.content.split(/ +/g).slice(1)
                if (obj) {
                    if (cb) {
                        cb(false, obj, {
                            msg,
                            userDB,
                            guildDB,
                            args,
                            client: this.client,
                            discord,
                            bot: this
                        }, () => {
                            obj.run(msg, args, userDB, guildDB, this.client, discord, this)
                        })
                    } else {
                        obj.run(msg, args, userDB, guildDB, this.client, discord, this)
                    }
                } else {
                    if (cb) cb(true, {name: msg.content.replace(this.defaultPrefix, '').split(/ +/)[0]}, {
                        msg,
                        args,
                        userDB,
                        guildDB,
                        client: this.client,
                        discord,
                        bot: this
                    })
                }
            }
        })
    }
    setDB(config, guildDB, userDB) {
        this.hasDB = true
        if (!fs.existsSync("DB")) fs.mkdirSync("DB")
        const add = (db, obj, key) => {
            const DBObject = this.db[db][key] || {}

            for (const key in obj) {
                if (!DBObject.hasOwnProperty(key)) DBObject[key] = obj[key]
            }
            this.db[db][key] = DBObject
            fs.writeFileSync(`DB/${db}.json`, JSON.stringify(this.db[db], null, "\t"))
        }
        if (config.user) {
            this.db.users = this.db.users || {}
            this.onreadys.push(() => {
                this.client.users.cache.forEach(u => add("users", userDB(u), u.id))
            })
            this.client.on("guildMemberAdd", ({ user }) => {
                add("users", userDB(user), user.id)
                fs.writeFileSync("DB/users.json", JSON.stringify(this.db.users, null, "\t"))
            })
        }
        if (config.guild) {
            this.db.guilds = this.db.guilds || {}
            this.prefixKey = config.guild.prefixKey
            this.onreadys.push(() => {
                this.client.guilds.cache.forEach(g => add("guilds", guildDB(g), g.id))
                fs.writeFileSync("DB/guilds.json", JSON.stringify(this.db.guilds, null, "\t"))
            })
            this.client.on("guildCreate", g => {
                if (!this.db.guilds[g.id]) this.db.guilds[g.id] = guildDB(g)
                fs.writeFileSync("DB/guilds.json", JSON.stringify(this.db.guilds, null, "\t"))
            })
        } 
    }

    async getUsers (filter, amount) {
        if (this.db.users) {
            let len = 0, res = new discord.Collection()
            for (const key in this.db.users) {
                if (len < amount && filter(this.db.users[key], key, this.db.users)) {
                    len++
                    res.set(key, this.db.user[key])
                }
            }
            return res
        } else throw "The user database is not seted"
    }

    async getOneUser(filter) {
        if (this.db.users) {
            let len = 0, res = new discord.Collection(Object.entries(this.db.users))
            return new discord.Collection(res.filter(filter).map((v, id) => [id, v]).slice(0, amount))
        } else throw "The user database is not seted"
    }

    async getUserById(id, forceded = false) {
        if (this.db.users) return this.db.users[id]
        else if (!forceded) throw "The user database is not seted"
    }

    updateUser(id, data) {
        return new Promise((res, rej) => {
            if (this.db.users) {
                if (!this.db.users[id]) rej(`The id '${id}' is not registered in the user databases`)
                for (const key in data) {
                    this.db.users[id][key] = data[key]
                }
                fs.writeFile("DB/users.json", JSON.stringify(this.db.users, null, "\t"), (err) =>{
                    if (err) rej(err)
                    res(this.db.users[id])
                })
            } else rej("The user database is not seted")
        })
    }

    async getGuilds(filter, amount) {
        if (this.db.guilds) {
            let len = 0, res = new discord.Collection(Object.entries(this.db.guilds))
            return new discord.Collection(res.filter(filter).map((v, id) => [id, v]).slice(0, amount))
        } else throw "The guild database is not seted"
    }

    async getOneGuld(filter) {
        if (this.db.guilds) {
            const res = new discord.Collection(Object.entries(this.db.guilds))
            return res.filter(filter).first()
        } else throw "The guild database is not seted"
    }

    async getGuildById(id, forceded = false) {
        if (this.db.guilds) return this.db.guilds[id]
        else if (!forceded) throw "The guild db is not seted"
    }

    updateGuild(id, data) {
        return new Promise((res, rej) => {
            if (this.db.guilds) {
                if (!this.db.guilds[id]) rej(`The id '${id}' is not registered in the guild databases`)
                for (const key in data) {
                    this.db.guilds[id][key] = data[key]
                }
                fs.writeFile("DB/guilds.json", JSON.stringify(this.db.guilds, null, "\t"), (err) =>{
                    if (err) rej(err)
                    res(this.db.guilds[id])
                })
            } else rej("The guild database is not seted")
        })
    }
}
module.exports = {
    Bot,
    Command
}   