define([], function() {
    var Room = function(room, client){
        this.data = room; //deprecated
        this.inviteData = room.data;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        this.spectators = [];
        this.isPlayer = false;
        this.mode = room.mode;
        this.turnTime = room.turnTime || client.opts.turnTime * 1000;
        this.takeBacks = room.takeBacks;
        this.resetTimerEveryTurn = !!room.resetTimerEveryTurn;
        this.history = [];

        console.log('TEST!', room.data);

        // init players
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));

        this.score = {games:0};
        for (i = 0; i < this.players.length; i++){
            this.score[this.players[i].userId] = 0;
            if (this.players[i] == client.getPlayer()) this.isPlayer = true;
        }

        room.spectators = room.spectators || [];
        for (i = 0; i < room.spectators.length; i++) this.spectators.push(client.getUser(room.spectators[i]));
    };

    return Room;
});