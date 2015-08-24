define(['instances/time'], function(Time) {
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
        this.timeGameStart = Date.now();
        this.timeRoundStart = 0;
        this.history = [];
        this.userData = {};
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
            this.userData[this.players[i].userId] = {};
            if (this.players[i] == client.getPlayer()) this.isPlayer = true;
        }
    };

    Room.prototype.load = function(data){
        var id;
        if (data.userData){
            // load personal user data, total time, others
            for (var i = 0; i < this.players.length; i++){
                id = this.players[i].userId;
                this.userData[id].userTotalTime = data.userData[id].userTotalTime || this.userData[id].userTotalTime;
            }
        }
        if (data['gameTime']) this.timeGameStart -= data['gameTime'];
        if (data['roundTime']) this.timeRoundStart -= data['roundTime'];
    };

    Room.prototype.getTime = function(){
        var time = this.userTime, turnTime;
        if (this.timeMode == 'common') {
            time = Date.now() - this.turnStartTime;
        }
        var userTime = new Time(time, this.turnTime);


        time = {
            userTimeMS: userTime.timeMS,
            userTimeS: userTime.timeS,
            userTimePer: userTime.timePer,
            userTimeFormat: userTime.timeFormat,
            userTime: userTime
        };

        if (this.timeGameStart){
            time.gameTime = new Time(Date.now() - this.timeGameStart);
        }
        if (this.timeRoundStart){
            time.roundTime = new Time(Date.now() - this.timeRoundStart);
        }

        if (this.timeMode == 'common'){
            time.userTotalTime = userTime;
        } else {
            time.user = this.current;
            turnTime = this.turnStartTime ? Date.now() - this.turnStartTime : 0;
            time.userTotalTime = new Time(turnTime + this.userData[this.current.userId].userTotalTime)
        }

        return time;
    };

    return Room;
});