define(['EE', 'views/history'], function(EE, HistoryView) {
    'use strict';

    var HistoryManager = function (client) {
        this.client = client;
        this.conf = {
            tabs:[],
            subTabs:[],
            columns:[
                {  id:'date',       source:'date',      title:'Дата' },
                {  id:'opponent',   source:'opponent',  title:'Противник' },
                {  id:'time',       source:'time',      title:'Время'     },
                {  id:'number',     source:'number',    title:'#' },
                {  id:'elo',        source:'elo',       title:'Рейтинг', dynamic:true, startValue:1600 }
            ]
        };

        if (typeof client.opts.initHistory== "function") this.conf =  client.opts.initHistory(this.conf);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.historyId?$('#'+client.opts.blocks.historyId):$('body'));
        this.isCancel = false;
        this.userId = false;
        this.currentMode = false;
        this.maxCount = 100;
        this.count = 0;
        this.history = [];
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.init = function(conf){
        if (this.client.modes.length > 1)
            for (var i = 0 ; i < this.client.modes.length; i++)
                this.conf.tabs.push({id:this.client.modes[i], title: this.client.getModeAlias(this.client.modes[i])});
        this.historyView = new HistoryView(this.conf, this);
    };


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': this.onHistoryLoad(data.mode, data.history, data.userId); break;
            case 'game': this.onGameLoad(data.mode, data.game); break;
        }
    };


    HistoryManager.prototype.onHistoryLoad = function (mode, history, userId){
        console.log('history_manager;', 'history load', userId, history);
        setTimeout(function(){
            if (!this.historyView.isClosed){
                var histTable = [];
                this.userId = userId;
                this.currentMode = mode;
                this.history = this.history.concat(history);
                for (var i = this.history.length-1; i > -1; i--){
                    this.formatHistoryRow(this.history[i], histTable, mode, this.history.length - i, userId);
                }
                this.$container.append(this.historyView.render(mode, histTable, null, history && history.length == this.maxCount).$el);
            }
        }.bind(this),200);
    };


    HistoryManager.prototype.onGameLoad = function (mode, game){
        console.log('history_manager;', 'game load', game);
        //TODO initGame, gameManager
        game.history = '['+game.history+']';
        game.history = game.history.replace(new RegExp('@', 'g'),',');
        game.history = JSON.parse(game.history);
        game.initData = JSON.parse(game.initData);
        game.userData = JSON.parse(game.userData);
        var players = [];
        for (var i = 0; i < game.players.length; i++){
            players.push(this.client.userList.createUser(game.userData[game.players[i]]));
        }
        if (players.length != players.length) throw new Error('UserData and players are different!');
        game.players = players;
        console.log('history_manager;', 'game parsed', game);
        setTimeout(function(){
            if (!this.isCancel) this.emit('game_load', game);
        }.bind(this),200);
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
        row.date = formatDate(hrow.timeStart);
        row.time = formatTime(hrow.timeStart);
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

        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){
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


    HistoryManager.prototype.getHistory = function(mode, isUpdate, hideClose, append){
        if (!append) {
            this.count = 0;
            this.history = [];
        }
        if (!isUpdate) this.$container = (this.client.opts.blocks.historyId?$('#'+this.client.opts.blocks.historyId):$('body'));
        this.$container.append(this.historyView.render(mode||this.client.currentMode, false, hideClose).$el);
        this.client.send('history_manager', 'history', 'server', {
            mode:mode||this.client.currentMode,
            userId:(isUpdate?this.userId:false),
            count: this.maxCount,
            offset: this.history.length
        });
    };

    HistoryManager.prototype.getProfileHistory = function(mode, userId, blockId){
        this.history = [];
        if (blockId) this.$container = $('#'+blockId);
        if (!this.$container) throw new Error('wrong history container id! ' + blockId);
        this.$container.append(this.historyView.render(mode, false, true).$el);
        this.userId = userId;
        this.client.send('history_manager', 'history', 'server', {
            mode:mode||this.client.currentMode,
            userId:userId,
            count: this.maxCount,
            offset: this.history.length
        });
    };


    HistoryManager.prototype.getGame = function (id, userId, mode) {
        userId = userId || this.userId || this.client.getPlayer().userId;
        mode = mode || this.currentMode || this.client.currentMode;
        this.isCancel = false;
        this.client.send('history_manager', 'game', 'server', {mode:mode, id:id, userId: userId});
    };


    HistoryManager.prototype.close = function(){
      this.historyView.close();
    };

    function formatDate(time) {
        var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'сен', 'окт', 'ноя', 'дек'];
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

    HistoryManager.prototype.testHistory = [{"timeStart":1424080866344,"timeEnd":1424080868891,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":4,\"lose\":2,\"draw\":0,\"games\":6,\"rank\":1,\"ratingElo\":1627}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":2,\"draw\":0,\"games\":3,\"rank\":5,\"ratingElo\":1587}}}"},{"timeStart":1424080860196,"timeEnd":1424080862868,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":3,\"lose\":2,\"draw\":0,\"games\":5,\"rank\":3,\"ratingElo\":1613}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":1,\"draw\":0,\"games\":2,\"rank\":5,\"ratingElo\":1600}}}"},{"timeStart":1424080754813,"timeEnd":1424080762501,"players":["95120799727737","22050161915831"],"mode":"default","winner":"95120799727737","action":"game_over","userData":"{\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":3,\"ratingElo\":1615}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":2,\"draw\":0,\"games\":4,\"rank\":5,\"ratingElo\":1598}}}"},{"timeStart":1424080713717,"timeEnd":1424080715662,"players":["98637392232194","22050161915831"],"mode":"default","winner":"98637392232194","action":"game_over","userData":"{\"98637392232194\":{\"userId\":\"98637392232194\",\"userName\":\"us_98637392232194\",\"dateCreate\":1424080704161,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":1,\"ratingElo\":1616}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":1,\"draw\":0,\"games\":3,\"rank\":3,\"ratingElo\":1612}}}"},{"timeStart":1424080696911,"timeEnd":1424080698325,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":0,\"draw\":0,\"games\":2,\"rank\":1,\"ratingElo\":1627}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":3,\"draw\":0,\"games\":3,\"rank\":4,\"ratingElo\":1561}}}"},{"timeStart":1424080690059,"timeEnd":1424080692709,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":2,\"ratingElo\":1614}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":2,\"draw\":0,\"games\":2,\"rank\":4,\"ratingElo\":1573}}}"}]
    return HistoryManager;
});