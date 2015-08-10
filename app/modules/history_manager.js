define(['EE', 'views/history', 'instances/turn', 'instances/game_event'], function(EE, HistoryView, Turn, GameEvent) {
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
                {  id:'time',       source:'time',      title: locale.columns.time    },
                {  id:'number',     source:'number',    title: locale.columns.number },
                {  id:'elo',        source:'elo',       title: locale.columns.elo, dynamic:true, startValue:1600 }
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
        if (game) {
            game.history = '[' + game.history + ']';
            game.history = game.history.replace(new RegExp('@', 'g'), ',');
            game.history = JSON.parse(game.history);
            game.initData = JSON.parse(game.initData);
            game.userData = JSON.parse(game.userData);
            var players = [], i;
            for (i = 0; i < game.players.length; i++) {
                players.push(this.client.userList.createUser(game.userData[game.players[i]]));
            }
            if (players.length != players.length) throw new Error('UserData and players are different!');
            game.players = players;
            if (this.client.opts.newGameFormat){
                game.initData.first = getPlayer(game.initData.first);
                game.winner = getPlayer(game.winner);
                var current = game.initData.first,
                    history = [];
                for (i = 0; i < game.history.length; i++){
                    history = history.concat(parseTurn(game.history[i]))
                }
                game.history = history;
            }
            console.log('history_manager;', 'game parsed', game);

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
        //TODO: dynamic columns
        row.elo.dynamic = prev ? row.elo.value - prev.elo.value : '';
        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){ // add new session game
            row.elo.diff = row.elo.dynamic||0;
            rows = [];
            rows.unshift(row);
            history.unshift([]);
            history[0] = rows
        } else {
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
            text: typeof this.client.opts.generatePenaltyText == "function" ? this.client.opts.generatePenaltyText(penalty) : 'штраф в ' + Math.abs(penalty.value) + ' очков',
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
        this.client.send('history_manager', 'history', 'server', {
            mode:   mode,
            userId: this.userId,
            count:  this.maxCount,
            offset: this.history.length,
            filter: this.historyView.getFilter()
        });
    };


    HistoryManager.prototype.getGame = function (id, userId, mode) {
        userId = userId || this.userId || this.client.getPlayer().userId;
        mode = mode || this.currentMode || this.client.currentMode;
        this.isCancel = false;
        this.client.send('history_manager', 'game', 'server', {mode:mode, id:id, userId: userId});
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