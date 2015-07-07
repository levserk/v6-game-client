define([], function() {
    var Room = function(roomInfo, client){
        this.data = roomInfo; //deprecated
        this.inviteData = roomInfo.data;
        this.id = roomInfo.room;
        this.owner = client.getUser(roomInfo.owner);
        this.players = [];
        this.spectators = [];
        this.isPlayer = false;
        this.mode = roomInfo.mode;
        this.turnTime = roomInfo.turnTime || client.opts.turnTime * 1000;
        this.takeBacks = roomInfo.takeBacks;
        this.timeMode = roomInfo.timeMode || 'reset_every_switch';
        this.timeStartMode = roomInfo.timeStartMode || 'after_switch';
        this.history = [];
        var i;
        // init players
        if (typeof roomInfo.players[0] == "object") {
            this.players = roomInfo.players;
        }
        else {
            for (i = 0; i < roomInfo.players.length; i++)
                this.players.push(client.getUser(roomInfo.players[i]));
        }

        // init spectators
        if (roomInfo.spectators && roomInfo.spectators.length) {
            if (typeof roomInfo.spectators[0] == "object") {
                this.players = roomInfo.players;
            }
            else {
                for (i = 0; i < roomInfo.spectators.length; i++)
                    this.spectators.push(client.getUser(roomInfo.spectators[i]));
            }
        }

        this.score = {games:0};
        for (i = 0; i < this.players.length; i++){
            this.score[this.players[i].userId] = 0;
            if (this.players[i] == client.getPlayer()) this.isPlayer = true;
        }
    };

    return Room;
});