define(['EE', 'views/history'], function(EE, HistoryView) {
    'use strict';

    var HistoryManager = function (client) {
        this.client = client;
        this.currentRoom = null;
        this.conf = {
            tabs:[],
            subTabs:[],
            columns:[
                {  id:'Date',       source:'date',      title:'Дата' },
                {  id:'Opponent',   source:'opponent',  title:'Противник' },
                {  id:'Time',       source:'time',      title:'Время'     },
                {  id:'Number',     source:'number',    title:'#' },
                {  id:'Elo',        source:'elo',       title:'Рейтинг', dynamic:true, startValue:1600 }
            ]
        };

        this.$container = (client.opts.blocks.historyId?$('#'+client.opts.blocks.historyId):$('body'));
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.init = function(conf){
        if (this.client.modes.length > 1)
            for (var i = 0 ; i < this.client.modes.length; i++)
                this.conf.tabs.push({id:this.client.modes[i], title:this.client.modes[i]});
        this.historyView = new HistoryView(this.conf);
    };


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': this.onHistoryLoad(data.mode, data.history); break;
        }
    };


    HistoryManager.prototype.onHistoryLoad = function (mode, history){
        console.log('history_manager;', 'history load', history);
        setTimeout(function(){
            if (!this.historyView.isClosed){
                var histTable = [];
                for (var i = history.length-1; i > -1; i--){
                    this.formatHistoryRow(history[i], histTable, mode, history.length - i);
                }
                this.$container.append(this.historyView.render(mode, histTable).$el);
            }
        }.bind(this),200);
    };


    HistoryManager.prototype.formatHistoryRow = function(hrow, history, mode, number){
        var rows, row = {win:0, lose:0, id:hrow.timeEnd, number:number}, prev, player = this.client.getPlayer(), userData = JSON.parse(hrow.userData), opponentId;
        //previous game
        if (history.length == 0) {
            rows = [];
            prev = null
        } else {
            rows = history[0];
            prev = rows[0];
        }
        opponentId =  player.userId == hrow.players[0]? hrow.players[1] : hrow.players[0];
        row.opponent = userData[opponentId];
        row.date = formatDate(hrow.timeStart);
        row.time = formatTime(hrow.timeStart);
        // compute game score
        if (!hrow.winner) row.result = 'draw';
        else {
            if (hrow.winner == player.userId) {
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
        row.score = row.win + ':' + row.lose;
        //compute elo
        row.elo = {
            value:userData[player.userId][mode]['ratingElo']
        };
        //TODO: dynamic columns
        row.elo.dynamic = prev ? row.elo.value - prev.elo.value : row.elo.value - 1600;

        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){
            row.elo.diff = row.elo.dynamic;
            rows = [];
            rows.unshift(row);
            history.unshift([]);
            history[0] = rows
        } else {
            row.elo.diff = prev.elo.diff + row.elo.dynamic;
            rows.unshift(row);
        }
    };


    HistoryManager.prototype.getHistory = function(mode){
        this.$container.append(this.historyView.render(false).$el);
        this.client.send('history_manager', 'history', 'server', {mode:mode||this.client.currentMode});
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