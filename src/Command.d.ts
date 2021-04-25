import discordJS, { Client, Message } from "discord.js";
import { Bot } from "..";
declare class Command<D, UDB, GDB> {
    static isCommand (arg: any): arg is CommandData<any, any, any>
    
    constructor(data: CommandData<UDB, GDB, D>)
    data: D
    name: string
    description: string
    run(msg: Message, args: string[], userDB: UDB, guildDB: GDB, client: Client, discord: typeof discordJS, bot: Bot<D, GDB, UDB>): Promise<any>
    static get EvalCommand(): typeof EvalCommand
    static HelpCommand: typeof HelpCommand
}

declare class EvalCommand<D> {
    constructor(name: string, description: string, data: D) 
    data: D
}
export type CommandData<UDB, GDB, D> = EvalCommand<D>|HelpCommand<D>|Command<D, UDB, GDB>|{
    name: string
    description: string
    data: D
    run(msg: Message, args: string[], userDB: UDB, guildDB: GDB, client: Client, discord: typeof discordJS, bot: Bot<D, GDB, UDB>): Promise<any>
}

declare class HelpCommand<D>{
    constructor(name: string, data: D, description: string, filter?: (cmd: CommandData<any, any, D>) => boolean, embedOptions?: {
        title: string
        description: string
        inline: boolean
    })
    data: D
}

export default Command