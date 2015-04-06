/**
 * Created by tuser on 03.04.2015.
 */
var Emulation = function(client, conf) {
    this.client = client;
    this.conf = conf || {
        switchTurn: {'switch': true},
        winTurn: {result: 1}
    };
    this.isRun = false;
};

Emulation.prototype.start = function() {
    this.isRun = true;
    this.bindEvents();
    if (this.client.isLogin) {
        this.run();
    } else {
        this.client.on('login', this.run.bind(this));
    }
};

Emulation.prototype.stop = function () {
    this.isRun = false;
};

Emulation.prototype.run = function() {
    this.player = this.client.getPlayer();
    console.log('emulation;','run userId', this.player.userId);

    this.client.inviteManager.playRandom();
    // TODO: press play random
};


Emulation.prototype.bindEvents = function() {
    this.client.gameManager.on('game_start', this.onGameStart.bind(this));
    this.client.gameManager.on('round_start', this.onRoundStart.bind(this));
    this.client.gameManager.on('turn', this.onTurn.bind(this));
    this.client.gameManager.on('switch_player', this.onSwitchPlayer.bind(this));
    this.client.gameManager.on('round_end', this.onRoundEnd.bind(this));
    this.client.gameManager.on('game_leave', this.onGameLeave.bind(this));
    this.client.gameManager.on('user_leave', function(){this.client.gameManager.leaveRoom()}.bind(this));
};


Emulation.prototype.onGameStart = function (data) {
    if (!this.isRun) return;
    console.log('emulation;','game_start, room: ', data);
};

Emulation.prototype.onRoundStart = function (data) {
    if (!this.isRun) return;
    console.log('emulation;','round_start, room: ', data);
    if (data.first == this.player) {
        this.doTurn();
    }
    this.refresh();
};

Emulation.prototype.onTurn = function (data) {
    if (!this.isRun) return;
    console.log('emulation;','turn', data.turn, 'is your turn: ', data.user == this.client.getPlayer().userId);
};

Emulation.prototype.onSwitchPlayer = function (data) {
    if (!this.isRun) return;
    console.log('emulation;','switch_player', 'next: ', data, 'your next: ', data.userId == this.player.userId);
    if (data.userId == this.player.userId) {
        this.doTurn();
    }
    this.refresh();
};

Emulation.prototype.onRoundEnd = function(data) {
    if (!this.isRun) return;
    console.log('emulation;','round_end', data, 'your win: ', data.winner == this.client.getPlayer().userId);
    setTimeout(function () {
        if (this.client.gameManager.inGame()) {
            if (!this.leaveGame())
                this.client.gameManager.sendReady();
        }
    }.bind(this),1000 + Math.random() * 4000);
    //this.refresh(0.01)
};

Emulation.prototype.onGameLeave = function(data) {
    if (!this.isRun) return;
    console.log('emulation;','game leave');
    setTimeout(function () {
        console.log('emulation;','game leave, play again');
        this.refresh();
        this.client.inviteManager.playRandom();
    }.bind(this), 1000 + 10000*Math.random());
};

Emulation.prototype.doTurn = function(r) {
    if (!this.isRun) return;
    r = Math.random();
    setTimeout(function () {
        if (this.client.gameManager.inGame()) {
            console.log('emulation;','doTurn', r);
            if (typeof this.conf.getTurn == "function") {
                this.client.gameManager.doTurn(this.conf.getTurn());
            } else {
                if (r < 0.6) this.client.gameManager.sendTurn(this.conf.switchTurn);
                else this.client.gameManager.sendTurn(this.conf.winTurn);
            }
        }
    }.bind(this),500 + Math.random() * 1000);
    this.refresh();
};

Emulation.prototype.leaveGame = function(r) {
    if (!this.isRun) return;
    r = r || Math.random();
    if (r < 0.2) {
        console.log('emulation;','leave game', r);
        this.client.gameManager.leaveGame();
        return true;
    }
    return false;
};

Emulation.prototype.refresh = function(r) {
    if (!this.isRun) return;
    //return;
    r = r || Math.random();
    if (r < 0.05) {
        console.log('emulation;','refresh', r);
        //this.relogin(0);
        location.reload(false);
    }
};

Emulation.prototype.relogin = function(r) {
    r = Math.random();
    if (r < 0.5) {
        console.log('emulation;','relogin', r);
        document.cookie = '_userId=; path=/;"';
    }
};