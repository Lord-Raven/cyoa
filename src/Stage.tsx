import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, TextGenRequest, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

/* Stage names: 
    Choke Your Own Adulterer. 
    Cheese Your Own Advantage. 
    Charter Your Own Airship. 
    Chug Your Own Ale. 
    Chase Your Own Antelope. 
    Charge Your Own Android. 
    Chant Your Own Anthem. 
    Change Your Own Attitude.
    Chew Your Own Avocado.*/


export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly actionPrompt: string = 
        'Critical Instruction:\nThis is a multiple-choice turn-based role-play. Based on the above chat history, output a list of three-to-six options for varied follow-up actions that {{user}} could choose to pursue at this juncture.\n' +
        'These options can be simple dialogue, immediate reactions, or general courses of action. Consider the characters\' current situations, motivations, and assets while crafting interesting actions.\n' +
        'All options follow this format:\n' +
        '#. Brief summary of action or dialogue\n\n' +
        'Sample Situation: {{user}} is confronted by a locked door with an inattentive guard nearby.' +
        'Sample Response:\n' +
        '- "How would you feel about letting me in?".\n' +
        '- Force the lock.\n' +
        '- Pick the lock (it looks difficult).\n' +
        '- Search for another way in.\n' +
        '- Give up.\n\n' +
        'The flavor of the options should exercise creativity and diversity while matching the tone or energy of the narrative, but the formatting of these options should remain uniform for processing purposes.';

    characters: {[key: string]: Character};
    users: {[key: string]: User};

    // Saved:
    choices: string[];


    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        const {
            characters,
            users,
            messageState,
        } = data;
        this.setStateFromMessageState(messageState);
        this.users = users;
        this.characters = characters;
        console.log(this.users);
        console.log(this.characters);
        this.choices = [];
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        this.setStateFromMessageState(state);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            content,
        } = userMessage;

        let errorMessage: string|null = null;
        let finalContent: string|undefined = content;

        // The user was presented a set of numbered action options. Their message content may simply have a number corresponding to one of those options. Or it might have "#." Need to account for a decimal point:
        const match = content.match(/^\s*(\d+)/m);
        if (match) {
            console.log(`Matched number: ${match}`);
            const choiceIndex = parseInt(match[1], 10) - 1;
            if (choiceIndex >= 0 && choiceIndex < this.choices.length) {
                finalContent = `(${choiceIndex + 1}. ${this.choices[choiceIndex]})`;
            }
            // Alternatively, they may have repeated some snipped of content from one of the options:
            for (let i = 0; i < this.choices.length; i++) {
                if (content.toLowerCase().includes(this.choices[i].toLowerCase()) || this.choices[i].toLowerCase().includes(content.toLowerCase())) {
                    finalContent = `(${i + 1}. ${this.choices[i]})`;
                    break;
                }
            }
        }

        return {
            stageDirections: `Critical Instruction: {{user}} will pursue the following course of action: ${finalContent}. Depict {{user}}'s actions, including any dialogue and consequences as the narrative continues.`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            anonymizedId,
            promptForId
        } = botMessage;

        console.log(botMessage);

        const targetUser = (promptForId ? this.users[promptForId] : Object.values(this.users)[0]);
        // Generate options:
        let optionPrompt = this.replaceTags(`Details about {{char}}:\n${this.characters[anonymizedId].personality}\n${this.characters[anonymizedId].description}\n\nDetails about {{user}}:\n${targetUser.chatProfile}\n\nChat History:\n{{messages}}\n\nDefault Instruction:\n{{post_history_instructions}}\n\n${this.actionPrompt}`,
            {"user": targetUser.name, "char": this.characters[anonymizedId].name, "original": ''});
        let optionResponse = await this.generator.textGen({
            prompt: optionPrompt,
            min_tokens: 20,
            max_tokens: 150,
            include_history: true
        });

        this.choices = [];
        
        if (optionResponse && optionResponse.result) {
            console.log(`Option response`);
            console.log(optionResponse.result);
            const lines = optionResponse.result.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
                    // Strip off any "-" or "#.":
                    this.choices.push(trimmed.replace(/^[\-\d]+\.\s*/, ''));
                }
            }
        }

        // Trim down options:
        this.choices.length = Math.min(this.choices.length, 6);


        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: null,
            error: this.choices.length == 0 ? 'Failed to generate actions; consider swiping or write your own.' : null,
            systemMessage: this.choices.length > 0 ? `---\nWhat do you do?\n` + this.choices.map((action, index) => `${index + 1}. ${action}`).join('\n') : null,
            chatState: null
        };
    }

    setStateFromMessageState(messageState: MessageStateType) {
        if (messageState != null) {
            this.choices = messageState.choices;
        }
    }

    buildMessageState(): any {
        return {'choices': this.choices};
    }

    replaceTags(source: string, replacements: {[name: string]: string}) {
        return source.replace(/{{([A-z]*)}}/g, (match) => {
            return replacements[match.substring(2, match.length - 2)] || match;
        });
    }

    render(): ReactElement {
        return <></>;
    }

}