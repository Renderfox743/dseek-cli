'use strict';

module.exports = function start(args) {
  const wantServer = args.includes('--server') || args.includes('-s');
  if (wantServer) {
    require('./server.js');
  } else {
    require('./daemon.js');
  }
};