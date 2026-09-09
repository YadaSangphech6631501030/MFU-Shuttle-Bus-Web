const { GPS } = require('../config');
const { getDB } = require('../db');
const { createGpsService } = require('./gps');

module.exports = createGpsService({ config: GPS, getDB });
