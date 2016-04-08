define(['EE', 'translit', 'views/history', 'instances/turn', 'instances/game_event', 'instances/time'],
    function(EE, translit, HistoryView, Turn, GameEvent, Time) {
    'use strict';

    var locale;
    var HistoryManager = function (client) {
        this.client = client;
        locale = client.locale['history'];
        this.conf = {
            tabs:[],
            subTabs:[],
            columns:[
                {  id:'date',       source:'date',      title: locale.columns.date },
                {  id:'opponent',   source:'opponent',  title: locale.columns.opponent },
                {  id:'elo',        source:'elo',       title: locale.columns.elo, dynamic:true, startValue:1600 },
                {  id:'time',       source:'time',      title: locale.columns.time    },
                {  id:'number',     source:'number',    title: locale.columns.number }
            ]
        };

        if (typeof client.opts.initHistory== "function") this.conf =  client.opts.initHistory(this.conf, this.client);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.historyId?$('#'+client.opts.blocks.historyId):$('body'));
        this.isCancel = false;
        this.userId = false;
        this.currentMode = false;
        this.maxCount = 100;
        this.count = 0;
        this.history = [];

        client.on('disconnected', function () {
            // TODO: clear all
        })
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.init = function(){
        this.conf.tabs = [];
        if (this.client.modes.length > 1)
            for (var i = 0 ; i < this.client.modes.length; i++)
                this.conf.tabs.push({id:this.client.modes[i], title: this.client.getModeAlias(this.client.modes[i])});
        if (this.historyView && this.historyView.$el){
            this.historyView.$el.remove();
            this.historyView.remove();
        }
        this.historyView = new HistoryView(this.conf, this);
    };


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': this.onHistoryLoad(data['mode'], data['history'], data['penalties'], data.userId); break;
            case 'game': this.onGameLoad(data.mode, data.game); break;
        }
    };


    HistoryManager.prototype.onHistoryLoad = function (mode, history, penalties, userId){
        console.log('history_manager;', 'history load', userId, history, penalties);
        penalties = penalties || [];
        if (!this.historyView.isClosed) {
            var histTable = [], penalty;
            this.userId = userId;
            this.currentMode = mode;
            this.history = this.history.concat(history);
            var count = this.history.length;
            var player = this.client.userList.getUser(userId);
            if (player) count = player[mode]['games'];
            for (var i = this.history.length - 1; i > -1; i--) {

                if (i == this.history.length - 1) {// first game
                    for (var j = 0; j < penalties.length; j++) { // add penalties
                        penalty = penalties[j];
                        if (penalty.time <= this.history[i].timeEnd) { // find previous penalties
                            histTable.push(this.formatPenaltyRow(penalty));
                            break;
                        }
                    }
                } else {
                    for (j = penalties.length - 1; j > -1; j--) { // add penalties
                        penalty = penalties[j];
                        if (penalty.time < this.history[i].timeEnd && penalty.time >= this.history[i + 1].timeEnd) {
                            histTable.unshift(this.formatPenaltyRow(penalty));
                        }
                    }
                }

                this.formatHistoryRow(this.history[i], histTable, mode, count - i, userId);

                for (j = penalties.length - 1; j > -1; j--) { // add penalties
                    penalty = penalties[j];
                    if (i == 0) {    // last game
                        if (penalty.time >= this.history[i].timeEnd) { // find next penalties
                            histTable.unshift(this.formatPenaltyRow(penalty));
                        }
                    }
                }
            }
            this.$container.append(this.historyView.render(mode, histTable, null, history && history.length == this.maxCount).$el);
        }
    };


    HistoryManager.prototype.onGameLoad = function (mode, game){
        console.log('history_manager;', 'game load', game, 'time:', Date.now() - this.startTime);
        var players = [], i, player;
        if (game) {
            this.client.setMode(mode);
            game.history = '[' + game.history + ']';
            game.history = game.history.replace(new RegExp('@', 'g'), ',');
            game.history = JSON.parse(game.history);
            game.initData = JSON.parse(game.initData);
            game.userData = JSON.parse(game.userData);
            game.isPlayer = false;
            for (i = 0; i < game.players.length; i++) {
                player = this.client.userList.createUser(game.userData[game.players[i]]);
                players.push(player);
                if (player.userId == this.userId) {
                    game.player = player;
                    if (player.userId == this.client.getPlayer().userId) {
                        game.isPlayer = true;
                    }
                }
            }
            if (players.length != players.length) throw new Error('UserData and players are different!');
            game.players = players;
            if (!game.winner){
                game.result = 'draw';
            } else {
                if (game.winner == game.player.userId){
                    game.result = 'win';
                } else {
                    game.result = 'lose';
                }
            }
            game.message = this.getResultMessages(game);

            game.initData.timeMode = game.initData.timeMode || 'reset_every_switch';
            game.initData.timeStartMode = game.initData.timeStartMode || 'after_switch';

            if (this.client.opts.newGameFormat){
                game.initData.first = getPlayer(game.initData.first);
                game.winner = getPlayer(game.winner);
                var current = game.initData.first,
                    times = {}, // contain users total time
                    history = [],
                    turnTime = game.initData.turnTime,
                    totalTime = 0;
                for (i = 0; i < game.history.length; i++){
                    history = history.concat(parseTurn(game.history[i]));
                    if (history[i] instanceof Turn || (history[i] instanceof GameEvent && history[i].event.type == 'timeout')){
                        // init user time
                        // userTurnTime - time remain for turn, userTime - time user turn
                        // clear first turn time; first turn time = turn time - round start time
                        if (game.initData.timeStartMode != 'after_round_start' && $.isEmptyObject(times)){
                            history[i].userTime = 0;
                        }
                        history[i].userTime = history[i].userTime || 0;
                        if (history[i].userTime != null){
                            totalTime += history[i].userTime;
                            if (game.initData.timeMode == 'dont_reset'){ // blitz
                                history[i].userTime = new Time((times[history[i].user.userId] || turnTime) - history[i].userTime || turnTime, turnTime);
                                history[i].userTotalTime = new Time(times[history[i].user.userId] || turnTime, turnTime);

                                // turn contain time for turn for next player
                                history[i].userTurnTime =  history[i].userTurnTime < 0 ? 0 : history[i].userTurnTime;
                                if (history[i].nextPlayer){
                                    times[history[i].nextPlayer.userId] = history[i].userTurnTime
                                } else {
                                    times[history[i].user.userId] = history[i].userTurnTime
                                }
                            } else {
                                times[history[i].user.userId] = times[history[i].user.userId] ? times[history[i].user.userId] + history[i].userTime : history[i].userTime;
                                history[i].userTotalTime = new Time(times[history[i].user.userId] || 0);
                                history[i].userTime = new Time(history[i].userTime);
                            }

                        }
                    }
                }
                game.roundTime = new Time(game.timeEnd - game.timeStart);
                game.totalTime = (totalTime ? new Time(totalTime) : game.roundTime);
                game.history = history;
            }
            console.log('history_manager;', 'game parsed', game);
            if (!window._isVk) {
                $('html, body').animate({
                    scrollTop: 0
                }, 500);
            }
        }
        if (!this.isCancel) this.emit('game_load', game);

        function getPlayer(id){
            for (var i = 0; i < players.length; i++){
                if (players[i].userId == id) return players[i];
            }
            return null;
        }

        function parseTurn(turn){
            // parse array of user turns
            if (turn.length){
                for (var j = 0; j < turn.length; j++){
                    turn[j] = parseTurn(turn[j]);
                }
            } else { // parse single user turn or game event
                if (turn.type || turn.action == 'timeout'){ // event
                    turn.user = getPlayer(turn.user) || undefined;
                    turn.nextPlayer = getPlayer(turn.nextPlayer) || undefined;
                    turn.target = getPlayer(turn.target) || undefined;
                    turn = new GameEvent(turn);
                } else { // turn
                    turn.nextPlayer = getPlayer(turn.nextPlayer) || undefined;
                    turn = new Turn(turn, current, turn.nextPlayer);
                }
                if (turn.nextPlayer){
                    current = turn.nextPlayer;
                }
            }

            return turn;
        }
    };


    HistoryManager.prototype.getResultMessages = function(game){
        var locale = this.client.locale['game']['resultMessages'], loser, winner, winnerId,
            message = {
                resultMessage: locale[game.result],
                resultComment: ""
            };
        if (game.result != 'draw'){
            if (game.isPlayer){
                if (game.result == 'lose'){
                    switch  (game.action){
                        case 'timeout': message.resultComment =  locale['playerTimeout']; break;
                        case 'user_leave': message.resultComment = locale['playerLeave']; break;
                        case 'throw': message.resultComment = locale['playerThrow']; break;
                    }
                } else { // win
                    switch (game.action) {
                        case 'timeout':
                            message.resultComment = locale['opponentTimeoutPre'] + locale['opponentTimeout'];
                            break;
                        case 'user_leave':
                            message.resultComment = locale['opponent'] + locale['opponentLeave'];
                            break;
                        case 'throw':
                            message.resultComment = locale['opponent'] + locale['opponentThrow'];
                            break;
                    }
                }
            } else{ // spectator
                winnerId = game.winner.userId || game.winner;
                winner = (winnerId == game.players[0].userId ? game.players[0] : game.players[1]);
                loser = (winnerId == game.players[0].userId ? game.players[1] : game.players[0]);
                message.resultMessage = locale['wins'] + winner.userName;

                switch (game.action) {
                    case 'timeout':
                        message.resultComment = locale['timeoutPre'] + loser.userName + locale['opponentTimeout'];
                        break;
                    case 'user_leave':
                        message.resultComment = loser.userName + locale['opponentLeave'];
                        break;
                    case 'throw':
                        message.resultComment = loser.userName + locale['opponentThrow'];
                        break;
                }
            }
        }
        return message;
    };


    HistoryManager.prototype.formatHistoryRow = function(hrow, history, mode, number, userId){
        var rows, row = {win:0, lose:0, id:hrow['_id'], number:number}, prev, userData = JSON.parse(hrow.userData), opponentId;
        //previous game
        if (history.length == 0) {
            rows = [];
            prev = null
        } else {
            rows = history[0];
            prev = rows[0];
        }
        opponentId =  userId == hrow.players[0]? hrow.players[1] : hrow.players[0];
        for (var i = 0; i < this.conf.columns.length; i++){
            var col = this.conf.columns[i];
            if (['date', 'opponent', 'time', 'number', 'elo'].indexOf(col.id) == -1){
                row[col.source] = userData[userId][mode][col.source];
            }
        }
        row.opponent = userData[opponentId];
        if (this.client.lang != 'ru'){
            row.opponent.userName = translit(row.opponent.userName);
        }
        row.date = formatDate(hrow.timeEnd);
        row.time = formatTime(hrow.timeEnd);
        // compute game score
        if (!hrow.winner) row.result = 'draw';
        else {
            if (hrow.winner == userId) {
                row.result = 'win';
                row.win++;
            } else {
                row.result = 'lose';
                row.lose++;
            }
        }
        if (prev && prev.date == row.date && prev.opponent.userId == row.opponent.userId){
            row.win += prev.win;
            row.lose += prev.lose;
        }
        row.gameScore = row.win + ':' + row.lose;
        //compute elo
        row.elo = {
            value:userData[userId][mode]['ratingElo']
        };
        row.rank = {};
        //TODO: dynamic columns
        row.elo.dynamic = prev ? row.elo.value - prev.elo.value : '';
        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){ // add new session game
            row.elo.diff = row.elo.dynamic||0;
            row.rank.before =  userData[userId][mode]['rank'];
            row.rank.after = row.rank.before;
            rows = [];
            rows.unshift(row);
            history.unshift([]);
            history[0] = rows
        } else {
            row.rank.before = prev.rank.before;
            row.rank.after = userData[userId][mode]['rank'];
            row.elo.diff = prev.elo.diff + row.elo.dynamic;
            rows.unshift(row);
        }
    };


    HistoryManager.prototype.formatPenaltyRow = function(penalty){
        var hpen = {
            penalty: true,
            time: penalty.time,
            date: formatDate(penalty.time),
            type: penalty.type,
            text: typeof this.client.opts.generatePenaltyText == "function" ? this.client.opts.generatePenaltyText(penalty) : (penalty.value < 0 ? 'штраф в ' : 'бонус в ') + Math.abs(penalty.value) + ' очков',
            value: penalty.value,
            elo: {value: penalty.ratingElo}
        };
        console.log(hpen);
        return hpen
    };


    HistoryManager.prototype.getHistory = function(mode){
        if (!this.client.isLogin) return;
        this.historyView.clearHistory();
        var gm = this.client.gameManager;
        if (this.client.gameManager.inGame()){
            var filter = gm.currentRoom.players[0].isPlayer ? gm.currentRoom.players[1].userName :  gm.currentRoom.players[0].userName;
            if (filter) this.historyView.setFilter(filter);
        }
        this.$container = (this.client.opts.blocks.historyId?$('#'+this.client.opts.blocks.historyId):$('body'));
        this.userId = this.client.getPlayer().userId;
        this._getHistory(mode, false);
        this.client.viewsManager.showPanel(this.historyView.$el);
    };

    HistoryManager.prototype.getProfileHistory = function(mode, userId, blockId){
        if (!this.client.isLogin) return;
        this.historyView.clearHistory();
        this.historyView.setFilter('');
        if (blockId) this.$container = $('#'+blockId);
        if (!this.$container) throw new Error('wrong history container id! ' + blockId);
        this.userId = userId;
        this._getHistory(mode, true);
        this.historyView.delegateEvents();
    };


    HistoryManager.prototype._getHistory = function(mode, hideClose, append){
        if (!append) {
            this.count = 0;
            this.history = [];
        }
        mode = mode || this.client.currentMode;
        this.$container.append(this.historyView.render(mode, false, hideClose).$el);
        var rq = {
            mode:   mode,
            userId: this.userId,
            count:  this.maxCount,
            offset: this.history.length,
            filter: this.historyView.getFilter()
        };
        if (this.client.opts.apiEnable) {
            this.client.get('history', rq, function(data){
                this.onHistoryLoad(data['mode'], data['history'], data['penalties'], data.userId);
            }.bind(this))
        } else {
            this.client.send('history_manager', 'history', 'server', rq);
        }
    };


    HistoryManager.prototype.getGame = function (id, userId, mode) {
        if (this.client.gameManager.inGame()){
            return;
        }
        if (this.client.gameManager.currentRoom){
            this.client.gameManager.leaveGame();
        }
        userId = userId || this.userId || this.client.getPlayer().userId;
        mode = mode || this.currentMode || this.client.currentMode;
        this.isCancel = false;
        if (this.client.opts.apiEnable) {
            this.client.get('history', { mode: mode, gameId: id, userId: userId }, function(data){
                this.onGameLoad(data.mode, data.game);
            }.bind(this))
        } else {
            this.client.send('history_manager', 'game', 'server', { mode: mode, id: id, userId: userId });
        }
        this.startTime = Date.now();
    };


    HistoryManager.prototype.close = function(){
      if (this.historyView){
          this.historyView.close();
      }
    };

    function formatDate(time) {
        var months = locale.months;
        var date = new Date(time);
        var day = date.getDate();
        var month = months[date.getMonth()];
        var year = date.getFullYear();
        if (day < 10) day = '0' + day;
        return day + " " + month + " "  + year;
    }

    function formatTime(time) {
        var date =  new Date(time);
        var h = date.getHours();
        var m = date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        return  h + ':' + m;
    }

   return HistoryManager;
});