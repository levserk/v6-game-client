define(['EE'], function(EE) {
    'use strict';

    var RatingManager = function (client) {
        this.client = client;
        this.currentRoom = null;
    };

    RatingManager.prototype = new EE();


    RatingManager.prototype.onMessage = function (message) {
        var data = message.data, i;
        console.log('rating_manager;', 'message', message);
        switch (message.type) {
            case 'rating': break;
        }
    };


    RatingManager.prototype.getRatings = function(mode){
        client.send('rating_manager', 'ratings', 'server', {mode:mode||this.client.currentMode});
    };


    return RatingManager;
});