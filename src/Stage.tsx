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
    Chug Your Own Antidote. 
    Chase Your Own Antelope. 
    Charge Your Own Android. 
    Chant Your Own Anthem. 
    Change Your Own Attitude.
    Chew Your Own Avocado.*/


export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly actionPrompt: string = 
        'Critical Instruction:\n' + 
        'This is a multiple-choice turn-based role-play. Based on the above chat history, output a list of four-to-six options for varied follow-up actions that {{user}} could choose to pursue at this juncture.\n' +
        'These options can be simple dialogue, immediate reactions, or general courses of action. Consider the characters\' current situations, motivations, and assets while crafting interesting actions that could ' +
        'drive the narrative in different directions.\n' +
        'All options follow this format:\n' +
        '#. Brief summary of action or dialogue\n\n' +
        'Ignore the formatting or structure of previously generated options and learn from the brief examples below:\n\n' +
        'Sample Situation: {{user}} is confronted by a locked door with an inattentive guard nearby.' +
        'Sample Response:\n' +
        '1. Approach the guard, "How would you feel about letting me in?"\n' +
        '2. Force the lock.\n' +
        '3. Pick the lock (it looks complex).\n' +
        '4. Search for another way in.\n' +
        '5. Give up and go home.\n' +
        '###\n\n' +
        'Sample Situation: {{user}} has just entered a bustling tavern.\n' +
        'Sample Response:\n' +
        '1. Approach the bar and order a drink.\n' +
        '2. Scan the room for familiar faces.\n' +
        '3. Sit in a corner and observe the patrons.\n' +
        '4. Strike up a conversation with a stranger.\n' +
        '5. Look for a quiet spot to gather your thoughts.\n' +
        '6. Strike up a song.\n' +
        '###\n\n' +
        'The options should be brief but flavorful, exercising creativity and diversity while matching the tone or energy of the narrative, ' +
        'but the formatting of these options should remain uniform for processing purposes.';

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
        this.choices = [];
        this.setStateFromMessageState(messageState);
        this.users = users;
        this.characters = characters;
        console.log(this.users);
        console.log(this.characters);
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
        let choiceIndex: number|null = null;
        let finalContent: string|undefined = content;

        // The user was presented a set of numbered action options. Their message content may simply have a number corresponding to one of those options. Or it might have "#." Need to account for a decimal point:
        const match = content.match(/^\s*(\d+)/m);
        if (match) {
            choiceIndex = parseInt(match[1], 10) - 1;
            if (choiceIndex >= 0 && choiceIndex < this.choices.length) {
                console.log(`Picked by index: ${choiceIndex}`);
                finalContent = this.choices[choiceIndex];
            } else {
                choiceIndex = null;
            }
        }

        // Alternatively, they may have repeated some snippet of content from one of the options:
        for (let i = 0; i < this.choices.length; i++) {
            if (content.trim().toLowerCase().includes(this.choices[i].trim().toLowerCase()) || this.choices[i].trim().toLowerCase().includes(content.trim().toLowerCase())) {
                console.log(`picked by content match: ${i}`);
                choiceIndex = i;
                finalContent = this.choices[i];
                break;
            }
        }

        return {
            stageDirections: `Critical Instruction: {{user}} will pursue the following course of action:\n\n${finalContent}\n\nDepict {{user}}'s action and/or dialogue as the narrative continues with these events. Focus on the narrative and do not list new options, as these are independently generated.`,
            messageState: this.buildMessageState(),
            modifiedMessage: choiceIndex !== null ? `(${choiceIndex + 1}. ${finalContent})` : `(Ad-lib Action: ${finalContent})`,
            systemMessage: null,
            error: errorMessage,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            anonymizedId,
            promptForId,
        } = botMessage;

        let finalContent = botMessage.content || '';

        // Remove any leading number line like "x. Some content here." where x is a number:
        const leadingNumberMatch = finalContent.match(/^\s*(\d+)\.\s*(.*)$/gm);
        if (leadingNumberMatch) {
            for (const match of leadingNumberMatch) {
                const lineMatch = match.match(/^\s*(\d+)\.\s*(.*)$/gm);
                if (lineMatch) {
                    finalContent = finalContent.replace(match, '');
                }
            }
        }
        finalContent = finalContent.trim();

        // Cut off the content if encountering # or --- or *** or "What do you do?" or "System:"
        const cutoffMatch = finalContent.match(/(---|#|\*\*\*|What do you do\?|System:)/);
        if (cutoffMatch) {
            finalContent = finalContent.substring(0, cutoffMatch.index).trim();
        }

        const targetUser = (promptForId ? this.users[promptForId] : Object.values(this.users)[0]);
        // Generate options:
        let optionPrompt = this.replaceTags(`Details about {{char}}:\n${this.characters[anonymizedId].personality}\n${this.characters[anonymizedId].description}\n\nDetails about {{user}}:\n${targetUser.chatProfile}\n\n` +
                `Chat History:\n{{messages}}\n\nDefault Instruction:\n{{post_history_instructions}}\n\n${this.actionPrompt}`,
            {"user": targetUser.name, "char": this.characters[anonymizedId].name, "original": ''});
        let optionResponse = await this.generator.textGen({
            prompt: optionPrompt,
            min_tokens: 20,
            max_tokens: 200,
            include_history: true,
            stop: ["###"]
        });

        this.choices = [];
        
        if (optionResponse && optionResponse.result) {
            console.log(`Option response:`);
            console.log(optionResponse.result);

            // Experimental parsing; just outputting for testing first:
            const normalized = optionResponse.result
                .replace(/\r\n|\r|\n/g, ' ') // collapse line breaks
                .replace(/\s{2,}/g, ' ') // collapse multiple spaces
                .replace(/(\d+)\.\s*/g, '\n$1. ') // put each numbered item on its own line
                .replace(/-\s*/g, '\n- ') // put each dash item on its own line
                .trim();
            console.log(`Testing normalized option response:`);
            console.log(normalized);





            // Actual current parsing:
            const lines = optionResponse.result.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
                    // Strip off any "-" or "#.":
                    const choice = trimmed.replace(/^[\-\d]+\.\s*/, '').trim();
                    if (choice.length > 0 && !this.choices.includes(choice)) {
                        this.choices.push(choice);
                    }
                }
            }
        }

        // Trim down options:
        this.choices.length = Math.min(this.choices.length, 6);

        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            error: this.choices.length == 0 ? 'Failed to generate actions; consider swiping or write your own.' : null,
            systemMessage: this.choices.length > 0 ? `---\nWhat do you do?\n` + this.choices.map((action, index) => `${index + 1}. ${action}`).join('\n') : null,
            chatState: null
        };
    }

    setStateFromMessageState(messageState: MessageStateType) {
        if (messageState != null) {
            this.choices = [...messageState.choices];
        }
    }

    buildMessageState(): any {
        return {choices: [...this.choices]};
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