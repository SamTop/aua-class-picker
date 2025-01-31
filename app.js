#!/usr/bin/env node
const credentials = require('./credentials');
const figlet = require('figlet');
const gradient = require('gradient-string');
const { createSpinner } = require("nanospinner");
const inquirer = require('inquirer');
const fuzzy = require('fuzzy');
const User = require('./user');
const fs = require('fs');

// TODO: move to some config function or init function dedicated to inquirer or just wrap inquirer in a module
inquirer.registerPrompt('checkbox-plus', require('inquirer-checkbox-plus-prompt'));


const errors = {
    login: {
        CONNECTION_PROBLEM: 'CONNECTION_PROBLEM',
        INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    },
};


const welcome = () => {
    const message = `Welcome To ${'aua class picker'.toUpperCase()}`;

    const figletMessage = figlet.textSync(
        message
    );

    const gradientFigletMessage = gradient.summer(
        figletMessage
    );

    console.log(
        gradientFigletMessage
    );
};

const sleep = (ms = 1000) => {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

const login = async (username, password) => {
    const user = new User(username, password);

    const loginSpinner = createSpinner('Trying To Login...').start();
    await sleep(2000);

    let loginResult = null;

    try {
        loginResult = await user.login();
    } catch (e) {
        loginSpinner.error({text: `Something went wrong, check your connection`})
        return {
            success: false,
            name: errors.login.CONNECTION_PROBLEM,
        };
    }

    if (! (loginResult && loginResult.success)) {
        loginSpinner.error({text: `Invalid Credentials`})
        return {
            success: false,
            name: errors.login.INVALID_CREDENTIALS,
        };
    }

    loginSpinner.success({text: `Successfully Logged In as ${username}`});

    return {
        success: true,
        data: user,
    };
};


/**
 * Choose preferred classes for registration
 * @param classes {Array<{id: int, name: string}>}
 * @returns {Promise<Array<int>>}
 */
const pickClasses = async (classes=null) => {
    const questions = [
        // {
        //     type: 'list',
        //     name: 'classInputType',
        //     message: 'How would you pick classes',
        //     choices: [
        //         {
        //             name: 'Choose from list of classes (Recommended)',
        //             value: 'list',
        //         },
        //         {
        //             name: 'Enter raw class ids',
        //             value: 'ids',
        //         },
        //     ]
        // },

        {
            type: 'input',
            name: 'classIds',
            message: 'Enter classes ids separated by spaces (ex. 7878 9651 4456)',
            // when: (answers) => {
            //     return answers.classInputType === 'ids';
            // },
        },

        // {
        //     type: 'checkbox-plus',
        //     name: 'classes',
        //     message: 'Select classes to register (type to search, <space> to check/uncheck option)',
        //     pageSize: 10,
        //     highlight: true,
        //     searchable: true,
        //     when: (answers) => {
        //         console.log({answers})
        //         return answers.classInputType === 'list';
        //     },
        //     //default: ['yellow', 'red'],
        //     source: function(answersSoFar, input) {
        //         console.log('trying')
        //         input = input || '';
        //
        //         return new Promise(function(resolve) {
        //
        //             const fuzzyResult = fuzzy.filter(input, classes, {
        //                 extract: cls => cls.name,
        //             });
        //
        //             //console.log(JSON.stringify(fuzzyResult))
        //
        //             const data = fuzzyResult.map(function(element) {
        //                 return {
        //                     name: element.original.name,
        //                     value: element.original.id
        //                 };
        //             });
        //
        //             resolve(data);
        //
        //         });
        //
        //     }
        // }
    ];

    /** @type {{classInputType: string, classes: Array<int>}} */
    const answers = await inquirer.prompt(questions);
    if (answers.classInputType === 'ids' || answers.classIds) {
        return new Promise((resolve) => resolve(answers.classIds.trim().split(' ')))
    }
    return answers.classes;

    // use `checkbox-plus` plugin of `inquirer` package
    // first ask if user wants enter raw ids
    // or choose from classes list
};


const tryRegister = async (user, classId) => {
    return user.register(classId).then(async result => {
        console.log(result);
        if (!result.success) {
            console.log(`Could not register to class: ${classId}, trying again`);
            return tryRegister(user, classId);
        }

        return true;
    });
};

const tryLogin = async (username=undefined, password=undefined) => {
    if(username === undefined && password === undefined) {
        const res = await credentials.read();
        username = res.username;
        password = res.password;
    }

    const loginResult = await login(username, password);

    if (! loginResult.success) {
        if (loginResult.name === errors.login.INVALID_CREDENTIALS) {
            return tryLogin(username, password);
        } else {
            return null;
        }
    }

    return loginResult.data;
};

// parse username, password and preferable classes from cmd args
const parseCommandLineArguments = () => {
    const cmdArgs = {};

    process.argv.slice(2).map(arg => {
        return arg.split('=');
    }).forEach(arg => {
        // array value
        if ( arg[1].includes('[') ) {
            cmdArgs[arg[0]] = JSON.parse(arg[1]);
        } else {
            cmdArgs[arg[0]] = arg[1]
        }
    });

    return cmdArgs;
}


const parseCredentials = () => {
    const cmdArgs = parseCommandLineArguments()

    // console.log(cmdArgs);

    return cmdArgs;
};


async function tryRegisterClassIfAvailable(user, classId) {
    const result = await user.checkAvailability(classId);
    if (result.success) {
        if (result.capacity > result.registeredNumber) {
            return await user.register(classId);
        }
        return {
            success: false,
            message: `Class with id ${classId} is full`,
            capacity: result.capacity,
            registered: result.registeredNumber,
            classId,
        };
    }
    return result;
}

const tryRegisterIfAvailable = (user, classes) => {
    classes.forEach(classId => {
        const id = setInterval(async () => {
            const result = await tryRegisterClassIfAvailable(user, classId);
            if(result.success) {
                const date = new Date();
                const logData = `${date.getFullYear()}.${date.getMonth()}.${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} - Registered for class with id ${classId}`;
                console.log(logData);
                fs.appendFileSync('successfulRegistrations.log', logData+'\n');
                clearInterval(id);
            } else {
                let message = `Capacity: ${result.capacity} Registered: ${result.registered} `;
                message += result.message + (result.auaMessage ? " " + result.auaMessage : "");
                const date = new Date();
                const dateStr = `${date.getFullYear()}.${date.getMonth()}.${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
                fs.appendFileSync('unsuccessfulRegistrations.log', dateStr+' - '+message+'\n');
                console.log(message);
            }
        }, 500);
    });
}


const run = async () => {
    welcome();

    const {username, password} = parseCredentials();

    const user = await tryLogin(username, password);

    if (!user) {
        return;
    }

    ///////////////////////////////////////////////////////////////////////////
    const preferredClasses = await pickClasses();
    console.log(preferredClasses);
    await tryRegisterIfAvailable(user, preferredClasses);
    ///////////////////////////////////////////////////////////////////////////

    ///////////////////////////////////////////////////////////////////////////
    // const fetchClassesResult = await user.fetchClasses();
    //
    // if (! fetchClassesResult.success) {
    //     // cannot fetch classes maybe exit program or let enter raw ids
    //     // will handle later
    //     return;
    // }
    // const availableClasses = fetchClassesResult.data;
    //
    // const preferredClasses = await pickClasses(availableClasses);
    //
    //
    // // TODO: ask if wanna start registering now and start registration else hang there
    // /// ---------------------------------------------------------
    //
    // await Promise.all(preferredClasses.map(async cls => {
    //     while( !(await Promise.all([tryRegister(user, cls), tryRegister(user, cls), tryRegister(user, cls)])).includes(true)) {
    //         await sleep(200);
    //     }
    // }));
    // console.log('Congratulations')
    /////////////////////////////////////////////////////////////////////////////
};

void run()
