export const formatMessage = (message: string): string => {
    return `**${message}**`;
};

export const handleError = (error: Error): void => {
    console.error(`Error: ${error.message}`);
};