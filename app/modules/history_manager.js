define(['EE'], function(EE) {
    'use strict';

    var HistoryManager = function (client) {
        this.client = client;
        this.currentRoom = null;
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data, i;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': break;
        }
    };


    HistoryManager.prototype.getHistory = function(mode){
        client.send('history_manager', 'history', 'server', {mode:mode||this.client.currentMode});
    };


    return HistoryManager;
});