// Entry point voor de Google Calendar-connector.
const oauth = require('./oauth');
const calendar = require('./calendar');

module.exports = { ...oauth, ...calendar };
