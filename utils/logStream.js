const isCommand = (log) => {
    if (!log.sub_content) return { isCommand: false, symbol: "", content: "" };
    if (log.sub_content.startsWith("!") || log.sub_content.startsWith("@")) {
        // Return the command symbol and the log for further checks
        return {
            result: true,
            symbol: log.sub_content[0], // `!` or `@`
            content: log.sub_content.slice(1) // Remove the symbol but keep everything else
        };
    }
    return { result: false};
};

const isAdminping = (log) => {
    const result = {
        result: false, // Whether it's an admin ping
        message: ""    // Remaining content of the command
    };
    // First, check if it's a command
    const commandCheck = isCommand(log);
    if (!commandCheck.result) return false;

    // Extract the word after the command symbol
    const [firstWord, ...rest] = commandCheck.content.split(/\s+/); // Split by whitespace
    const restOfContent = rest.join(" "); // Combine the remaining words
    console.log("received admin ping with the message:", restOfContent);

    if (['admin', 'moderator', 'report'].includes(firstWord.toLowerCase())) {
        return {
            result: true,
            message: restOfContent.trim() // Exclude the admin tag
        };
    }

    return result;
};

module.exports = {
    isCommand,
    isAdminping
};